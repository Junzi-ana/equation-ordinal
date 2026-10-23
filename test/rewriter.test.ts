import test from "node:test";
import assert from "node:assert/strict";

import { scanDocument } from "../src/scanner.ts";
import { insertTag, rewriteTex, stripLabels } from "../src/rewriter.ts";

const table = scanDocument(
	["$$a \\label{x}$$", "$$b \\label{y}[3.4]$$", "$$c \\label{z}$$"].join("\n"),
);

test("label expands to a tag", () => {
	assert.equal(rewriteTex("a \\label{x}", table), "a\\tag{1}");
	assert.equal(rewriteTex("b \\label{y}[3.4]", table), "b\\tag{3.4}");
	assert.equal(rewriteTex("c \\label{z}", table), "c\\tag{3.5}");
});

test("label in the middle of a formula", () => {
	assert.equal(rewriteTex("a \\label{x} + b", table), "a  + b\\tag{1}");
});

test("hand written tag is overridden by the label", () => {
	const out = rewriteTex("a \\tag{9} \\label{x}", table);
	assert.ok(out.includes("\\tag{1}"));
	assert.ok(!out.includes("\\tag{9}"));
});

test("ref expands to text", () => {
	assert.equal(rewriteTex("\\ref{x}", table), "\\text{(1)}");
	assert.equal(rewriteTex("\\eqref{y}", table), "\\text{(3.4)}");
});

test("ref honours a custom template", () => {
	assert.equal(rewriteTex("\\ref{x}", table, { refTemplate: "[{n}]" }), "\\text{[1]}");
});

test("undefined ref shows E06", () => {
	const out = rewriteTex("\\ref{nope}", table);
	assert.ok(out.includes("[E06]"));
	assert.ok(out.includes("\\color{red}"));
});

test("errors can be silenced", () => {
	assert.equal(rewriteTex("\\ref{nope}", table, { showErrors: false }), "\\text{?}");
});

test("tag goes after \\end of an align environment (renders centered by MathJax)", () => {
	assert.equal(
		rewriteTex("\\begin{align}a \\label{x}\\end{align}", table),
		"\\begin{align}a \\end{align}\\tag{1}",
	);
});

test("multi-line align with label after \\end keeps the tag at top level", () => {
	assert.equal(
		rewriteTex("\\begin{align}a\\\\b\\end{align}\\label{x}", table),
		"\\begin{align}a\\\\b\\end{align}\\tag{1}",
	);
});

test("tag stays at top level for cases-like subordinate environments", () => {
	const out = rewriteTex("\\left\\{\\begin{cases}1 \\label{x}\\end{cases}\\right.", table);
	assert.ok(out.endsWith("\\right.\\tag{1}"), out);
});

test("tex without label or ref is returned untouched", () => {
	const tex = "E = mc^2";
	assert.equal(rewriteTex(tex, table), tex);
});

test("rewriting is idempotent", () => {
	const once = rewriteTex("a \\label{x}", table);
	assert.equal(rewriteTex(once, table), once);
});

test("stripLabels only swallows real counters", () => {
	assert.deepEqual(stripLabels("a \\label{x}[2.1]"), { tex: "a ", names: ["x"] });
	assert.deepEqual(stripLabels("a \\label{x}[0,1]"), { tex: "a [0,1]", names: ["x"] });
	assert.deepEqual(stripLabels("a \\label{x} b"), { tex: "a  b", names: ["x"] });
});

test("insertTag on an empty formula", () => {
	assert.equal(insertTag("", "\\tag{1}"), "\\tag{1}");
});
