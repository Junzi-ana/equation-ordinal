/**
 * Equation Ordinal
 *
 * 在 MathJax 收到 TeX 之前改写字符串：
 *   \label{name}[N]  ->  \tag{编号}
 *   \ref{name}       ->  \text{(编号)}
 *
 * 源文件永远不被修改，所以 LaTeX 编译、导出、复制都保持原样。
 */

import { MarkdownView, Notice, Plugin } from "obsidian";
import * as ObsidianNamespace from "obsidian";
import { DocContext } from "./context.ts";
import { describeError } from "./errors.ts";
import { t } from "./i18n.ts";
import { rewriteTex } from "./rewriter.ts";
import { DEFAULT_SETTINGS, EquationOrdinalSettingTab } from "./settings.ts";
import type { EquationOrdinalSettings } from "./settings.ts";
import type { ScanResult } from "./types.ts";

interface MathJaxLike {
	version?: string;
	tex2chtml?: (tex: string, ...rest: unknown[]) => unknown;
	startup?: { promise?: Promise<unknown> };
}

type Tex2Chtml = (tex: string, ...rest: unknown[]) => unknown;

const LOG = "[equation-ordinal]";

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => window.setTimeout(resolve, ms));

function signatureOf(result: ScanResult): string {
	const parts: string[] = [];
	for (const [name, entry] of result.labels) {
		parts.push(`${name}=${entry.number ?? "!"}`);
	}
	return parts.join("|");
}

function getWindowMathJax(): MathJaxLike | undefined {
	return (window as unknown as { MathJax?: MathJaxLike }).MathJax;
}

function getLoadMathJax(): (() => Promise<void>) | undefined {
	const ns = ObsidianNamespace as unknown as {
		loadMathJax?: () => Promise<void>;
	};
	return typeof ns.loadMathJax === "function"
		? ns.loadMathJax.bind(ObsidianNamespace)
		: undefined;
}

export default class EquationOrdinalPlugin extends Plugin {
	settings: EquationOrdinalSettings = { ...DEFAULT_SETTINGS };

	private ctx!: DocContext;
	private originalTex2chtml: Tex2Chtml | null = null;
	private signature = "";
	private errorSignature = "";
	private timer: number | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.ctx = new DocContext(this.app, () => this.settings.refreshDebounce);
		this.addSettingTab(new EquationOrdinalSettingTab(this.app, this));
		this.registerEvents();
		this.addCommands();

		// 不阻塞 Obsidian 启动：MathJax 首次加载可能要几百毫秒
		void this.installHook();

		const file = this.app.workspace.getActiveFile();
		if (file) void this.ctx.prewarm(file);
	}

	onunload(): void {
		if (this.timer !== null) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<EquationOrdinalSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	// -------------------------------------------------------------- 挂接 MathJax

	private async resolveMathJax(): Promise<MathJaxLike | null> {
		const load = getLoadMathJax();
		if (load) {
			try {
				await load();
			} catch (error) {
				console.warn(`${LOG} loadMathJax() failed`, error);
			}
		}

		let mj = getWindowMathJax();
		for (let i = 0; i < 40 && !mj; i++) {
			await sleep(100);
			mj = getWindowMathJax();
		}
		if (!mj) return null;

		try {
			await mj.startup?.promise;
		} catch {
			/* startup 失败也继续尝试 */
		}

		for (let i = 0; i < 30 && typeof mj.tex2chtml !== "function"; i++) {
			await sleep(100);
		}

		return mj;
	}

	private async installHook(): Promise<void> {
		const mj = await this.resolveMathJax();
		if (!mj) {
			console.warn(`${LOG} window.MathJax not found, plugin inactive`);
			return;
		}
		if (typeof mj.tex2chtml !== "function") {
			console.warn(
				`${LOG} MathJax.tex2chtml is unavailable (different Obsidian build?), plugin inactive`,
			);
			new Notice(
				t(
					"Equation Ordinal: could not hook MathJax, plugin is inactive. See the console.",
					"Equation Ordinal：无法挂接 MathJax，插件未生效。详见控制台。",
				),
				8000,
			);
			return;
		}

		this.hookMathJax(mj);
		if (this.settings.debug) {
			console.info(`${LOG} hooked MathJax ${mj.version ?? "?"}`);
		}

		// 首屏可能在本插件挂接之前就渲染完了，这里补一次
		this.requestRefresh(true);
	}

	private hookMathJax(mj: MathJaxLike): void {
		const original = mj.tex2chtml as Tex2Chtml;
		this.originalTex2chtml = original;
		const plugin = this;

		const patched: Tex2Chtml = function (
			this: unknown,
			tex: string,
			...rest: unknown[]
		): unknown {
			if (typeof tex !== "string") return original.apply(mj, [tex, ...rest]);

			let out = tex;
			try {
				const snap = plugin.ctx.get();
				if (snap) {
					out = rewriteTex(tex, snap.result, {
						refTemplate: plugin.settings.refTemplate,
						showErrors: plugin.settings.showErrorInMath,
					});
					if (plugin.settings.debug && out !== tex) {
						console.debug(`${LOG}\n  in : ${tex}\n  out: ${out}`);
					}
				}
			} catch (error) {
				console.error(`${LOG} rewrite failed, passing the TeX through`, error);
				out = tex;
			}

			const node = original.apply(mj, [out, ...rest]) as Node | undefined;

			if (node && node.nodeType === Node.ELEMENT_NODE) {
				try {
					const el = node as HTMLElement;
					// 记住原始 TeX，供"编号变化后局部重渲"使用
					el.setAttribute("data-eq-tex", tex);
					const opts = rest[0] as { display?: boolean } | undefined;
					if (opts && typeof opts.display === "boolean") {
						el.setAttribute("data-eq-display", String(opts.display));
					}
					if (out !== tex && /\[E\d{2}\]/.test(out)) {
						el.setAttribute("data-eq-error", "1");
					} else {
						el.removeAttribute("data-eq-error");
					}
				} catch {
					/* 属性写入失败不影响渲染 */
				}
			}

			return node;
		};

		mj.tex2chtml = patched;

		this.register(() => {
			const live = getWindowMathJax();
			if (live && live.tex2chtml === patched) {
				live.tex2chtml = original;
			}
		});
	}

	// -------------------------------------------------------------- 事件与命令

	private registerEvents(): void {
		this.registerEvent(
			this.app.workspace.on("editor-change", () => {
				this.ctx.invalidate();
				this.scheduleRefresh();
			}),
		);

		this.registerEvent(
			this.app.vault.on("modify", () => {
				this.ctx.invalidate();
				this.scheduleRefresh();
			}),
		);

		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				this.ctx.invalidate();
				// 建立基线，避免一打开文件就全量重渲
				const snap = this.ctx.get();
				this.signature = snap ? signatureOf(snap.result) : "";

				if (file) {
					// 阅读视图拿不到 editor 时靠这份缓存；读完后若编号表变了再补一次
					void this.ctx.prewarm(file).then(() => {
						this.ctx.invalidate();
						this.refresh(false);
					});
				}
			}),
		);

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.ctx.invalidate();
			}),
		);
	}

	private addCommands(): void {
		this.addCommand({
			id: "refresh-equations",
			name: t(
				"Rescan and refresh equation numbers",
				"重新扫描并刷新公式编号",
			),
			callback: () => {
				this.requestRefresh(true);
				new Notice(
					t(
						"Equation Ordinal: rescanning is done",
						"Equation Ordinal：已重新扫描当前文件",
					),
				);
			},
		});

		this.addCommand({
			id: "dump-label-table",
			name: t(
				"Print the label table to the console",
				"在控制台打印编号表",
			),
			callback: () => this.dumpTable(),
		});
	}

	private dumpTable(): void {
		const snap = this.ctx.refresh();
		if (!snap) {
			new Notice(
				t("Equation Ordinal: no active file", "Equation Ordinal：没有活动文件"),
			);
			return;
		}

		const rows: Record<string, string>[] = [];
		for (const [name, entry] of snap.result.labels) {
			rows.push({
				label: name,
				number: entry.number ?? `ERR(${entry.error ?? "?"})`,
				block: String(entry.blockIndex),
			});
		}

		if (rows.length === 0) {
			new Notice(
				t(
					"Equation Ordinal: no \\label in this file",
					"Equation Ordinal：当前文件没有 \\label",
				),
			);
		} else {
			console.table(rows);
			const preview = rows
				.slice(0, 8)
				.map((row) => `${row.label} -> (${row.number})`)
				.join("\n");
			const more = rows.length > 8 ? t("\n... (see console)", "\n……（完整列表见控制台）") : "";
			new Notice(
				`${t(`${rows.length} labels`, `${rows.length} 个 label`)}:\n${preview}${more}`,
				10000,
			);
		}

		for (const error of snap.result.errors) {
			const suffix = error.name ? ` (${error.name})` : "";
			console.error(
				`${LOG} ${error.code} ${snap.path}:${error.line} ${describeError(error.code)}${suffix}`,
			);
		}
	}

	// -------------------------------------------------------------- 刷新

	requestRefresh(force = false): void {
		if (this.timer !== null) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}
		this.refresh(force);
	}

	private scheduleRefresh(): void {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => {
			this.timer = null;
			this.refresh(false);
		}, this.settings.refreshDebounce);
	}

	/** 错误只报一次，避免每次键入都刷屏 */
	private reportErrors(path: string, result: ScanResult): void {
		const signature = result.errors
			.map((error) => `${error.code}@${error.line}:${error.name ?? ""}`)
			.join("|");
		if (signature === this.errorSignature) return;
		this.errorSignature = signature;
		if (!signature) return;

		for (const error of result.errors) {
			const suffix = error.name ? ` (${error.name})` : "";
			console.error(
				`${LOG} ${error.code} ${path}:${error.line} ${describeError(error.code)}${suffix}`,
			);
		}
	}

	private refresh(force: boolean): void {
		const snap = this.ctx.refresh();
		if (!snap) return;

		this.reportErrors(snap.path, snap.result);

		const sig = signatureOf(snap.result);
		if (!force && sig === this.signature) return;
		this.signature = sig;

		if (!force && !this.settings.refreshOnChange) return;

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;

		if (view.getMode() === "preview") {
			try {
				const preview = view.previewMode as unknown as {
					rerender?: (full?: boolean) => void;
				};
				preview.rerender?.(true);
			} catch (error) {
				console.warn(`${LOG} reading view rerender failed`, error);
			}
			return;
		}

		this.rerenderInLivePreview(view);
	}

	private rerenderInLivePreview(view: MarkdownView): void {
		const mj = getWindowMathJax();
		if (!mj || typeof mj.tex2chtml !== "function") return;

		const nodes = Array.from(
			view.containerEl.querySelectorAll<HTMLElement>(
				"mjx-container[data-eq-tex]",
			),
		);

		for (const old of nodes) {
			const tex = old.getAttribute("data-eq-tex");
			if (tex === null) continue;
			const display = old.getAttribute("data-eq-display");

			try {
				const fresh = (
					display === null
						? mj.tex2chtml(tex)
						: mj.tex2chtml(tex, { display: display === "true" })
				) as HTMLElement | undefined;

				if (!fresh || fresh.nodeType !== Node.ELEMENT_NODE) continue;

				// 只替换内部，保留 mjx-container 自身（CodeMirror widget 持有这个引用）
				old.replaceChildren(...Array.from(fresh.childNodes));
			} catch (error) {
				console.warn(`${LOG} partial rerender failed`, error);
				break;
			}
		}
	}
}
