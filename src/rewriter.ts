/**
 * TeX 改写器。
 *
 * 输入是即将交给 MathJax 的单个公式字符串，输出改写后的字符串。
 * 必须在同步上下文中完成，所以这里只做字符串操作，不读文件、不 await。
 *
 *   \label{name}[N]  ->  删除，并在正确位置插入 \tag{编号}
 *   \ref{name}       ->  \text{(编号)}      模板可配
 *   \eqref{name}     ->  同上
 *
 * 三个关键设计：
 *   1. label 可以写在公式的任意位置：先删掉，再在顶层末尾
 *      （或 align 类环境的 \end 之前）插入 \tag。
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

/** align 类环境：\tag 必须写在 \end{...} 之前 */
const TAIL_ENV_RE =
	/\\end\{(align\*?|alignat\*?|flalign\*?|gather\*?|equation\*?|multline\*?)\}[ \t]*$/;

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
 * 把 tag 插到不会让 MathJax 报错的位置：
 *   - 公式以 align 类环境结尾 -> 插到 \end{...} 之前（若紧跟 \\，插在 \\ 之前）
 *   - 其它（含 cases / aligned 作从属环境）-> 追加到顶层末尾
 *
 * 对 cases / aligned 这类从属环境，\tag 必须留在顶层，追加到末尾才合法。
 */
export function insertTag(tex: string, tag: string): string {
	const body = tex.replace(/\s+$/, "");
	if (!body) return tag;

	const m = TAIL_ENV_RE.exec(body);
	if (m) {
		const token = m[0].trim();
		const pos = body.length - token.length;
		const head = body.slice(0, pos);
		// 避免 tag 落到 \\ 之后产生的空行上
		const br = /\\\\[ \t]*$/.exec(head);
		if (br) {
			const p = pos - br[0].length;
			return body.slice(0, p) + tag + body.slice(p);
		}
		return head + tag + body.slice(pos);
	}

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
