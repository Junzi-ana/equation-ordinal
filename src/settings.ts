import {
	App,
	PluginSettingTab,
	type SettingDefinitionItem,
} from "obsidian";
import type EquationOrdinalPlugin from "./main.ts";
import { t } from "./i18n.ts";

export interface EquationOrdinalSettings {
	/** \ref 的显示模板，{n} 会被替换成编号 */
	refTemplate: string;
	/** 是否在公式内用红字显示错误码 */
	showErrorInMath: boolean;
	/** 编号变化时是否自动刷新已渲染的公式 */
	refreshOnChange: boolean;
	/** 刷新防抖（毫秒） */
	refreshDebounce: number;
	/** 控制台打印改写过程 */
	debug: boolean;
}

export const DEFAULT_SETTINGS: EquationOrdinalSettings = {
	refTemplate: "({n})",
	showErrorInMath: true,
	refreshOnChange: true,
	refreshDebounce: 400,
	debug: false,
};

/**
 * 声明式设置页（Obsidian 1.13+）：定义一次，框架负责渲染与设置搜索索引。
 * 读写经 getControlValue / setControlValue 落到 plugin.settings。
 */
export class EquationOrdinalSettingTab extends PluginSettingTab {
	plugin: EquationOrdinalPlugin;

	constructor(app: App, plugin: EquationOrdinalPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: t("Reference template", "引用模板"),
				desc: t(
					"How \\ref expands. {n} is replaced by the number. Default: ({n}).",
					"\\ref 展开成什么。{n} 会被替换成编号，默认 ({n})。",
				),
				control: {
					type: "text",
					key: "refTemplate",
					placeholder: "({n})",
					defaultValue: "({n})",
					validate: (value: string) => {
						if (value.includes("{n}")) return;
						return t('The template must contain "{n}".', "模板必须包含 {n}。");
					},
				},
			},
			{
				name: t("Show error codes in formulas", "在公式内显示错误码"),
				desc: t(
					"When off, an invalid spot shows a single question mark instead. Details still go to the console.",
					"关闭后错误处只显示一个 ?，详细信息仍然写入控制台。",
				),
				control: {
					type: "toggle",
					key: "showErrorInMath",
					defaultValue: true,
				},
			},
			{
				name: t("Refresh when numbering changes", "编号变化时自动刷新"),
				desc: t(
					"Re-render already displayed formulas when inserting one shifts the ones after it. Turn off to reduce flicker.",
					"在文档中插入新公式导致后续编号变化时，主动重渲已显示的公式。关闭可减少闪烁。",
				),
				control: {
					type: "toggle",
					key: "refreshOnChange",
					defaultValue: true,
				},
			},
			{
				name: t("Refresh debounce", "刷新防抖"),
				desc: t(
					"How long to wait after typing stops, in milliseconds.",
					"编辑停止多久后触发刷新（毫秒）。",
				),
				control: {
					type: "number",
					key: "refreshDebounce",
					placeholder: "400",
					defaultValue: 400,
					min: 0,
					max: 5000,
					step: 1,
					validate: (value: number) => {
						if (Number.isFinite(value) && value >= 0 && value <= 5000) return;
						return t(
							"Enter a number between 0 and 5000.",
							"请输入 0 到 5000 之间的数字。",
						);
					},
				},
			},
			{
				name: t("Debug log", "调试日志"),
				desc: t(
					"Print every TeX rewrite (before / after) to the console.",
					"在控制台打印每次 TeX 改写的前后对比。",
				),
				control: {
					type: "toggle",
					key: "debug",
					defaultValue: false,
				},
			},
		];
	}

	/** 持久化用户改动；模板与错误码开关影响渲染，改完立即重绘 */
	async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.plugin.settings as unknown as Record<string, unknown>;
		settings[key] =
			key === "refreshDebounce" ? Math.round(Number(value)) : value;
		await this.plugin.saveSettings();
		if (key === "refTemplate" || key === "showErrorInMath") {
			this.plugin.requestRefresh(true);
		}
	}
}
