import { t } from "./i18n.ts";
import type { ErrCode } from "./types.ts";

/** [英文, 中文] */
const MESSAGES: Record<ErrCode, [string, string]> = {
	E01: [
		"\\label is only allowed inside a $$...$$ block",
		"\\label 只能写在 $$...$$ 行间公式里",
	],
	E02: [
		"a $$ block can hold at most one \\label",
		"一个 $$ 块内只能有一个 \\label",
	],
	E03: [
		"duplicate label name; the first occurrence wins",
		"label 名重复，首个生效",
	],
	E04: [
		"invalid label name: must be non-empty and free of { } \\ $ and whitespace",
		"\\label 名称非法：不能为空，且不能包含 { } \\ $ 或空白",
	],
	E05: [
		"invalid counter: the last segment must be a number, e.g. 3, 4.2, 5.1.10, A.1",
		"计数器 [N] 不合法：最后一段必须是数字，例如 3、4.2、5.1.10、A.1",
	],
	E06: [
		"\\ref points to an undefined label",
		"\\ref 指向了未定义的 label",
	],
	E07: [
		"\\ref points to a label that is itself invalid",
		"\\ref 指向的 label 本身有错误",
	],
};

export function describeError(code: ErrCode): string {
	const [english, chinese] = MESSAGES[code];
	return t(english, chinese);
}
