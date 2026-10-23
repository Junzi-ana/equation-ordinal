"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => EquationOrdinalPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian5 = require("obsidian");
var ObsidianNamespace = __toESM(require("obsidian"), 1);

// src/context.ts
var import_obsidian = require("obsidian");

// src/counter.ts
var INITIAL_COUNTER = { prefix: "", last: 0 };
var COUNTER_RE = /^([0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*\.)?(\d+)$/;
function parseCounter(raw) {
  const m = COUNTER_RE.exec(raw);
  if (!m) return null;
  return { prefix: m[1] ?? "", last: parseInt(m[2], 10) };
}
function step(counter) {
  const next = { prefix: counter.prefix, last: counter.last + 1 };
  return { counter: next, number: formatCounter(next) };
}
function formatCounter(c) {
  return c.prefix + String(c.last);
}
function cloneCounter(c) {
  return { prefix: c.prefix, last: c.last };
}

// src/scanner.ts
var LABEL_NAME_BAD_CHAR = /[\\{}$\s]/;
var COUNTER_CANDIDATE = /^[0-9A-Za-z][0-9A-Za-z.]*$/;
function isLineStart(src, i) {
  if (i === 0) return true;
  let j = i - 1;
  let spaces = 0;
  while (j >= 0 && src[j] === " " && spaces < 4) {
    j--;
    spaces++;
  }
  return j < 0 || src[j] === "\n";
}
function findFenceClose(src, from, ch, minLen) {
  let i = from;
  for (; ; ) {
    const eol = src.indexOf("\n", i);
    const lineEnd = eol < 0 ? src.length : eol;
    const line = src.slice(i, lineEnd);
    const m = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
    if (m && m[1][0] === ch && m[1].length >= minLen) {
      return eol < 0 ? src.length : eol + 1;
    }
    if (eol < 0) return -1;
    i = eol + 1;
  }
}
function findBacktickClose(src, from, len) {
  const needle = "`".repeat(len);
  let i = from;
  for (; ; ) {
    const idx = src.indexOf(needle, i);
    if (idx < 0) return -1;
    if (src[idx + len] === "`" || src[idx - 1] === "`") {
      i = idx + len;
      continue;
    }
    return idx + len;
  }
}
function computeMasks(src) {
  const masks = [];
  const n = src.length;
  let i = 0;
  if (src.startsWith("---") && (src[3] === "\n" || src[3] === "\r" && src[4] === "\n")) {
    const re = /\n---[ \t]*(\r?\n|$)/g;
    re.lastIndex = 3;
    const m = re.exec(src);
    if (m) {
      const end = m.index + m[0].length;
      masks.push({ start: 0, end });
      i = end;
    }
  }
  while (i < n) {
    const ch = src[i];
    if ((ch === "`" || ch === "~") && isLineStart(src, i)) {
      const fm = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(src.slice(i, i + 64));
      if (fm) {
        const mark = fm[1];
        const close = findFenceClose(src, i + fm[0].length, mark[0], mark.length);
        if (close > 0) {
          masks.push({ start: i, end: close });
          i = close;
          continue;
        }
      }
    }
    if (ch === "`") {
      let k = i;
      while (k < n && src[k] === "`") k++;
      const close = findBacktickClose(src, k, k - i);
      if (close > 0) {
        masks.push({ start: i, end: close });
        i = close;
        continue;
      }
      i = k;
      continue;
    }
    if (ch === "<" && src.startsWith("<!--", i)) {
      const close = src.indexOf("-->", i + 4);
      if (close >= 0) {
        masks.push({ start: i, end: close + 3 });
        i = close + 3;
        continue;
      }
    }
    i++;
  }
  masks.sort((a, b) => a.start - b.start);
  return masks;
}
function findDisplayClose(src, from, masks) {
  let i = from;
  let mi = 0;
  while (mi < masks.length && masks[mi].end <= i) mi++;
  while (i < src.length - 1) {
    if (mi < masks.length && i >= masks[mi].start && i < masks[mi].end) {
      i = masks[mi].end;
      continue;
    }
    const ch = src[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "$" && src[i + 1] === "$") return i;
    i++;
  }
  return -1;
}
function findInlineClose(src, from, masks) {
  if (from >= src.length) return -1;
  if (/\s/.test(src[from])) return -1;
  let i = from;
  let mi = 0;
  while (mi < masks.length && masks[mi].end <= i) mi++;
  while (i < src.length) {
    if (mi < masks.length && i >= masks[mi].start && i < masks[mi].end) {
      i = masks[mi].end;
      continue;
    }
    const ch = src[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "\n") {
      let j = i + 1;
      while (j < src.length && (src[j] === " " || src[j] === "	" || src[j] === "\r")) {
        j++;
      }
      if (j >= src.length || src[j] === "\n") return -1;
      i++;
      continue;
    }
    if (ch === "$") {
      if (src[i + 1] === "$") return -1;
      if (/\s/.test(src[i - 1] ?? "")) {
        i++;
        continue;
      }
      return i;
    }
    i++;
  }
  return -1;
}
function extractBlocks(src, masks) {
  const blocks = [];
  const n = src.length;
  let i = 0;
  let mi = 0;
  while (i < n) {
    while (mi < masks.length && masks[mi].end <= i) mi++;
    if (mi < masks.length && i >= masks[mi].start && i < masks[mi].end) {
      i = masks[mi].end;
      continue;
    }
    if (src[i] === "\\") {
      i += 2;
      continue;
    }
    if (src[i] !== "$") {
      i++;
      continue;
    }
    if (src[i + 1] === "$") {
      const close2 = findDisplayClose(src, i + 2, masks);
      if (close2 < 0) {
        i += 2;
        continue;
      }
      blocks.push({
        kind: "display",
        start: i + 2,
        end: close2,
        text: src.slice(i + 2, close2)
      });
      i = close2 + 2;
      continue;
    }
    const close = findInlineClose(src, i + 1, masks);
    if (close < 0) {
      i++;
      continue;
    }
    blocks.push({
      kind: "inline",
      start: i + 1,
      end: close,
      text: src.slice(i + 1, close)
    });
    i = close + 1;
  }
  return blocks;
}
function readOptionalCounter(text, from) {
  let i = from;
  while (i < text.length && (text[i] === " " || text[i] === "	")) i++;
  if (text[i] !== "[") return null;
  const close = text.indexOf("]", i + 1);
  if (close < 0) return null;
  const raw = text.slice(i + 1, close);
  if (!COUNTER_CANDIDATE.test(raw)) return null;
  return { raw, end: close + 1 };
}
function extractLabels(text, baseOffset) {
  const out = [];
  const re = /\\label\s*\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const counter = readOptionalCounter(text, m.index + m[0].length);
    out.push({
      name: m[1].trim(),
      offset: baseOffset + m.index,
      counterRaw: counter ? counter.raw : null
    });
  }
  return out;
}
function collectRefs(block, out) {
  const re = /\\(?:eq)?ref\s*\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(block.text)) !== null) {
    out.push({
      name: m[1].trim(),
      offset: block.start + m.index,
      inDisplay: block.kind === "display"
    });
  }
}
function computeLineStarts(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === "\n") starts.push(i + 1);
  }
  return starts;
}
function lineOf(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = lo + hi + 1 >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}
function scanDocument(src) {
  const masks = computeMasks(src);
  const blocks = extractBlocks(src, masks);
  const lineStarts = computeLineStarts(src);
  const labels = /* @__PURE__ */ new Map();
  const refs = [];
  const errors = [];
  let counter = cloneCounter(INITIAL_COUNTER);
  let displayIndex = 0;
  let numberedBlocks = 0;
  const pushError = (code, name, offset) => {
    errors.push({ code, name, offset, line: lineOf(lineStarts, offset) });
  };
  const registerBad = (raw, blockIndex, code) => {
    if (!raw.name || labels.has(raw.name)) return;
    labels.set(raw.name, {
      name: raw.name,
      number: null,
      blockIndex,
      offset: raw.offset,
      error: code
    });
  };
  for (const block of blocks) {
    collectRefs(block, refs);
    if (block.kind === "inline") {
      for (const raw2 of extractLabels(block.text, block.start)) {
        pushError("E01", raw2.name, raw2.offset);
        registerBad(raw2, -1, "E01");
      }
      continue;
    }
    displayIndex++;
    const raws = extractLabels(block.text, block.start);
    if (raws.length === 0) continue;
    if (raws.length > 1) {
      for (const raw2 of raws) {
        pushError("E02", raw2.name, raw2.offset);
        registerBad(raw2, displayIndex, "E02");
      }
      continue;
    }
    const raw = raws[0];
    if (!raw.name || LABEL_NAME_BAD_CHAR.test(raw.name)) {
      pushError("E04", raw.name, raw.offset);
      registerBad(raw, displayIndex, "E04");
      continue;
    }
    if (labels.has(raw.name)) {
      pushError("E03", raw.name, raw.offset);
      continue;
    }
    if (raw.counterRaw !== null) {
      const parsed = parseCounter(raw.counterRaw);
      if (!parsed) {
        pushError("E05", raw.name, raw.offset);
        registerBad(raw, displayIndex, "E05");
        continue;
      }
      counter = parsed;
    } else {
      counter = step(counter).counter;
    }
    labels.set(raw.name, {
      name: raw.name,
      number: formatCounter(counter),
      blockIndex: displayIndex,
      offset: raw.offset
    });
    numberedBlocks++;
  }
  for (const ref of refs) {
    const entry = labels.get(ref.name);
    if (!entry) {
      ref.error = "E06";
      pushError("E06", ref.name, ref.offset);
    } else if (!entry.number) {
      ref.error = "E07";
      pushError("E07", ref.name, ref.offset);
    }
  }
  return { labels, refs, errors, counter, numberedBlocks };
}

// src/context.ts
var DocContext = class {
  constructor(app, getGraceMs) {
    this.app = app;
    this.cache = null;
    this.textCache = /* @__PURE__ */ new Map();
    this.getGraceMs = getGraceMs ?? (() => 0);
  }
  invalidate() {
    if (this.cache) this.cache.invalidatedAt = Date.now();
  }
  /** 预读全文，给阅读视图 / 无 editor 的场景兜底 */
  async prewarm(file) {
    const hit = this.textCache.get(file.path);
    if (hit && Date.now() - hit.at < 3e3) return;
    try {
      const text = await this.app.vault.cachedRead(file);
      this.textCache.set(file.path, { text, at: Date.now() });
    } catch {
    }
  }
  forget(path) {
    this.textCache.delete(path);
  }
  /** 当前文件与其全文；任一缺失返回 null */
  snapshot() {
    const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    const file = view?.file ?? this.app.workspace.getActiveFile();
    if (!file) return null;
    let text = null;
    try {
      const editor = view?.editor;
      if (editor && typeof editor.getValue === "function") {
        const value = editor.getValue();
        if (typeof value === "string") text = value;
      }
    } catch {
    }
    if (text === null) {
      const hit = this.textCache.get(file.path);
      if (hit) text = hit.text;
    }
    return { path: file.path, text };
  }
  /** 扫描结果（带缓存）。失效后在一个防抖周期内沿用旧表，避免打字时反复全文扫描 */
  get() {
    const snap = this.snapshot();
    if (!snap || snap.text === null) return null;
    const { path, text } = snap;
    const head = text.slice(0, 64);
    const tail = text.slice(-64);
    const c = this.cache;
    if (c && c.path === path) {
      if (c.len === text.length && c.head === head && c.tail === tail) {
        delete c.invalidatedAt;
        return { path, result: c.result };
      }
      const grace = this.getGraceMs();
      if (grace > 0 && c.invalidatedAt !== void 0 && Date.now() - c.invalidatedAt < grace) {
        return { path, result: c.result };
      }
    }
    const result = scanDocument(text);
    this.cache = { path, len: text.length, head, tail, result };
    return { path, result };
  }
  /** 无视缓存重扫（供"刷新"命令使用） */
  refresh() {
    this.cache = null;
    return this.get();
  }
};

// src/i18n.ts
var import_obsidian2 = require("obsidian");
function currentLanguage() {
  try {
    return (0, import_obsidian2.getLanguage)().toLowerCase();
  } catch {
    return "en";
  }
}
function isChinese() {
  return currentLanguage().startsWith("zh");
}
function t(english, chinese) {
  return isChinese() ? chinese : english;
}

// src/errors.ts
var MESSAGES = {
  E01: [
    "\\label is only allowed inside a $$...$$ block",
    "\\label \u53EA\u80FD\u5199\u5728 $$...$$ \u884C\u95F4\u516C\u5F0F\u91CC"
  ],
  E02: [
    "a $$ block can hold at most one \\label",
    "\u4E00\u4E2A $$ \u5757\u5185\u53EA\u80FD\u6709\u4E00\u4E2A \\label"
  ],
  E03: [
    "duplicate label name; the first occurrence wins",
    "label \u540D\u91CD\u590D\uFF0C\u9996\u4E2A\u751F\u6548"
  ],
  E04: [
    "invalid label name: must be non-empty and free of { } \\ $ and whitespace",
    "\\label \u540D\u79F0\u975E\u6CD5\uFF1A\u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u4E14\u4E0D\u80FD\u5305\u542B { } \\ $ \u6216\u7A7A\u767D"
  ],
  E05: [
    "invalid counter: the last segment must be a number, e.g. 3, 4.2, 5.1.10, A.1",
    "\u8BA1\u6570\u5668 [N] \u4E0D\u5408\u6CD5\uFF1A\u6700\u540E\u4E00\u6BB5\u5FC5\u987B\u662F\u6570\u5B57\uFF0C\u4F8B\u5982 3\u30014.2\u30015.1.10\u3001A.1"
  ],
  E06: [
    "\\ref points to an undefined label",
    "\\ref \u6307\u5411\u4E86\u672A\u5B9A\u4E49\u7684 label"
  ],
  E07: [
    "\\ref points to a label that is itself invalid",
    "\\ref \u6307\u5411\u7684 label \u672C\u8EAB\u6709\u9519\u8BEF"
  ]
};
function describeError(code) {
  const [english, chinese] = MESSAGES[code];
  return t(english, chinese);
}

// src/editor-suggest.ts
var import_view = require("@codemirror/view");
var import_obsidian3 = require("obsidian");
var TRIGGER_RE = /\\(?:eq)?ref\s*\{([^{}]*)$|\\label\s*\{([^{}]*)$/;
var LabelSuggest = class extends import_obsidian3.EditorSuggest {
  constructor(app, ctx) {
    super(app);
    this.openSig = "";
    this.ctx = ctx;
  }
  /** CM6 扩展：选区/文档变化时检查光标位置（随 registerEditorExtension 注册，卸载自动清理） */
  cursorWatcher() {
    const self = this;
    return import_view.ViewPlugin.fromClass(
      class {
        update(update) {
          if (!update.selectionSet && !update.docChanged) return;
          const info = update.view.state.field(import_obsidian3.editorInfoField, false);
          if (info?.editor) self.handleCursorActivity(info.editor, info.file);
        }
      }
    );
  }
  handleCursorActivity(editor, file) {
    if (!file) {
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
      query: trigger.query
    };
    this.open();
  }
  getSuggestions(context) {
    const snap = this.ctx.get();
    if (!snap) return [];
    const q = context.query;
    const results = [];
    for (const entry of snap.result.labels.values()) {
      if (q && !entry.name.includes(q)) continue;
      results.push(entry);
    }
    return results;
  }
  renderSuggestion(entry, el) {
    el.createSpan({ text: entry.name, cls: "eq-suggest-name" });
    if (entry.number) {
      el.createSpan({ text: entry.number, cls: "eq-suggest-number" });
    }
  }
  selectSuggestion(entry, evt) {
    const { editor, start, end } = this.context;
    editor.replaceRange(entry.name, start, end);
    editor.setCursor(end.line, start.ch + entry.name.length);
  }
  onTrigger(cursor, editor, file) {
    const upto = editor.getLine(cursor.line).slice(0, cursor.ch);
    const m = TRIGGER_RE.exec(upto);
    if (!m) return null;
    const captured = m[1] ?? m[2];
    const snap = this.ctx.get();
    if (!snap || snap.result.labels.size === 0) return null;
    return {
      start: { line: cursor.line, ch: cursor.ch - captured.length },
      end: cursor,
      query: captured
    };
  }
};

// src/rewriter.ts
var DEFAULT_REWRITE_OPTIONS = {
  refTemplate: "({n})",
  showErrors: true
};
var FAST = /\\(?:label|ref|eqref)\b/;
var TAG_RE = /\\tag\*?\s*\{[^{}]*\}/g;
var LABEL_RE = /\\label\s*\{([^{}]*)\}/g;
var COUNTER_CANDIDATE2 = /^[0-9A-Za-z][0-9A-Za-z.]*$/;
var TAIL_ENV_RE = /\\end\{(align\*?|alignat\*?|flalign\*?|gather\*?|equation\*?|multline\*?)\}[ \t]*$/;
function errorTex(code, show) {
  if (!show) return "\\text{?}";
  return `\\color{red}{\\text{[${code}]}}`;
}
function refTex(number, template) {
  const body = template.includes("{n}") ? template.split("{n}").join(number) : `(${number})`;
  return `\\text{${body}}`;
}
function stripLabels(tex) {
  if (!tex.includes("\\label")) return { tex, names: [] };
  const names = [];
  let out = "";
  let cursor = 0;
  const re = new RegExp(LABEL_RE.source, "g");
  let m;
  while ((m = re.exec(tex)) !== null) {
    out += tex.slice(cursor, m.index);
    cursor = m.index + m[0].length;
    names.push(m[1].trim());
    let j = cursor;
    while (j < tex.length && (tex[j] === " " || tex[j] === "	")) j++;
    if (tex[j] === "[") {
      const close = tex.indexOf("]", j + 1);
      if (close > 0) {
        const raw = tex.slice(j + 1, close);
        if (!raw.includes("\n") && COUNTER_CANDIDATE2.test(raw)) {
          cursor = close + 1;
        }
      }
    }
  }
  out += tex.slice(cursor);
  return { tex: out, names };
}
function insertTag(tex, tag) {
  const body = tex.replace(/\s+$/, "");
  if (!body) return tag;
  const m = TAIL_ENV_RE.exec(body);
  if (m) {
    const token = m[0].trim();
    const pos = body.length - token.length;
    const head = body.slice(0, pos);
    const br = /\\\\[ \t]*$/.exec(head);
    if (br) {
      const p = pos - br[0].length;
      return body.slice(0, p) + tag + body.slice(p);
    }
    return head + tag + body.slice(pos);
  }
  return body + tag;
}
function rewriteTex(tex, table, options = {}) {
  if (!table) return tex;
  if (!FAST.test(tex)) return tex;
  const opt = { ...DEFAULT_REWRITE_OPTIONS, ...options };
  let out = tex;
  out = out.replace(/\\(?:eq)?ref\s*\{([^{}]*)\}/g, (_whole, rawName) => {
    const name2 = rawName.trim();
    const entry2 = table.labels.get(name2);
    if (entry2 && entry2.number) return refTex(entry2.number, opt.refTemplate);
    if (entry2 && !entry2.number) return errorTex("E07", opt.showErrors);
    return errorTex("E06", opt.showErrors);
  });
  const stripped = stripLabels(out);
  out = stripped.tex;
  if (stripped.names.length === 0) return out;
  out = out.replace(TAG_RE, "");
  if (stripped.names.length > 1) {
    return insertTag(out, errorTex("E02", opt.showErrors));
  }
  const name = stripped.names[0];
  const entry = table.labels.get(name);
  if (!entry) return insertTag(out, errorTex("E01", opt.showErrors));
  if (!entry.number) {
    return insertTag(out, errorTex(entry.error ?? "E01", opt.showErrors));
  }
  return insertTag(out, `\\tag{${entry.number}}`);
}

// src/settings.ts
var import_obsidian4 = require("obsidian");
var DEFAULT_SETTINGS = {
  refTemplate: "({n})",
  showErrorInMath: true,
  refreshOnChange: true,
  refreshDebounce: 400,
  debug: false
};
var EquationOrdinalSettingTab = class extends import_obsidian4.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  getSettingDefinitions() {
    return [
      {
        name: t("Reference template", "\u5F15\u7528\u6A21\u677F"),
        desc: t(
          "How \\ref expands. {n} is replaced by the number. Default: ({n}).",
          "\\ref \u5C55\u5F00\u6210\u4EC0\u4E48\u3002{n} \u4F1A\u88AB\u66FF\u6362\u6210\u7F16\u53F7\uFF0C\u9ED8\u8BA4 ({n})\u3002"
        ),
        control: {
          type: "text",
          key: "refTemplate",
          placeholder: "({n})",
          defaultValue: "({n})",
          validate: (value) => {
            if (value.includes("{n}")) return;
            return t('The template must contain "{n}".', "\u6A21\u677F\u5FC5\u987B\u5305\u542B {n}\u3002");
          }
        }
      },
      {
        name: t("Show error codes in formulas", "\u5728\u516C\u5F0F\u5185\u663E\u793A\u9519\u8BEF\u7801"),
        desc: t(
          "When off, an invalid spot shows a single question mark instead. Details still go to the console.",
          "\u5173\u95ED\u540E\u9519\u8BEF\u5904\u53EA\u663E\u793A\u4E00\u4E2A ?\uFF0C\u8BE6\u7EC6\u4FE1\u606F\u4ECD\u7136\u5199\u5165\u63A7\u5236\u53F0\u3002"
        ),
        control: {
          type: "toggle",
          key: "showErrorInMath",
          defaultValue: true
        }
      },
      {
        name: t("Refresh when numbering changes", "\u7F16\u53F7\u53D8\u5316\u65F6\u81EA\u52A8\u5237\u65B0"),
        desc: t(
          "Re-render already displayed formulas when inserting one shifts the ones after it. Turn off to reduce flicker.",
          "\u5728\u6587\u6863\u4E2D\u63D2\u5165\u65B0\u516C\u5F0F\u5BFC\u81F4\u540E\u7EED\u7F16\u53F7\u53D8\u5316\u65F6\uFF0C\u4E3B\u52A8\u91CD\u6E32\u5DF2\u663E\u793A\u7684\u516C\u5F0F\u3002\u5173\u95ED\u53EF\u51CF\u5C11\u95EA\u70C1\u3002"
        ),
        control: {
          type: "toggle",
          key: "refreshOnChange",
          defaultValue: true
        }
      },
      {
        name: t("Refresh debounce", "\u5237\u65B0\u9632\u6296"),
        desc: t(
          "How long to wait after typing stops, in milliseconds.",
          "\u7F16\u8F91\u505C\u6B62\u591A\u4E45\u540E\u89E6\u53D1\u5237\u65B0\uFF08\u6BEB\u79D2\uFF09\u3002"
        ),
        control: {
          type: "number",
          key: "refreshDebounce",
          placeholder: "400",
          defaultValue: 400,
          min: 0,
          max: 5e3,
          step: 1,
          validate: (value) => {
            if (Number.isFinite(value) && value >= 0 && value <= 5e3) return;
            return t(
              "Enter a number between 0 and 5000.",
              "\u8BF7\u8F93\u5165 0 \u5230 5000 \u4E4B\u95F4\u7684\u6570\u5B57\u3002"
            );
          }
        }
      },
      {
        name: t("Debug log", "\u8C03\u8BD5\u65E5\u5FD7"),
        desc: t(
          "Print every TeX rewrite (before / after) to the console.",
          "\u5728\u63A7\u5236\u53F0\u6253\u5370\u6BCF\u6B21 TeX \u6539\u5199\u7684\u524D\u540E\u5BF9\u6BD4\u3002"
        ),
        control: {
          type: "toggle",
          key: "debug",
          defaultValue: false
        }
      }
    ];
  }
  /** 持久化用户改动；模板与错误码开关影响渲染，改完立即重绘 */
  async setControlValue(key, value) {
    const settings = this.plugin.settings;
    settings[key] = key === "refreshDebounce" ? Math.round(Number(value)) : value;
    await this.plugin.saveSettings();
    if (key === "refTemplate" || key === "showErrorInMath") {
      this.plugin.requestRefresh(true);
    }
  }
};

// src/main.ts
var LOG = "[equation-ordinal]";
var sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
function signatureOf(result) {
  const parts = [];
  for (const [name, entry] of result.labels) {
    parts.push(`${name}=${entry.number ?? "!"}`);
  }
  return parts.join("|");
}
function getWindowMathJax() {
  return window.MathJax;
}
function getLoadMathJax() {
  const ns = ObsidianNamespace;
  return typeof ns.loadMathJax === "function" ? ns.loadMathJax.bind(ObsidianNamespace) : void 0;
}
var EquationOrdinalPlugin = class extends import_obsidian5.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
    this.originalTex2chtml = null;
    this.signature = "";
    this.errorSignature = "";
    this.timer = null;
  }
  async onload() {
    await this.loadSettings();
    this.ctx = new DocContext(this.app, () => this.settings.refreshDebounce);
    this.addSettingTab(new EquationOrdinalSettingTab(this.app, this));
    this.labelSuggest = new LabelSuggest(this.app, this.ctx);
    this.registerEditorSuggest(this.labelSuggest);
    this.registerEditorExtension(this.labelSuggest.cursorWatcher());
    this.registerEvents();
    this.addCommands();
    void this.installHook();
    const file = this.app.workspace.getActiveFile();
    if (file) void this.ctx.prewarm(file);
  }
  onunload() {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }
  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  // -------------------------------------------------------------- 挂接 MathJax
  async resolveMathJax() {
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
    }
    for (let i = 0; i < 30 && typeof mj.tex2chtml !== "function"; i++) {
      await sleep(100);
    }
    return mj;
  }
  async installHook() {
    const mj = await this.resolveMathJax();
    if (!mj) {
      console.warn(`${LOG} window.MathJax not found, plugin inactive`);
      return;
    }
    if (typeof mj.tex2chtml !== "function") {
      console.warn(
        `${LOG} MathJax.tex2chtml is unavailable (different Obsidian build?), plugin inactive`
      );
      new import_obsidian5.Notice(
        t(
          "Equation Ordinal: could not hook MathJax, plugin is inactive. See the console.",
          "Equation Ordinal\uFF1A\u65E0\u6CD5\u6302\u63A5 MathJax\uFF0C\u63D2\u4EF6\u672A\u751F\u6548\u3002\u8BE6\u89C1\u63A7\u5236\u53F0\u3002"
        ),
        8e3
      );
      return;
    }
    this.hookMathJax(mj);
    this.requestRefresh(true);
  }
  hookMathJax(mj) {
    const original = mj.tex2chtml;
    this.originalTex2chtml = original;
    const patched = (tex, ...rest) => {
      if (typeof tex !== "string") return original.apply(mj, [tex, ...rest]);
      let out = tex;
      try {
        const snap = this.ctx.get();
        if (snap) {
          out = rewriteTex(tex, snap.result, {
            refTemplate: this.settings.refTemplate,
            showErrors: this.settings.showErrorInMath
          });
          if (this.settings.debug && out !== tex) {
            console.debug(`${LOG}
  in : ${tex}
  out: ${out}`);
          }
        }
      } catch (error) {
        console.error(`${LOG} rewrite failed, passing the TeX through`, error);
        out = tex;
      }
      const node = original.apply(mj, [out, ...rest]);
      if (node && node.nodeType === Node.ELEMENT_NODE) {
        try {
          const el = node;
          el.setAttribute("data-eq-tex", tex);
          const opts = rest[0];
          if (opts && typeof opts.display === "boolean") {
            el.setAttribute("data-eq-display", String(opts.display));
          }
          if (out !== tex && /\[E\d{2}\]/.test(out)) {
            el.setAttribute("data-eq-error", "1");
          } else {
            el.removeAttribute("data-eq-error");
          }
        } catch {
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
  registerEvents() {
    this.registerEvent(
      this.app.workspace.on("editor-change", () => {
        this.ctx.invalidate();
        this.scheduleRefresh();
      })
    );
    this.registerEvent(
      this.app.vault.on("modify", () => {
        this.ctx.invalidate();
        this.scheduleRefresh();
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        this.ctx.invalidate();
        const snap = this.ctx.get();
        this.signature = snap ? signatureOf(snap.result) : "";
        if (file) {
          void this.ctx.prewarm(file).then(() => {
            this.ctx.invalidate();
            this.refresh(false);
          });
        }
      })
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.ctx.invalidate();
      })
    );
  }
  addCommands() {
    this.addCommand({
      id: "refresh-equations",
      name: t(
        "Rescan and refresh equation numbers",
        "\u91CD\u65B0\u626B\u63CF\u5E76\u5237\u65B0\u516C\u5F0F\u7F16\u53F7"
      ),
      callback: () => {
        this.requestRefresh(true);
        new import_obsidian5.Notice(
          t(
            "Equation Ordinal: rescanning is done",
            "Equation Ordinal\uFF1A\u5DF2\u91CD\u65B0\u626B\u63CF\u5F53\u524D\u6587\u4EF6"
          )
        );
      }
    });
    this.addCommand({
      id: "dump-label-table",
      name: t(
        "Print the label table to the console",
        "\u5728\u63A7\u5236\u53F0\u6253\u5370\u7F16\u53F7\u8868"
      ),
      callback: () => this.dumpTable()
    });
  }
  dumpTable() {
    const snap = this.ctx.refresh();
    if (!snap) {
      new import_obsidian5.Notice(
        t("Equation Ordinal: no active file", "Equation Ordinal\uFF1A\u6CA1\u6709\u6D3B\u52A8\u6587\u4EF6")
      );
      return;
    }
    const rows = [];
    for (const [name, entry] of snap.result.labels) {
      rows.push({
        label: name,
        number: entry.number ?? `ERR(${entry.error ?? "?"})`,
        block: String(entry.blockIndex)
      });
    }
    if (rows.length === 0) {
      new import_obsidian5.Notice(
        t(
          "Equation Ordinal: no \\label in this file",
          "Equation Ordinal\uFF1A\u5F53\u524D\u6587\u4EF6\u6CA1\u6709 \\label"
        )
      );
    } else {
      const lines = rows.map((row) => `${row.label} -> (${row.number})`).join("\n");
      new import_obsidian5.Notice(
        `${t(`${rows.length} labels`, `${rows.length} \u4E2A label`)}:
${lines}`,
        1e4
      );
    }
    for (const error of snap.result.errors) {
      const suffix = error.name ? ` (${error.name})` : "";
      console.error(
        `${LOG} ${error.code} ${snap.path}:${error.line} ${describeError(error.code)}${suffix}`
      );
    }
  }
  // -------------------------------------------------------------- 刷新
  requestRefresh(force = false) {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.refresh(force);
  }
  scheduleRefresh() {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.refresh(false);
    }, this.settings.refreshDebounce);
  }
  /** 错误只报一次，避免每次键入都刷屏 */
  reportErrors(path, result) {
    const signature = result.errors.map((error) => `${error.code}@${error.line}:${error.name ?? ""}`).join("|");
    if (signature === this.errorSignature) return;
    this.errorSignature = signature;
    if (!signature) return;
    for (const error of result.errors) {
      const suffix = error.name ? ` (${error.name})` : "";
      console.error(
        `${LOG} ${error.code} ${path}:${error.line} ${describeError(error.code)}${suffix}`
      );
    }
  }
  refresh(force) {
    const snap = this.ctx.refresh();
    if (!snap) return;
    this.reportErrors(snap.path, snap.result);
    const sig = signatureOf(snap.result);
    if (!force && sig === this.signature) return;
    this.signature = sig;
    if (!force && !this.settings.refreshOnChange) return;
    const view = this.app.workspace.getActiveViewOfType(import_obsidian5.MarkdownView);
    if (!view) return;
    if (view.getMode() === "preview") {
      try {
        const preview = view.previewMode;
        preview.rerender?.(true);
      } catch (error) {
        console.warn(`${LOG} reading view rerender failed`, error);
      }
      return;
    }
    this.rerenderInLivePreview(view);
  }
  rerenderInLivePreview(view) {
    const mj = getWindowMathJax();
    if (!mj || typeof mj.tex2chtml !== "function") return;
    const nodes = Array.from(
      view.containerEl.querySelectorAll(
        "mjx-container[data-eq-tex]"
      )
    );
    for (const old of nodes) {
      const tex = old.getAttribute("data-eq-tex");
      if (tex === null) continue;
      const display = old.getAttribute("data-eq-display");
      try {
        const fresh = display === null ? mj.tex2chtml(tex) : mj.tex2chtml(tex, { display: display === "true" });
        if (!fresh || fresh.nodeType !== Node.ELEMENT_NODE) continue;
        old.replaceChildren(...Array.from(fresh.childNodes));
      } catch (error) {
        console.warn(`${LOG} partial rerender failed`, error);
        break;
      }
    }
  }
};
