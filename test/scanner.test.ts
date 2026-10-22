import test from "node:test";
import assert from "node:assert/strict";

import { scanDocument } from "../src/scanner.ts";

test("numbers by source order", () => {
	const src = [
		"$$",
		"a = 1 \\label{first}",
		"$$",
		"",
		"$$",
		"b = 2 \\label{second}",
		"$$",
	].join("\n");

	const r = scanDocument(src);
	assert.equal(r.labels.get("first")?.number, "1");
	assert.equal(r.labels.get("second")?.number, "2");
	assert.equal(r.numberedBlocks, 2);
	assert.equal(r.errors.length, 0);
});

test("[N] resets the counter and counting continues", () => {
	const src = [
		"$$a \\label{a}$$",
		"$$b \\label{b}[5.1.10]$$",
		"$$c \\label{c}$$",
		"$$d \\label{d}$$",
	].join("\n");

	const r = scanDocument(src);
	assert.equal(r.labels.get("a")?.number, "1");
	assert.equal(r.labels.get("b")?.number, "5.1.10");
	assert.equal(r.labels.get("c")?.number, "5.1.11");
	assert.equal(r.labels.get("d")?.number, "5.1.12");
});

test("letter prefix", () => {
	const src = ["$$a \\label{a}[A.1]$$", "$$b \\label{b}$$"].join("\n");
	const r = scanDocument(src);
	assert.equal(r.labels.get("a")?.number, "A.1");
	assert.equal(r.labels.get("b")?.number, "A.2");
});

test("duplicate label: first wins, later reports E03", () => {
	const src = ["$$a \\label{x}$$", "$$b \\label{x}$$"].join("\n");
	const r = scanDocument(src);
	assert.equal(r.labels.get("x")?.number, "1");
	assert.equal(r.errors.filter((e) => e.code === "E03").length, 1);
});

test("label inside inline math reports E01", () => {
	const src = "and $a \\label{bad}$ holds";
	const r = scanDocument(src);
	assert.equal(r.labels.get("bad")?.number, null);
	assert.equal(r.labels.get("bad")?.error, "E01");
	assert.ok(r.errors.some((e) => e.code === "E01"));
});

test("two labels in one block report E02 and take no number", () => {
	const src = ["$$a \\label{x} \\\\ b \\label{y}$$", "$$c \\label{z}$$"].join("\n");
	const r = scanDocument(src);
	assert.ok(r.errors.filter((e) => e.code === "E02").length >= 2);
	assert.equal(r.labels.get("x")?.number, null);
	assert.equal(r.labels.get("z")?.number, "1");
});

test("invalid counter reports E05 and does not advance", () => {
	const src = ["$$a \\label{x}[1.2.]$$", "$$b \\label{y}$$"].join("\n");
	const r = scanDocument(src);
	assert.equal(r.labels.get("x")?.error, "E05");
	assert.ok(r.errors.some((e) => e.code === "E05"));
	assert.equal(r.labels.get("y")?.number, "1");
});

test("plain brackets are not treated as a counter", () => {
	const src = "$$a \\label{x}[0,1]$$";
	const r = scanDocument(src);
	assert.equal(r.labels.get("x")?.number, "1");
	assert.equal(r.errors.length, 0);
});

test("undefined ref reports E06", () => {
	const src = "$$a \\label{x}$$ and $\\ref{nope}$";
	const r = scanDocument(src);
	const ref = r.refs.find((x) => x.name === "nope");
	assert.equal(ref?.error, "E06");
	assert.ok(r.errors.some((e) => e.code === "E06"));
});

test("ref to an invalid label reports E07", () => {
	const src = "$a \\label{bad}$ and $\\ref{bad}$";
	const r = scanDocument(src);
	const ref = r.refs.find((x) => x.name === "bad");
	assert.equal(ref?.error, "E07");
});

test("refs inside display math are collected too", () => {
	const src = ["$$a \\label{x}$$", "$$b = \\ref{x}$$"].join("\n");
	const r = scanDocument(src);
	assert.equal(r.refs.length, 1);
	assert.equal(r.refs[0].inDisplay, true);
	assert.equal(r.refs[0].error, undefined);
});

test("labels inside fenced code blocks are ignored", () => {
	const src = ["```tex", "$$a \\label{x}$$", "```", "", "$$b \\label{y}$$"].join("\n");
	const r = scanDocument(src);
	assert.equal(r.labels.has("x"), false);
	assert.equal(r.labels.get("y")?.number, "1");
});

test("labels inside inline code are ignored", () => {
	const src = "`$$a \\label{x}$$` and $$b \\label{y}$$";
	const r = scanDocument(src);
	assert.equal(r.labels.has("x"), false);
	assert.equal(r.labels.get("y")?.number, "1");
});

test("frontmatter does not interfere", () => {
	const src = [
		"---",
		"title: x",
		'note: "$$ \\label{meta} $$"',
		"---",
		"",
		"$$a \\label{y}$$",
	].join("\n");
	const r = scanDocument(src);
	assert.equal(r.labels.has("meta"), false);
	assert.equal(r.labels.get("y")?.number, "1");
});

test("single-line and multi-line display blocks both work", () => {
	const src = ["$$a \\label{x}$$", "$$", "b \\label{y}", "$$"].join("\n");
	const r = scanDocument(src);
	assert.equal(r.labels.get("x")?.number, "1");
	assert.equal(r.labels.get("y")?.number, "2");
});

test("label may sit in the middle of a formula", () => {
	const src = "$$a \\label{x} + b = c$$";
	const r = scanDocument(src);
	assert.equal(r.labels.get("x")?.number, "1");
});
