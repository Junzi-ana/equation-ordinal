/**
 * TeX 改写器。
 *
 * 输入是即将交给 MathJax 的单个公式字符串，输出改写后的字符串。
 * 必须在同步上下文中完成，所以这里只做字符串操作，不读文件、不 await。
 *
 *   \label{name}[N]  ->  删除，并把 \tag{编号} 追加到公式末尾
 *   \ref{name}       ->  \text{(编号)}      模板可配
 *   \eqref{name}     ->  同上
 *
 * 三个关键设计：
 *   1. label 可以写在公式的任意位置：先删掉，再追加到顶层末尾。
 *      MathJax 下 \tag 写在 \end{align} 之后（环境外）会渲染在整个
 *      多行块的中间右侧；写进环境末尾反而会被算到最后一行。
 *   2. 手写 \tag 一律先删除（label 优先）。
 *   3. 幂等：源文件不变，每次渲染都从原始 TeX 出发改写。
 */

import type { ErrCode, ScanResult } from "./types.ts";

export interface RewriteOptions {
	/** 例如 "({n})"，{n} 会被替换成编号 */
	refTemplate: string;
	/** 是否把错误显示成红字 [E0x] */
	showErrors: boolean;
}

export const DEFAULT_REWRITE_OPTIONS: RewriteOptions = {
	refTemplate: "({n})",
	showErrors: true,
};

/** 出现这些才值得深处理 */
const FAST = /\\(?:label|ref|eqref)\b/;
const TAG_RE = /\\tag\*?\s*\{[^{}]*\}/g;
const LABEL_RE = /\\label\s*\{([^{}]*)\}/g;
const COUNTER_CANDIDATE = /^[0-9A-Za-z][0-9A-Za-z.]*$/;

function errorTex(code: ErrCode, show: boolean): string {
	if (!show) return "\\text{?}";
	return `\\color{red}{\\text{[${code}]}}`;
}

function refTex(number: string, template: string): string {
	const body = template.includes("{n}")
		? template.split("{n}").join(number)
		: `(${number})`;
	return `\\text{${body}}`;
}

/**
 * 删除所有 \label{...}（连同紧跟的合法 [N]），返回剩余 TeX 与被删掉的名字。
 * 只有形如 3 / 4.2 / 5.1.10 / A.1 的方括号才会一起删，避免误伤 \label{x}[0,1]。
 */
export function stripLabels(tex: string): { tex: string; names: string[] } {
	if (!tex.includes("\\label")) return { tex, names: [] };

	const names: string[] = [];
	let out = "";
	let cursor = 0;
	const re = new RegExp(LABEL_RE.source, "g");
	let m: RegExpExecArray | null;

	while ((m = re.exec(tex)) !== null) {
		out += tex.slice(cursor, m.index);
		cursor = m.index + m[0].length;
		names.push(m[1].trim());

		let j = cursor;
		while (j < tex.length && (tex[j] === " " || tex[j] === "\t")) j++;
		if (tex[j] === "[") {
			const close = tex.indexOf("]", j + 1);
			if (close > 0) {
				const raw = tex.slice(j + 1, close);
				if (!raw.includes("\n") && COUNTER_CANDIDATE.test(raw)) {
					cursor = close + 1;
				}
			}
		}
	}

	out += tex.slice(cursor);
	return { tex: out, names };
}

/**
 * 把 tag 追加到公式顶层末尾。
 *
 * 不要插进 \end{align} 之前：MathJax 会把环境内的 \tag 算到最后一个
 * 行上（tag 跑到最后一行右侧）；而 \end{align} 之后（环境外）的 \tag
 * 会渲染在整个多行块的中间右侧，与手写 \tag 的行为一致。
 */
export function insertTag(tex: string, tag: string): string {
	const body = tex.replace(/\s+$/, "");
	if (!body) return tag;
	return body + tag;
}

export function rewriteTex(
	tex: string,
	table: ScanResult | null,
	options: Partial<RewriteOptions> = {},
): string {
	if (!table) return tex;
	if (!FAST.test(tex)) return tex;

	const opt: RewriteOptions = { ...DEFAULT_REWRITE_OPTIONS, ...options };
	let out = tex;

	// 1) 引用
	out = out.replace(/\\(?:eq)?ref\s*\{([^{}]*)\}/g, (_whole, rawName: string) => {
		const name = rawName.trim();
		const entry = table.labels.get(name);
		if (entry && entry.number) return refTex(entry.number, opt.refTemplate);
		if (entry && !entry.number) return errorTex("E07", opt.showErrors);
		return errorTex("E06", opt.showErrors);
	});

	// 2) 剥离 label（连同可选的 [N]）
	const stripped = stripLabels(out);
	out = stripped.tex;
	if (stripped.names.length === 0) return out;

	// label 优先：手写 tag 一律删除
	out = out.replace(TAG_RE, "");

	// 3) 一个块多个 label
	if (stripped.names.length > 1) {
		return insertTag(out, errorTex("E02", opt.showErrors));
	}

	const name = stripped.names[0];
	const entry = table.labels.get(name);

	// 表里没有：通常意味着 \label 落在行内公式里
	if (!entry) return insertTag(out, errorTex("E01", opt.showErrors));

	// 条目本身有错（E01 / E02 / E04 / E05）
	if (!entry.number) {
		return insertTag(out, errorTex(entry.error ?? "E01", opt.showErrors));
	}

	return insertTag(out, `\\tag{${entry.number}}`);
}
