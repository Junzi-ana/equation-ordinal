/**
 * 全文扫描器。
 *
 * 输入一篇 Markdown 全文，输出 "label 名 -> 编号" 的映射表。
 *
 * 编号只依赖源码顺序，与渲染顺序无关，因此滚动、增量渲染、
 * 反复重渲都不会串号。这是整个插件能用同步 render hook 实现的前提。
 *
 * 流程：
 *   1) computeMasks   标出需要整体跳过的区域（frontmatter / 代码块 / 行内代码 / HTML 注释）
 *   2) extractBlocks  一次线性扫描，提取 $$...$$ 与 $...$
 *   3) 逐块解析 \label / \ref，按源码顺序推进计数器
 *
 * 本模块不依赖 obsidian，可直接在 node 下测试。
 */

import type {
	Counter,
	ErrCode,
	LabelEntry,
	MathBlock,
	RefEntry,
	ScanError,
	ScanResult,
} from "./types.ts";
import {
	INITIAL_COUNTER,
	cloneCounter,
	formatCounter,
	parseCounter,
	step,
} from "./counter.ts";

// ---------------------------------------------------------------- 基础工具

interface Mask {
	start: number;
	end: number;
}

const LABEL_NAME_BAD_CHAR = /[\\{}$\s]/;

/** 计数器候选形态：只有整体符合这个形态的 [] 才会被当作计数器 */
const COUNTER_CANDIDATE = /^[0-9A-Za-z][0-9A-Za-z.]*$/;

function isLineStart(src: string, i: number): boolean {
	if (i === 0) return true;
	let j = i - 1;
	let spaces = 0;
	while (j >= 0 && src[j] === " " && spaces < 4) {
		j--;
		spaces++;
	}
	return j < 0 || src[j] === "\n";
}

function findFenceClose(
	src: string,
	from: number,
	ch: string,
	minLen: number,
): number {
	let i = from;
	for (;;) {
		const eol = src.indexOf("\n", i);
		const lineEnd = eol < 0 ? src.length : eol;
		const line = src.slice(i, lineEnd);
		const m = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
		if (m && m[1][0] === ch && m[1].length >= minLen) {
			return eol < 0 ? src.length : eol + 1;
		}
		if (eol < 0) return -1;
		i = eol + 1;
	}
}

function findBacktickClose(src: string, from: number, len: number): number {
	const needle = "`".repeat(len);
	let i = from;
	for (;;) {
		const idx = src.indexOf(needle, i);
		if (idx < 0) return -1;
		if (src[idx + len] === "`" || src[idx - 1] === "`") {
			i = idx + len;
			continue;
		}
		return idx + len;
	}
}

/** 需要整体跳过的区域 */
export function computeMasks(src: string): Mask[] {
	const masks: Mask[] = [];
	const n = src.length;
	let i = 0;

	// frontmatter
	if (
		src.startsWith("---") &&
		(src[3] === "\n" || (src[3] === "\r" && src[4] === "\n"))
	) {
		const re = /\n---[ \t]*(\r?\n|$)/g;
		re.lastIndex = 3;
		const m = re.exec(src);
		if (m) {
			const end = m.index + m[0].length;
			masks.push({ start: 0, end });
			i = end;
		}
	}

	while (i < n) {
		const ch = src[i];

		// fenced code block：只认行首
		if ((ch === "`" || ch === "~") && isLineStart(src, i)) {
			const fm = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(src.slice(i, i + 64));
			if (fm) {
				const mark = fm[1];
				const close = findFenceClose(src, i + fm[0].length, mark[0], mark.length);
				if (close > 0) {
					masks.push({ start: i, end: close });
					i = close;
					continue;
				}
			}
		}

		// 行内代码
		if (ch === "`") {
			let k = i;
			while (k < n && src[k] === "`") k++;
			const close = findBacktickClose(src, k, k - i);
			if (close > 0) {
				masks.push({ start: i, end: close });
				i = close;
				continue;
			}
			i = k;
			continue;
		}

		// HTML 注释
		if (ch === "<" && src.startsWith("<!--", i)) {
			const close = src.indexOf("-->", i + 4);
			if (close >= 0) {
				masks.push({ start: i, end: close + 3 });
				i = close + 3;
				continue;
			}
		}

		i++;
	}

	masks.sort((a, b) => a.start - b.start);
	return masks;
}

// ---------------------------------------------------------------- 数学块

/** 从 from 起找结束 $$，跳过 mask 区域 */
function findDisplayClose(src: string, from: number, masks: Mask[]): number {
	let i = from;
	let mi = 0;
	while (mi < masks.length && masks[mi].end <= i) mi++;
	while (i < src.length - 1) {
		if (mi < masks.length && i >= masks[mi].start && i < masks[mi].end) {
			i = masks[mi].end;
			continue;
		}
		const ch = src[i];
		if (ch === "\\") {
			i += 2;
			continue;
		}
		if (ch === "$" && src[i + 1] === "$") return i;
		i++;
	}
	return -1;
}

/** 从 from 起找结束 $，跳过 mask 区域 */
function findInlineClose(src: string, from: number, masks: Mask[]): number {
	if (from >= src.length) return -1;
	// 起始 $ 后不能是空白
	if (/\s/.test(src[from])) return -1;

	let i = from;
	let mi = 0;
	while (mi < masks.length && masks[mi].end <= i) mi++;
	while (i < src.length) {
		if (mi < masks.length && i >= masks[mi].start && i < masks[mi].end) {
			i = masks[mi].end;
			continue;
		}
		const ch = src[i];
		if (ch === "\\") {
			i += 2;
			continue;
		}
		if (ch === "\n") {
			// 空行终止行内公式
			let j = i + 1;
			while (
				j < src.length &&
				(src[j] === " " || src[j] === "\t" || src[j] === "\r")
			) {
				j++;
			}
			if (j >= src.length || src[j] === "\n") return -1;
			i++;
			continue;
		}
		if (ch === "$") {
			if (src[i + 1] === "$") return -1;
			if (/\s/.test(src[i - 1] ?? "")) {
				i++;
				continue;
			}
			return i;
		}
		i++;
	}
	return -1;
}

export function extractBlocks(src: string, masks: Mask[]): MathBlock[] {
	const blocks: MathBlock[] = [];
	const n = src.length;
	let i = 0;
	let mi = 0;

	while (i < n) {
		while (mi < masks.length && masks[mi].end <= i) mi++;
		if (mi < masks.length && i >= masks[mi].start && i < masks[mi].end) {
			i = masks[mi].end;
			continue;
		}

		if (src[i] === "\\") {
			i += 2;
			continue;
		}
		if (src[i] !== "$") {
			i++;
			continue;
		}

		if (src[i + 1] === "$") {
			const close = findDisplayClose(src, i + 2, masks);
			if (close < 0) {
				i += 2;
				continue;
			}
			blocks.push({
				kind: "display",
				start: i + 2,
				end: close,
				text: src.slice(i + 2, close),
			});
			i = close + 2;
			continue;
		}

		const close = findInlineClose(src, i + 1, masks);
		if (close < 0) {
			i++;
			continue;
		}
		blocks.push({
			kind: "inline",
			start: i + 1,
			end: close,
			text: src.slice(i + 1, close),
		});
		i = close + 1;
	}

	return blocks;
}

// ---------------------------------------------------------------- label / ref

interface RawLabel {
	name: string;
	offset: number;
	/** 紧跟的合法 [N] 候选 */
	counterRaw: string | null;
}

/**
 * 读取 \label{...} 之后可选的 [N]。
 *
 * 只有"同一行、且形如 3 / 4.2 / 5.1.10 / A.1"的方括号才算计数器；
 * 其余（例如 \label{x}[0,1]）视作公式正文，不吞掉。
 */
function readOptionalCounter(
	text: string,
	from: number,
): { raw: string; end: number } | null {
	let i = from;
	while (i < text.length && (text[i] === " " || text[i] === "\t")) i++;
	if (text[i] !== "[") return null;
	const close = text.indexOf("]", i + 1);
	if (close < 0) return null;
	const raw = text.slice(i + 1, close);
	if (!COUNTER_CANDIDATE.test(raw)) return null;
	return { raw, end: close + 1 };
}

function extractLabels(text: string, baseOffset: number): RawLabel[] {
	const out: RawLabel[] = [];
	const re = /\\label\s*\{([^{}]*)\}/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		const counter = readOptionalCounter(text, m.index + m[0].length);
		out.push({
			name: m[1].trim(),
			offset: baseOffset + m.index,
			counterRaw: counter ? counter.raw : null,
		});
	}
	return out;
}

function collectRefs(block: MathBlock, out: RefEntry[]): void {
	const re = /\\(?:eq)?ref\s*\{([^{}]*)\}/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(block.text)) !== null) {
		out.push({
			name: m[1].trim(),
			offset: block.start + m.index,
			inDisplay: block.kind === "display",
		});
	}
}

// ---------------------------------------------------------------- 行号

function computeLineStarts(src: string): number[] {
	const starts = [0];
	for (let i = 0; i < src.length; i++) {
		if (src[i] === "\n") starts.push(i + 1);
	}
	return starts;
}

function lineOf(starts: number[], offset: number): number {
	let lo = 0;
	let hi = starts.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (starts[mid] <= offset) lo = mid;
		else hi = mid - 1;
	}
	return lo + 1;
}

// ---------------------------------------------------------------- 主流程

export function scanDocument(src: string): ScanResult {
	const masks = computeMasks(src);
	const blocks = extractBlocks(src, masks);
	const lineStarts = computeLineStarts(src);

	const labels = new Map<string, LabelEntry>();
	const refs: RefEntry[] = [];
	const errors: ScanError[] = [];
	let counter: Counter = cloneCounter(INITIAL_COUNTER);
	let displayIndex = 0;
	let numberedBlocks = 0;

	const pushError = (code: ErrCode, name: string | undefined, offset: number): void => {
		errors.push({ code, name, offset, line: lineOf(lineStarts, offset) });
	};

	/** 登记"有错"的条目（不覆盖已有条目），让 \ref 能区分 E06 / E07 */
	const registerBad = (raw: RawLabel, blockIndex: number, code: ErrCode): void => {
		if (!raw.name || labels.has(raw.name)) return;
		labels.set(raw.name, {
			name: raw.name,
			number: null,
			blockIndex,
			offset: raw.offset,
			error: code,
		});
	};

	for (const block of blocks) {
		collectRefs(block, refs);

		// 行内公式：label 非法
		if (block.kind === "inline") {
			for (const raw of extractLabels(block.text, block.start)) {
				pushError("E01", raw.name, raw.offset);
				registerBad(raw, -1, "E01");
			}
			continue;
		}

		displayIndex++;
		const raws = extractLabels(block.text, block.start);
		if (raws.length === 0) continue;

		// 一个块多个 label：整块作废，不占号
		if (raws.length > 1) {
			for (const raw of raws) {
				pushError("E02", raw.name, raw.offset);
				registerBad(raw, displayIndex, "E02");
			}
			continue;
		}

		const raw = raws[0];

		if (!raw.name || LABEL_NAME_BAD_CHAR.test(raw.name)) {
			pushError("E04", raw.name, raw.offset);
			registerBad(raw, displayIndex, "E04");
			continue;
		}

		// 同名：首个生效，后来者报错且不占号
		if (labels.has(raw.name)) {
			pushError("E03", raw.name, raw.offset);
			continue;
		}

		if (raw.counterRaw !== null) {
			const parsed = parseCounter(raw.counterRaw);
			if (!parsed) {
				pushError("E05", raw.name, raw.offset);
				registerBad(raw, displayIndex, "E05");
				continue;
			}
			counter = parsed;
		} else {
			counter = step(counter).counter;
		}

		labels.set(raw.name, {
			name: raw.name,
			number: formatCounter(counter),
			blockIndex: displayIndex,
			offset: raw.offset,
		});
		numberedBlocks++;
	}

	// 第二遍：校验引用
	for (const ref of refs) {
		const entry = labels.get(ref.name);
		if (!entry) {
			ref.error = "E06";
			pushError("E06", ref.name, ref.offset);
		} else if (!entry.number) {
			ref.error = "E07";
			pushError("E07", ref.name, ref.offset);
		}
	}

	return { labels, refs, errors, counter, numberedBlocks };
}

export { extractLabels, readOptionalCounter };
