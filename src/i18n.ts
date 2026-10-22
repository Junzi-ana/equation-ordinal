/**
 * 极简 i18n：只覆盖插件自己的 UI 文案（命令名、设置面板、Notice、错误说明）。
 *
 * 语言取自 Obsidian 的语言设置（localStorage.language）。
 * 单元测试跑在 node 里，没有 window，自动回落到英文。
 */

function currentLanguage(): string {
	if (typeof window === "undefined") return "en";
	try {
		return (window.localStorage.getItem("language") ?? "en").toLowerCase();
	} catch {
		return "en";
	}
}

export function isChinese(): boolean {
	return currentLanguage().startsWith("zh");
}

/** t("English text", "中文文本") */
export function t(english: string, chinese: string): string {
	return isChinese() ? chinese : english;
}
