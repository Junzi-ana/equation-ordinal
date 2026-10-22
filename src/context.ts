/**
 * 渲染上下文：回答"当前正在渲染的是哪个文件、全文是什么"。
 *
 * 为什么需要：MathJax.tex2chtml(tex) 只有一个字符串参数，不告诉你来源文件，
 * 而编号依赖全文顺序，所以必须同步拿到全文。
 *
 * 同步来源优先级：
 *   1) 活动 MarkdownView 的 editor.getValue()（阅读视图下同样可用，且是同步的）
 *   2) 事件驱动预读的 textCache（file-open / modify 时异步读入）
 *
 * 拿不到就返回 null，渲染层会退化为"不编号"，
 * 绝不让 \label 原样漏给 MathJax。
 */

import { App, MarkdownView, TFile } from "obsidian";
import { scanDocument } from "./scanner.ts";
import type { ScanResult } from "./types.ts";

interface CacheEntry {
	path: string;
	len: number;
	head: string;
	tail: string;
	result: ScanResult;
}

export class DocContext {
	private cache: CacheEntry | null = null;
	private textCache = new Map<string, { text: string; at: number }>();

	constructor(private app: App) {}

	invalidate(): void {
		this.cache = null;
	}

	/** 预读全文，给阅读视图 / 无 editor 的场景兜底 */
	async prewarm(file: TFile): Promise<void> {
		const hit = this.textCache.get(file.path);
		if (hit && Date.now() - hit.at < 3000) return;
		try {
			const text = await this.app.vault.cachedRead(file);
			this.textCache.set(file.path, { text, at: Date.now() });
		} catch {
			/* 读不到就算了，渲染层会降级 */
		}
	}

	forget(path: string): void {
		this.textCache.delete(path);
	}

	/** 当前文件与其全文；任一缺失返回 null */
	snapshot(): { path: string; text: string | null } | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const file = view?.file ?? this.app.workspace.getActiveFile();
		if (!file) return null;

		let text: string | null = null;
		try {
			const editor = view?.editor as { getValue?: () => string } | undefined;
			if (editor && typeof editor.getValue === "function") {
				const value = editor.getValue();
				if (typeof value === "string") text = value;
			}
		} catch {
			/* editor 不可用，走缓存 */
		}

		if (text === null) {
			const hit = this.textCache.get(file.path);
			if (hit) text = hit.text;
		}

		return { path: file.path, text };
	}

	/** 扫描结果（带缓存） */
	get(): { path: string; result: ScanResult } | null {
		const snap = this.snapshot();
		if (!snap || snap.text === null) return null;

		const { path, text } = snap;
		const head = text.slice(0, 64);
		const tail = text.slice(-64);
		const c = this.cache;
		if (
			c &&
			c.path === path &&
			c.len === text.length &&
			c.head === head &&
			c.tail === tail
		) {
			return { path, result: c.result };
		}

		const result = scanDocument(text);
		this.cache = { path, len: text.length, head, tail, result };
		return { path, result };
	}

	/** 无视缓存重扫（供"刷新"命令使用） */
	refresh(): { path: string; result: ScanResult } | null {
		this.cache = null;
		return this.get();
	}
}
