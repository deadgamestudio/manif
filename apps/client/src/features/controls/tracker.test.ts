import { describe, expect, test } from "bun:test";
import { ACTIONS, DEFAULT_KEYMAP, rebind, type Action, type Keymap } from "./keymap.ts";
import { createTracker } from "./tracker.ts";

function setup(actions: readonly Action[] = ACTIONS, km: Keymap = DEFAULT_KEYMAP) {
  const log: string[] = [];
  const t = createTracker(() => km, new Set(actions), (a, pressed) => log.push(`${a}:${pressed ? "down" : "up"}`));
  return { t, log };
}

describe("keys", () => {
  test("keydown + keyup in the same tick still fires the action", () => {
    const { t, log } = setup(["jump"]);
    expect(t.press("Space")).toBe(true);
    t.release("Space");
    expect(log).toEqual(["jump:down", "jump:up"]);
    // And again: every tap counts.
    t.press("Space");
    t.release("Space");
    expect(log).toEqual(["jump:down", "jump:up", "jump:down", "jump:up"]);
  });

  test("a key that isn't ours: no fire, default kept", () => {
    const { t, log } = setup(["jump"]);
    expect(t.press("KeyE")).toBe(false);
    expect(t.press("KeyX")).toBe(false);
    expect(log).toEqual([]);
  });

  test("two keys on one action: down while either is held", () => {
    const { t, log } = setup(["up"]);
    t.press("KeyW");
    t.press("ArrowUp");
    t.release("KeyW");
    expect(log).toEqual(["up:down"]);
    t.release("ArrowUp");
    expect(log).toEqual(["up:down", "up:up"]);
  });

  test("blur lets go of everything held, and a late keyup does nothing", () => {
    const { t, log } = setup(["interact", "up"]);
    t.press("KeyE");
    t.press("KeyW");
    t.releaseAll();
    t.release("KeyE");
    expect(log).toEqual(["interact:down", "up:down", "interact:up", "up:up"]);
  });

  test("a rebound action follows the keymap at once", () => {
    const r = rebind(DEFAULT_KEYMAP, "jump", 0, "KeyF");
    if (!r.ok) throw new Error(r.reason);
    const { t, log } = setup(["jump"], r.keymap);
    expect(t.press("Space")).toBe(false);
    t.press("KeyF");
    t.release("KeyF");
    expect(log).toEqual(["jump:down", "jump:up"]);
  });
});

describe("mouse", () => {
  test("a click (down + up in the same tick) still fires the attack, every time", () => {
    const { t, log } = setup(["attack"]);
    for (let i = 0; i < 4; i++) {
      expect(t.pointer("pointerdown", 0, 1, true)).toEqual([0]);
      t.pointer("pointerup", 0, 0, true);
    }
    expect(log.filter((l) => l === "attack:down")).toHaveLength(4);
  });

  test("a click whose `buttons` says nothing still counts (the event's button wins)", () => {
    const { t, log } = setup(["attack"]);
    t.pointer("pointerdown", 0, 0, true);
    t.pointer("pointerup", 0, 0, true);
    expect(log).toEqual(["attack:down", "attack:up"]);
  });

  test("a lost pointerup doesn't eat the next click", () => {
    const { t, log } = setup(["attack"]);
    t.pointer("pointerdown", 0, 1, true);
    // No pointerup seen; next click:
    t.pointer("pointerdown", 0, 1, true);
    expect(log.filter((l) => l === "attack:down")).toHaveLength(2);
  });

  test("off the game view: no press, but the release still lands", () => {
    const { t, log } = setup(["attack"]);
    expect(t.pointer("pointerdown", 0, 1, false)).toEqual([]);
    t.pointer("pointerup", 0, 0, true);
    expect(log).toEqual([]);
  });

  test("a side button pressed while the left is held (pointermove, no pointerdown)", () => {
    const r = rebind(DEFAULT_KEYMAP, "dodge", 0, "Mouse3");
    if (!r.ok) throw new Error(r.reason);
    const { t, log } = setup(["attack", "dodge"], r.keymap);
    t.pointer("pointerdown", 0, 1, true);
    expect(t.pointer("pointermove", 3, 1 | 8, true)).toEqual([3]);
    t.pointer("pointermove", 3, 1, true);
    t.pointer("pointerup", 0, 0, true);
    expect(log).toEqual(["attack:down", "dodge:down", "dodge:up", "attack:up"]);
  });

  test("right and middle buttons map to their own bits", () => {
    const r = rebind(DEFAULT_KEYMAP, "jump", 1, "Mouse2");
    if (!r.ok) throw new Error(r.reason);
    const { t, log } = setup(["jump"], r.keymap);
    expect(t.pointer("pointerdown", 2, 2, true)).toEqual([2]);
    t.pointer("pointerup", 2, 0, true);
    expect(log).toEqual(["jump:down", "jump:up"]);
  });
});
