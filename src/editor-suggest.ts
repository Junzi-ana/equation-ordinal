import { ViewPlugin, ViewUpdate } from "@codemirror/view";
import { EditorSuggest, TFile, editorInfoField } from "obsidian";
import type {
	App,
	Editor,
	EditorPosition,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
} from "obsidian";
import type { DocContext } from "./context.ts";
import type { LabelEntry } from "./types.ts";

/** 光标前文本匹配 \ref{ / \eqref{ / \label{，捕获花括号内已输入部分（到光标为止） */
const TRIGGER_RE = /\\(?:eq)?ref\s*\{([^{}]*)$|\\label\s*\{([^{}]*)$/;

/**
 * 光标位于 \ref{} / \eqref{} / \label{} 花括号内部时，
 * 列出当前文件所有已建立的 label；输入后按包含关系过滤。
 *
 * 框架默认只在按键时调 onTrigger，纯光标移动（点击/方向键）不会触发；
 * cursorWatcher() 补一个 CM6 视图插件：选区或文档一变化就检查一次。
 * 用 openSig 去重：同一上下文不重复弹，Esc 关闭后光标不动不会立刻重弹。
 */
export class LabelSuggest extends EditorSuggest<LabelEntry> {
	private ctx: DocContext;
	private openSig = "";

	constructor(app: App, ctx: DocContext) {
		super(app);
		this.ctx = ctx;
	}

	/** CM6 扩展：选区/文档变化时检查光标位置（随 registerEditorExtension 注册，卸载自动清理） */
	cursorWatcher() {
		const self = this;
		return ViewPlugin.fromClass(
			class {
				update(update: ViewUpdate) {
					if (!update.selectionSet && !update.docChanged) return;
					const info = update.view.state.field(editorInfoField, false);
					if (info?.editor) self.handleCursorActivity(info.editor, info.file);
				}
			},
		);
	}

	private handleCursorActivity(editor: Editor, file: TFile | null): void {
		if (!file) {
			// 拿不到所属文件（异常场景）就不弹
			if (this.openSig) {
				this.openSig = "";
				this.close();
			}
			return;
		}
		const cursor = editor.getCursor();
		const trigger = this.onTrigger(cursor, editor, file);
		if (!trigger) {
			if (this.openSig) {
				this.openSig = "";
				this.close();
			}
			return;
		}
		const sig = `${file.path}:${trigger.start.line}:${trigger.start.ch}:${trigger.query}`;
		if (sig === this.openSig) return;
		this.openSig = sig;
		this.context = {
			editor,
			file,
			start: trigger.start,
			end: trigger.end,
			query: trigger.query,
		};
		this.open();
	}

	getSuggestions(
		context: EditorSuggestContext,
	): LabelEntry[] | Promise<LabelEntry[]> {
		const snap = this.ctx.get();
		if (!snap) return [];
		const q = context.query;
		const results: LabelEntry[] = [];
		for (const entry of snap.result.labels.values()) {
			if (q && !entry.name.includes(q)) continue;
			results.push(entry);
		}
		return results;
	}

	renderSuggestion(entry: LabelEntry, el: HTMLElement): void {
		el.createSpan({ text: entry.name, cls: "eq-suggest-name" });
		if (entry.number) {
			el.createSpan({ text: entry.number, cls: "eq-suggest-number" });
		}
	}

	selectSuggestion(entry: LabelEntry, evt: MouseEvent | KeyboardEvent): void {
		const { editor, start, end } = this.context!;
		editor.replaceRange(entry.name, start, end);
		editor.setCursor(end.line, start.ch + entry.name.length);
	}

	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
		file: TFile | null,
	): EditorSuggestTriggerInfo | null {
		const upto = editor.getLine(cursor.line).slice(0, cursor.ch);
		const m = TRIGGER_RE.exec(upto);
		if (!m) return null;
		const captured = m[1] ?? m[2];
		const snap = this.ctx.get();
		if (!snap || snap.result.labels.size === 0) return null;
		return {
			start: { line: cursor.line, ch: cursor.ch - captured.length },
			end: cursor,
			query: captured,
		};
	}
}
