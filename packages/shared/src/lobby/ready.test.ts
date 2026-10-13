import { describe, expect, test } from "bun:test";
import { Phase } from "../round/constants.js";
import { canSetReady, canStart, isBotId, readyRequired } from "./ready.js";

const p = (id: string, ready = false) => ({ id, ready });

describe("canStart", () => {
  test("a host alone starts at once", () => {
    expect(canStart([p("h")], "h")).toEqual({ ok: true, notReady: [], required: 0, ready: 0 });
  });

  test("waits for every other player; the host's own flag doesn't matter", () => {
    const res = canStart([p("h", false), p("a", true), p("b", false), p("c", false)], "h");
    expect(res).toEqual({ ok: false, notReady: ["b", "c"], required: 3, ready: 1 });
    expect(canStart([p("h", false), p("a", true), p("b", true)], "h").ok).toBe(true);
  });

  test("force starts anyway and still names who isn't ready", () => {
    expect(canStart([p("h"), p("a"), p("b", true)], "h", true)).toEqual({ ok: true, notReady: ["a"], required: 2, ready: 1 });
  });

  test("a newcomer un-readies the group; the only one not ready leaving lets Start through", () => {
    const room = [p("h"), p("a", true)];
    expect(canStart(room, "h").ok).toBe(true);
    expect(canStart([...room, p("new")], "h")).toMatchObject({ ok: false, notReady: ["new"] });
    expect(canStart(room.filter((q) => q.id !== "new"), "h").ok).toBe(true);
  });

  test("host hand-over: the new host's old ready flag is ignored, the old host is gone", () => {
    // "a" was ready, becomes host after "h" leaves; "b" is not ready.
    expect(canStart([p("a", true), p("b")], "a")).toEqual({ ok: false, notReady: ["b"], required: 1, ready: 0 });
  });

  test("bots are never waited for", () => {
    expect(isBotId("bot:1")).toBe(true);
    expect(isBotId("abc")).toBe(false);
    expect(canStart([p("h"), p("bot:1"), p("bot:2"), p("a", true)], "h")).toEqual({ ok: true, notReady: [], required: 1, ready: 1 });
    expect(readyRequired(["h", "bot:x", "a", "b"], "h")).toEqual(["a", "b"]);
  });
});

describe("canSetReady", () => {
  test("lobby only", () => {
    expect(canSetReady(Phase.Waiting)).toBe(true);
    expect(canSetReady(Phase.Marching)).toBe(false);
    expect(canSetReady(Phase.Ended)).toBe(false);
  });
});
