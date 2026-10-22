# Equation Ordinal

Numbered equations with `\label` and `\ref` for display math in [Obsidian](https://obsidian.md).

Write ordinary LaTeX inside `$$...$$`. The plugin works out the number and renders the tag at display time — nothing is written back to the note, so the file you keep is the source you could paste into a paper.

**English** | [中文](#中文)

---

## Why

MathJax renders `\tag{...}`, but it has no per-note equation counter, and `\label` / `\ref` do not behave the way they do in LaTeX. The usual workaround is typing `\tag{1}`, `\tag{2}`, … by hand and renumbering everything whenever a formula is inserted in the middle.

Equation Ordinal moves the whole job into the rendering layer:

- the number comes from the order of `\label` declarations in the file;
- `\ref` resolves to the same number, already wrapped in parentheses;
- the note on disk is never touched, so your source stays free of injected `\tag`s and you keep full control when you export.

## Install

**Manual**

1. Download `manifest.json`, `main.js` and `styles.css` from this repository.
2. Put them in `<vault>/.obsidian/plugins/equation-ordinal/`.
3. Reload Obsidian, then enable **Equation Ordinal** under Settings → Community plugins.

**BRAT**

Add `Junzi-ana/equation-ordinal` as a beta plugin.

**From source**

```bash
npm install
npm run build
```

## Usage

### Declare a label

```latex
$$
\mathrm{d}Y_t = Z_t\,\mathrm{d}W_t - F(t, Y_t, Z_t)\,\mathrm{d}t,\qquad Y_T = \xi
\label{eq:bsde}
$$
```

`\label` may sit anywhere inside the display block — at the end, in the middle, or on its own line. It is removed and the tag is placed where MathJax expects it.

### Reference it

```latex
Combining $\ref{eq:bsde}$ with the estimate above, ...
```

Works in inline math and in display math. `\eqref{...}` is accepted as an alias.

The output is already parenthesised — write `$\ref{eq:bsde}$`, not `$(\ref{eq:bsde})$`.

## Numbering

The counter starts at `1` and increments once per labelled display block.

`\label{name}[N]` sets the counter to `N` instead of incrementing it. `N` is a sequence of numbers and dots; only the segment after the **last** dot is incremented afterwards.

| Source order | Markup | Rendered |
| --- | --- | --- |
| 1 | `\label{a}` | (1) |
| 2 | `\label{b}` | (2) |
| 3 | `\label{c}[5.1.10]` | (5.1.10) |
| 4 | `\label{d}` | (5.1.11) |
| 5 | `\label{e}[A.1]` | (A.1) |
| 6 | `\label{f}` | (A.2) |
| 7 | `\label{g}[7]` | (7) |
| 8 | `\label{h}` | (8) |

Rules for `N`:

- the last segment must be digits: `3`, `4.2`, `5.1.10` are fine;
- the part before the last dot may contain letters: `A.1`, `A.B.3` are fine;
- trailing dot, leading dot, double dot and a non-numeric last segment are rejected: `1.2.`, `.1`, `1..2`, `3a`.

The counter belongs to the note, not to the file name, so a note that starts with `\label{x}[5.1]` produces `(5.1)`, `(5.2)`, … in any vault.

## Errors

Problems are reported in place and in the console (with file name and line number). Nothing is silently dropped.

| Code | Cause |
| --- | --- |
| `E01` | `\label` used inside inline math `$...$` |
| `E02` | more than one `\label` in a single `$$` block |
| `E03` | duplicate label name — the first occurrence wins |
| `E04` | empty label name, or one containing `{ } \ $` or whitespace |
| `E05` | invalid counter `[N]` |
| `E06` | `\ref` points to a label that does not exist |
| `E07` | `\ref` points to a label that is itself invalid |

An invalid declaration does not consume a number, so one typo never shifts the numbering of everything after it.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| Reference template | `({n})` | How `\ref` expands; `{n}` is the number |
| Show error codes in formulas | on | When off, an error renders as `?` |
| Refresh when numbering changes | on | Re-render visible formulas after an insertion shifts the numbers |
| Refresh debounce | `400` ms | Delay after typing stops |
| Debug log | off | Print every rewrite (before / after) to the console |

Two commands are available in the command palette: rescan the current file, and print the label table to the console.

## How it works

Obsidian renders math with MathJax. The plugin calls `loadMathJax()`, then wraps `MathJax.tex2chtml` — the function every formula passes through on its way from TeX to CHTML:

1. **Scan.** The whole note is scanned synchronously and a `label → number` table is built. Code blocks, inline code, frontmatter and HTML comments are skipped. Because the table depends only on source order, scrolling, incremental re-rendering and full re-renders can never produce an inconsistent numbering.
2. **Rewrite.** For each formula, `\label{...}[N]` is stripped and `\tag{number}` is appended at a position MathJax accepts — before `\end{align}` for aligned environments, at the top level for everything else, so `cases` and `aligned` inside `\left\{ … \right.` keep working.
3. **Refresh.** Each rendered container remembers its original TeX. When an edit changes the numbering table, visible containers are re-rendered in place.

The note file is read-only for this plugin. There is no `\tag` written into your Markdown, and no separate numbering syntax to learn.

## Limitations

- References are resolved within the current note. Cross-file `\ref` is not supported.
- When several panes show different notes at once, a background pane may be numbered with the foreground note's table. The active pane is always correct.
- Hover previews can show unprocessed math until the note is opened.
- One `$$` block may hold at most one `\label`. Aligned environments share one number.
- A `\label` inside `\text{...}` is still recognised, since the scanner works on the TeX string.

## Development

```bash
npm install
npm test         # unit tests for the counter, scanner and rewriter (node --test)
npm run typecheck
npm run build    # writes main.js next to manifest.json
```

The pure logic (`counter.ts`, `scanner.ts`, `rewriter.ts`) has no dependency on Obsidian and is tested directly. To develop against a vault, point the build at the plugin folder:

```bash
VAULT_PLUGIN_DIR="<vault>/.obsidian/plugins/equation-ordinal" npm run build
```

## License

MIT

---

## 中文

给 Obsidian 的行间公式做自动编号，并支持 LaTeX 风格的 `\label` / `\ref` 交叉引用。

在 `$$...$$` 里写普通的 LaTeX 就行。编号和标签是在**渲染时**算出来并画上去的，不会写回笔记文件——所以文件里保存的仍然是可以直接粘进论文的那份源码。

### 为什么需要它

MathJax 能渲染 `\tag{...}`，但它没有"整篇笔记的公式计数器"，`\label` / `\ref` 也不像在 LaTeX 里那样工作。常见的替代做法是手写 `\tag{1}`、`\tag{2}`，然后每次在中间插入一个公式，就得把后面全改一遍。

Equation Ordinal 把这件事放到渲染层：

- 编号由 `\label` 在文件中的出现顺序决定；
- `\ref` 解析成同一个编号，并自动带上括号；
- 磁盘上的笔记完全不被动过，源码里不会混入插件注入的 `\tag`，导出时你仍然完全掌握编号。

### 安装

**手动**

1. 下载本仓库的 `manifest.json`、`main.js`、`styles.css`；
2. 放进 `<vault>/.obsidian/plugins/equation-ordinal/`；
3. 重启 Obsidian，在「设置 → 第三方插件」里启用 **Equation Ordinal**。

**BRAT**

把 `Junzi-ana/equation-ordinal` 添加为 beta 插件。

**从源码构建**

```bash
npm install
npm run build
```

### 用法

#### 声明标签

```latex
$$
\mathrm{d}Y_t = Z_t\,\mathrm{d}W_t - F(t, Y_t, Z_t)\,\mathrm{d}t,\qquad Y_T = \xi
\label{eq:bsde}
$$
```

`\label` 可以写在行间公式的任意位置——末尾、中间、单独一行都行。插件会把它删掉，再把 `\tag` 插到 MathJax 能接受的位置。

#### 引用

```latex
结合 $\ref{eq:bsde}$ 与上面的估计可得……
```

行内公式和行间公式都支持，`\eqref{...}` 是同义词。

输出本身已带括号，写 `$\ref{eq:bsde}$` 即可，不要再套一层 `$(\ref{eq:bsde})$`。

### 编号规则

计数器从 `1` 开始，每遇到一个带 `\label` 的行间公式就加一。

`\label{name}[N]` 不递增，而是把计数器直接设为 `N`。`N` 由数字和小数点组成，之后只递增**最后一个**小数点后的那一段。

| 源码顺序 | 写法 | 渲染结果 |
| --- | --- | --- |
| 1 | `\label{a}` | (1) |
| 2 | `\label{b}` | (2) |
| 3 | `\label{c}[5.1.10]` | (5.1.10) |
| 4 | `\label{d}` | (5.1.11) |
| 5 | `\label{e}[A.1]` | (A.1) |
| 6 | `\label{f}` | (A.2) |
| 7 | `\label{g}[7]` | (7) |
| 8 | `\label{h}` | (8) |

`N` 的约束：

- 最后一段必须是数字：`3`、`4.2`、`5.1.10` 都可以；
- 最后一个小数点之前可以含字母：`A.1`、`A.B.3` 都可以；
- 末尾带点、开头带点、连续两个点、最后一段非数字，都会被拒绝：`1.2.`、`.1`、`1..2`、`3a`。

计数器属于笔记本身，与文件名无关。笔记从 `\label{x}[5.1]` 开始，就会依次得到 `(5.1)`、`(5.2)`……

### 错误码

问题会在公式里就地标出，同时写进控制台（带文件名和行号），不会被静默吞掉。

| 码 | 含义 |
| --- | --- |
| `E01` | `\label` 写在了行内公式 `$...$` 里 |
| `E02` | 同一个 `$$` 块里出现了多个 `\label` |
| `E03` | label 名重复，首个生效 |
| `E04` | label 名为空，或含 `{ } \ $`、空白 |
| `E05` | 计数器 `[N]` 不合法 |
| `E06` | `\ref` 指向不存在的 label |
| `E07` | `\ref` 指向的 label 本身有错 |

无效的声明不占用编号，所以一个笔误不会让后面所有公式跟着跳号。

### 设置

| 设置项 | 默认 | 说明 |
| --- | --- | --- |
| 引用模板 | `({n})` | `\ref` 展开成什么，`{n}` 是编号 |
| 在公式内显示错误码 | 开 | 关闭后错误处只显示 `?` |
| 编号变化时自动刷新 | 开 | 插入公式导致后续编号变化时，重渲已显示的公式 |
| 刷新防抖 | `400` ms | 停止输入后等多久 |
| 调试日志 | 关 | 在控制台打印每次改写的前后对比 |

命令面板里有两个命令：重新扫描当前文件、在控制台打印编号表。

### 工作原理

Obsidian 用 MathJax 渲染数学。插件先 `loadMathJax()`，然后包住 `MathJax.tex2chtml`——每个公式从 TeX 变成 CHTML 都要经过这个函数：

1. **扫描**：同步扫完整篇笔记，建立 `label → 编号` 的表。代码块、行内代码、frontmatter、HTML 注释都会被跳过。因为这张表只依赖源码顺序，滚动、增量渲染、整篇重渲都不可能产生前后不一致的编号。
2. **改写**：对每个公式，删掉 `\label{...}[N]`，把 `\tag{编号}` 插到 MathJax 接受的位置——对齐环境插在 `\end{align}` 之前，其余情况插在顶层末尾，所以 `\left\{ … \right.` 里的 `cases`、`aligned` 都能正常工作。
3. **刷新**：每个渲染出来的容器都记着自己的原始 TeX。当编辑改变了编号表，可见的容器会被原地重渲。

整个过程里笔记文件是只读的：Markdown 里不会多出 `\tag`，也没有额外的编号语法要学。

### 已知限制

- 引用只在当前笔记内解析，不支持跨文件 `\ref`。
- 多个分屏同时显示不同笔记时，后台分屏可能借用前台笔记的编号表；活动分屏始终正确。
- hover 预览可能显示未处理的公式，直到笔记被打开。
- 一个 `$$` 块最多一个 `\label`；对齐环境整体共用一个编号。
- `\text{...}` 里的 `\label` 同样会被识别，因为扫描器工作在 TeX 字符串层面。

### 开发

```bash
npm install
npm test         # counter / scanner / rewriter 的单元测试（node --test）
npm run typecheck
npm run build    # 在 manifest.json 旁边生成 main.js
```

纯逻辑部分（`counter.ts`、`scanner.ts`、`rewriter.ts`）不依赖 Obsidian，可以直接测试。要在 vault 里边改边看，把构建指向插件目录：

```bash
VAULT_PLUGIN_DIR="<vault>/.obsidian/plugins/equation-ordinal" npm run build
```

### 许可

MIT
