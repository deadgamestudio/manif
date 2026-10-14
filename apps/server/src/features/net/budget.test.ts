import { describe, expect, test } from "bun:test";
import { DEFAULT_BUDGET, MessageBudget, gateMessages, type BudgetConfig } from "./index.js";

const config: BudgetConfig = {
  byType: { move: { perSecond: 10, burst: 20 } },
  other: { perSecond: 2, burst: 4 },
  maxDrops: 5,
  strikeWindowMs: 1000,
};

const run = (budget: MessageBudget, id: string, type: string, n: number, now: number) =>
  Array.from({ length: n }, () => budget.take(id, type, now));

describe("message budget", () => {
  test("a burst passes, then excess is dropped", () => {
    const b = new MessageBudget(config);
    expect(run(b, "a", "move", 20, 0).every((v) => v === "ok")).toBe(true);
    expect(b.take("a", "move", 0)).toBe("drop");
  });

  test("the budget refills at the sustained rate", () => {
    const b = new MessageBudget(config);
    run(b, "a", "move", 20, 0);
    expect(b.take("a", "move", 50)).toBe("drop"); // half a message back
    expect(b.take("a", "move", 100)).toBe("ok"); // one back after 100 ms at 10/s
    expect(b.take("a", "move", 100)).toBe("drop");
  });

  test("a steady stream at the sustained rate never drops", () => {
    const b = new MessageBudget(config);
    for (let t = 0; t < 10_000; t += 100) expect(b.take("a", "move", t)).toBe("ok");
  });

  test("each type has its own bucket; unlisted types use the default rate", () => {
    const b = new MessageBudget(config);
    expect(run(b, "a", "attack", 4, 0).every((v) => v === "ok")).toBe(true);
    expect(b.take("a", "attack", 0)).toBe("drop");
    expect(b.take("a", "dodge", 0)).toBe("ok");
    expect(b.take("a", "move", 0)).toBe("ok");
  });

  test("clients don't share a budget", () => {
    const b = new MessageBudget(config);
    run(b, "a", "attack", 4, 0);
    expect(b.take("a", "attack", 0)).toBe("drop");
    expect(b.take("b", "attack", 0)).toBe("ok");
  });

  test("going over again and again disconnects; drops spread out don't", () => {
    const b = new MessageBudget(config);
    run(b, "a", "attack", 4, 0);
    expect(run(b, "a", "attack", 4, 0)).toEqual(["drop", "drop", "drop", "drop"]);
    expect(b.take("a", "attack", 0)).toBe("kick");

    const slow = new MessageBudget(config);
    run(slow, "s", "attack", 4, 0);
    // One drop every 1.5 s: the strike window restarts each time.
    for (let i = 1; i <= 20; i++) {
      const t = i * 1500;
      run(slow, "s", "attack", 3, t); // 3 ok (refilled), the rest over
      expect(slow.take("s", "attack", t)).toBe("drop");
    }
  });

  test("a client that left is forgotten", () => {
    const b = new MessageBudget(config);
    run(b, "a", "attack", 4, 0);
    b.remove("a");
    expect(b.tracked).toBe(0);
    expect(b.take("a", "attack", 0)).toBe("ok");
  });

  test("the defaults leave room for real play", () => {
    const b = new MessageBudget(DEFAULT_BUDGET);
    // A touch stick on a 120 Hz screen: a move every frame for a minute.
    for (let i = 0; i < 120 * 60; i++) expect(b.take("p", "move", (i * 1000) / 120)).toBe("ok");
    // Mashing struggle with key repeat (about 30 a second) for 10 s.
    for (let i = 0; i < 300; i++) expect(b.take("p", "struggle", (i * 1000) / 30)).toBe("ok");
  });
});

describe("gating a messages map", () => {
  test("handlers run only when allowed, with the client and message", () => {
    const seen: string[] = [];
    const handlers = {
      a: (c: string, m: unknown) => seen.push(`a:${c}:${String(m)}`),
      b: (c: string, _m: unknown) => seen.push(`b:${c}`),
    };
    const gated = gateMessages<string, typeof handlers>(handlers, (client, type) => !(client === "x" && type === "b"));
    gated.a("x", 1);
    gated.b("x", undefined);
    gated.b("y", undefined);
    expect(seen).toEqual(["a:x:1", "b:y"]);
    expect(Object.keys(gated)).toEqual(["a", "b"]);
  });
});
