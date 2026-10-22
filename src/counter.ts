/**
 * 计数器：纯函数。
 *
 * [N] 的合法形态：
 *   3        -> { prefix: "",    last: 3 }
 *   4.2      -> { prefix: "4.",  last: 2 }
 *   5.1.10   -> { prefix: "5.1.", last: 10 }
 *   A.1      -> { prefix: "A.",  last: 1 }
 *
 * 最后一段必须是纯数字；最后一个小数点之前允许字母。
 */

import type { Counter } from "./types.ts";

export const INITIAL_COUNTER: Counter = { prefix: "", last: 0 };

const COUNTER_RE = /^([0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*\.)?(\d+)$/;

/** 解析 [N]，不合法返回 null */
export function parseCounter(raw: string): Counter | null {
	const m = COUNTER_RE.exec(raw);
	if (!m) return null;
	return { prefix: m[1] ?? "", last: parseInt(m[2], 10) };
}

/** 计数器 +1，返回新计数器与编号字符串 */
export function step(counter: Counter): { counter: Counter; number: string } {
	const next: Counter = { prefix: counter.prefix, last: counter.last + 1 };
	return { counter: next, number: formatCounter(next) };
}

export function formatCounter(c: Counter): string {
	return c.prefix + String(c.last);
}

/** 复制计数器，避免共享引用 */
export function cloneCounter(c: Counter): Counter {
	return { prefix: c.prefix, last: c.last };
}
