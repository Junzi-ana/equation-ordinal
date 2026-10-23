import { getLanguage } from "obsidian";

/**
 * 极简 i18n：只覆盖插件自己的 UI 文案（命令名、设置面板、Notice、错误说明）。
 *
 * 语言取自 Obsidian 界面语言（getLanguage()）。单元测试跑在 node 里，
 * 没有 Obsidian 运行时会抛错，自动回落到英文。
 */

function currentLanguage(): string {
	try {
		return getLanguage().toLowerCase();
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
