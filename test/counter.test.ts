import test from "node:test";
import assert from "node:assert/strict";

import {
	INITIAL_COUNTER,
	formatCounter,
	parseCounter,
	step,
} from "../src/counter.ts";

test("parseCounter accepts valid forms", () => {
	assert.deepEqual(parseCounter("3"), { prefix: "", last: 3 });
	assert.deepEqual(parseCounter("4.2"), { prefix: "4.", last: 2 });
	assert.deepEqual(parseCounter("5.1.10"), { prefix: "5.1.", last: 10 });
	assert.deepEqual(parseCounter("A.1"), { prefix: "A.", last: 1 });
	assert.deepEqual(parseCounter("A.B.3"), { prefix: "A.B.", last: 3 });
	assert.deepEqual(parseCounter("1"), { prefix: "", last: 1 });
});

test("parseCounter rejects invalid forms", () => {
	for (const bad of ["", "1.2.", ".1", "1..2", "3a", "a", "1.", "-1", "1 2", "1.2.3.x"]) {
		assert.equal(parseCounter(bad), null, `should reject ${JSON.stringify(bad)}`);
	}
});

test("step only increments the last segment", () => {
	let r = step({ prefix: "5.1.", last: 10 });
	assert.equal(r.number, "5.1.11");
	assert.deepEqual(r.counter, { prefix: "5.1.", last: 11 });

	r = step({ prefix: "", last: 0 });
	assert.equal(r.number, "1");

	r = step({ prefix: "A.", last: 1 });
	assert.equal(r.number, "A.2");
});

test("formatCounter and INITIAL_COUNTER", () => {
	assert.equal(formatCounter(INITIAL_COUNTER), "0");
	let c = INITIAL_COUNTER;
	for (const expected of ["1", "2", "3"]) {
		const r = step(c);
		c = r.counter;
		assert.equal(r.number, expected);
	}
});
