# Changelog

## 1.0.0 — 2026-10-22

First release.

- `\label{name}` and `\label{name}[N]` inside `$$...$$`, numbered by source order.
- `\ref{name}` and `\eqref{name}` expanding to `(number)`, in inline and display math.
- Dotted and letter-prefixed counters (`4.2`, `5.1.10`, `A.1`) that increment only the last segment.
- Seven error codes (E01–E07), rendered in place and logged with file name and line number.
- Live in-place refresh of rendered formulas when the numbering table changes.
- Render-time only: the note file is never modified.
