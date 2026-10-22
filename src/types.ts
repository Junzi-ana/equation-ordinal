/**
 * 共享类型。
 *
 * 本文件以及 counter / scanner / rewriter 都不依赖 obsidian，
 * 因此可以在纯 node 环境下直接跑单元测试。
 */

export type ErrCode =
	/** \label 出现在行内 $...$ */
	| "E01"
	/** 一个 $$ 块内出现多个 \label */
	| "E02"
	/** label 名重复 */
	| "E03"
	/** label 名为空或含非法字符 */
	| "E04"
	/** 计数器 [N] 不合法 */
	| "E05"
	/** \ref 指向未定义的 label */
	| "E06"
	/** \ref 指向本身有错的 label */
	| "E07";

/** 编号计数器：prefix 含末尾的小数点，例如 { prefix: "5.1.", last: 11 } */
export interface Counter {
	prefix: string;
	last: number;
}

export interface LabelEntry {
	/** label 名 */
	name: string;
	/** 分配到的编号，如 "5.1.11"；null 表示该条目有错 */
	number: string | null;
	/** 第几个 $$ 块（从 1 起）；行内错误为 -1 */
	blockIndex: number;
	/** 在全文中的偏移，用于报错定位 */
	offset: number;
	/** 该条目自身携带的错误 */
	error?: ErrCode;
}

export interface RefEntry {
	name: string;
	offset: number;
	inDisplay: boolean;
	error?: ErrCode;
}

export interface ScanError {
	code: ErrCode;
	name?: string;
	offset: number;
	/** 1-based 行号 */
	line: number;
}

export interface ScanResult {
	/** 名字 -> 条目。迭代顺序即源码顺序。 */
	labels: Map<string, LabelEntry>;
	refs: RefEntry[];
	errors: ScanError[];
	/** 扫描结束时的计数器 */
	counter: Counter;
	/** 带有效 label 的行间公式块数 */
	numberedBlocks: number;
}

export type MathBlockKind = "display" | "inline";

export interface MathBlock {
	kind: MathBlockKind;
	/** 内容起点（不含 $ 定界符） */
	start: number;
	/** 内容终点（不含 $ 定界符） */
	end: number;
	text: string;
}
