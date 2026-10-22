import { App, PluginSettingTab, Setting } from "obsidian";
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

export class EquationOrdinalSettingTab extends PluginSettingTab {
	plugin: EquationOrdinalPlugin;

	constructor(app: App, plugin: EquationOrdinalPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h3", { text: "Equation Ordinal" });

		new Setting(containerEl)
			.setName(t("Reference template", "引用模板"))
			.setDesc(
				t(
					"How \\ref expands. {n} is replaced by the number. Default: ({n}).",
					"\\ref 展开成什么。{n} 会被替换成编号，默认 ({n})。",
				),
			)
			.addText((text) =>
				text
					.setPlaceholder("({n})")
					.setValue(this.plugin.settings.refTemplate)
					.onChange(async (value) => {
						this.plugin.settings.refTemplate = value || "({n})";
						await this.plugin.saveSettings();
						this.plugin.requestRefresh(true);
					}),
			);

		new Setting(containerEl)
			.setName(t("Show error codes in formulas", "在公式内显示错误码"))
			.setDesc(
				t(
					"When off, an invalid spot shows a single question mark instead. Details still go to the console.",
					"关闭后错误处只显示一个 ?，详细信息仍然写入控制台。",
				),
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showErrorInMath)
					.onChange(async (value) => {
						this.plugin.settings.showErrorInMath = value;
						await this.plugin.saveSettings();
						this.plugin.requestRefresh(true);
					}),
			);

		new Setting(containerEl)
			.setName(t("Refresh when numbering changes", "编号变化时自动刷新"))
			.setDesc(
				t(
					"Re-render already displayed formulas when inserting one shifts the ones after it. Turn off to reduce flicker.",
					"在文档中插入新公式导致后续编号变化时，主动重渲已显示的公式。关闭可减少闪烁。",
				),
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.refreshOnChange)
					.onChange(async (value) => {
						this.plugin.settings.refreshOnChange = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t("Refresh debounce", "刷新防抖"))
			.setDesc(
				t(
					"How long to wait after typing stops, in milliseconds.",
					"编辑停止多久后触发刷新（毫秒）。",
				),
			)
			.addText((text) =>
				text
					.setPlaceholder("400")
					.setValue(String(this.plugin.settings.refreshDebounce))
					.onChange(async (value) => {
						const n = Number(value);
						if (Number.isFinite(n) && n >= 0) {
							this.plugin.settings.refreshDebounce = Math.min(
								5000,
								Math.max(0, Math.round(n)),
							);
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName(t("Debug log", "调试日志"))
			.setDesc(
				t(
					"Print every TeX rewrite (before / after) to the console.",
					"在控制台打印每次 TeX 改写的前后对比。",
				),
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.debug).onChange(async (value) => {
					this.plugin.settings.debug = value;
					await this.plugin.saveSettings();
				}),
			);

		containerEl.createEl("h4", { text: t("Syntax", "语法") });
		const help = containerEl.createEl("div", {
			cls: "setting-item-description",
		});

		help.createEl("p", {
			text: t(
				"Declare a label inside a display block; the optional [N] resets the counter:",
				"在行间公式（$$...$$）里声明 label；可选的 [N] 用来重置计数器：",
			),
		});
		help.createEl("pre", {
			text: "$$\n\\mathrm{d}Y_t = Z_t\\,\\mathrm{d}W_t \\label{eq:bsde}[5.1.10]\n$$",
		});

		help.createEl("p", {
			text: t(
				"Reference it from inline or display math; it expands to (5.1.10):",
				"在行内或行间公式里引用，会展开成 (5.1.10)：",
			),
		});
		help.createEl("pre", { text: "由 $\\ref{eq:bsde}$ 可得……" });
	}
}
