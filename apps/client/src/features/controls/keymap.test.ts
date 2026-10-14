import { describe, expect, test } from "bun:test";
import {
  ACTIONS,
  DEFAULT_KEYMAP,
  actionFor,
  captureButton,
  captureKey,
  clearSecondary,
  isDefault,
  matches,
  mouseChanges,
  parseKeymap,
  rebind,
  serializeKeymap,
  type Binding,
  type Keymap,
} from "./keymap.ts";

const key = (code: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

/** Every binding in the keymap, to check none is used twice. */
const all = (km: Keymap): Binding[] => ACTIONS.flatMap((a) => km[a].filter((b): b is Binding => b !== null));

describe("defaults", () => {
  test("ZQSD + arrows, click, Space, Shift, E, Tab, C, M; no key on two actions", () => {
    expect(DEFAULT_KEYMAP.up).toEqual(["KeyW", "ArrowUp"]);
    expect(DEFAULT_KEYMAP.attack[0]).toBe("Mouse0");
    expect(DEFAULT_KEYMAP.jump[0]).toBe("Space");
    expect(DEFAULT_KEYMAP.dodge).toEqual(["ShiftLeft", "ShiftRight"]);
    expect(DEFAULT_KEYMAP.interact[0]).toBe("KeyE");
    expect(DEFAULT_KEYMAP.board[0]).toBe("Tab");
    expect(DEFAULT_KEYMAP.help[0]).toBe("KeyC");
    expect(DEFAULT_KEYMAP.mute).toContain("KeyM");
    const b = all(DEFAULT_KEYMAP);
    expect(new Set(b).size).toBe(b.length);
  });
});

describe("matching", () => {
  test("a binding finds its action, primary or secondary", () => {
    expect(actionFor(DEFAULT_KEYMAP, "KeyW")).toBe("up");
    expect(actionFor(DEFAULT_KEYMAP, "ArrowUp")).toBe("up");
    expect(actionFor(DEFAULT_KEYMAP, "ShiftRight")).toBe("dodge");
    expect(actionFor(DEFAULT_KEYMAP, "Mouse0")).toBe("attack");
    expect(actionFor(DEFAULT_KEYMAP, "KeyX")).toBeNull();
    expect(matches(DEFAULT_KEYMAP, "jump", "Space")).toBe(true);
    expect(matches(DEFAULT_KEYMAP, "jump", "KeyE")).toBe(false);
  });

  test("a rebound action answers to its new key only", () => {
    const r = rebind(DEFAULT_KEYMAP, "jump", 0, "KeyF");
    if (!r.ok) throw new Error(r.reason);
    expect(actionFor(r.keymap, "KeyF")).toBe("jump");
    expect(actionFor(r.keymap, "Space")).toBeNull();
  });
});

describe("mouse buttons", () => {
  test("a left press and release", () => {
    expect(mouseChanges(0, 1)).toEqual([{ button: 0, down: true }]);
    expect(mouseChanges(1, 0)).toEqual([{ button: 0, down: false }]);
  });

  test("a side button pressed while the left is held (no pointerdown for it)", () => {
    expect(mouseChanges(1, 1 | 8)).toEqual([{ button: 3, down: true }]);
  });

  test("right and middle use swapped bits", () => {
    expect(mouseChanges(0, 2)).toEqual([{ button: 2, down: true }]);
    expect(mouseChanges(0, 4)).toEqual([{ button: 1, down: true }]);
    expect(mouseChanges(5, 5)).toEqual([]);
  });
});

describe("reserved keys and combos", () => {
  test("Escape, function keys and system modifiers are refused", () => {
    for (const code of ["Escape", "F5", "F11", "F12", "ControlLeft", "MetaLeft", "AltRight", "CapsLock", "", "Unidentified"]) {
      expect(captureKey(key(code))).toHaveProperty("reason");
    }
  });

  test("combos with Ctrl, Cmd, Alt or Shift are refused; Shift alone is fine", () => {
    expect(captureKey(key("KeyW", { ctrlKey: true }))).toHaveProperty("reason");
    expect(captureKey(key("KeyR", { metaKey: true }))).toHaveProperty("reason");
    expect(captureKey(key("KeyE", { altKey: true }))).toHaveProperty("reason");
    expect(captureKey(key("KeyE", { shiftKey: true }))).toHaveProperty("reason");
    expect(captureKey(key("ShiftLeft", { shiftKey: true }))).toEqual({ binding: "ShiftLeft" });
    expect(captureKey(key("KeyF"))).toEqual({ binding: "KeyF" });
  });

  test("mouse buttons 0 to 4 can be bound, nothing past them", () => {
    expect(captureButton(0)).toEqual({ binding: "Mouse0" });
    expect(captureButton(4)).toEqual({ binding: "Mouse4" });
    expect(captureButton(5)).toHaveProperty("reason");
    expect(captureButton(-1)).toHaveProperty("reason");
  });

  test("rebind itself refuses a reserved binding", () => {
    expect(rebind(DEFAULT_KEYMAP, "jump", 0, "Escape").ok).toBe(false);
    expect(rebind(DEFAULT_KEYMAP, "jump", 0, "F5").ok).toBe(false);
  });
});

describe("conflicts", () => {
  test("a key already used swaps: the other action gets the old key", () => {
    const r = rebind(DEFAULT_KEYMAP, "jump", 0, "KeyE");
    if (!r.ok) throw new Error(r.reason);
    expect(r.swappedWith).toBe("interact");
    expect(r.keymap.jump[0]).toBe("KeyE");
    expect(r.keymap.interact[0]).toBe("Space");
    const b = all(r.keymap);
    expect(new Set(b).size).toBe(b.length);
  });

  test("the attack can go on a key and the click elsewhere", () => {
    const r = rebind(DEFAULT_KEYMAP, "attack", 0, "KeyF");
    if (!r.ok) throw new Error(r.reason);
    const r2 = rebind(r.keymap, "jump", 1, "Mouse0");
    if (!r2.ok) throw new Error(r2.reason);
    expect(r2.keymap.jump).toEqual(["Space", "Mouse0"]);
    expect(actionFor(r2.keymap, "Mouse0")).toBe("jump");
  });

  test("taking another action's only key into an empty slot is refused", () => {
    const r = rebind(DEFAULT_KEYMAP, "jump", 1, "KeyE");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("seule touche");
  });

  test("taking another action's second key into an empty slot just moves it", () => {
    const r = rebind(DEFAULT_KEYMAP, "jump", 1, "ArrowUp");
    if (!r.ok) throw new Error(r.reason);
    expect(r.keymap.jump).toEqual(["Space", "ArrowUp"]);
    expect(r.keymap.up).toEqual(["KeyW", null]);
  });

  test("an action's own other key swaps its two slots", () => {
    const r = rebind(DEFAULT_KEYMAP, "up", 0, "ArrowUp");
    if (!r.ok) throw new Error(r.reason);
    expect(r.keymap.up).toEqual(["ArrowUp", "KeyW"]);
    expect(r.swappedWith).toBeUndefined();
  });

  test("the same key again changes nothing", () => {
    const r = rebind(DEFAULT_KEYMAP, "jump", 0, "Space");
    expect(r.ok && r.keymap).toBe(DEFAULT_KEYMAP);
  });

  test("clearing a second key keeps the first", () => {
    expect(clearSecondary(DEFAULT_KEYMAP, "up").up).toEqual(["KeyW", null]);
  });
});

describe("saving and loading", () => {
  test("round trip", () => {
    const r = rebind(DEFAULT_KEYMAP, "dodge", 0, "Mouse3");
    if (!r.ok) throw new Error(r.reason);
    expect(parseKeymap(serializeKeymap(r.keymap))).toEqual(r.keymap);
    expect(isDefault(parseKeymap(serializeKeymap(DEFAULT_KEYMAP)))).toBe(true);
  });

  test("nothing, junk, another version or the wrong shape gives the defaults", () => {
    for (const raw of [null, "", "{", "null", "42", '"x"', "[]", '{"v":2,"bindings":{}}', '{"bindings":{"jump":["KeyF",null]}}', '{"v":1}', '{"v":1,"bindings":"no"}']) {
      expect(parseKeymap(raw)).toEqual(DEFAULT_KEYMAP);
    }
  });

  test("an action missing from old data gets its default; bad keys too", () => {
    const km = parseKeymap(JSON.stringify({ v: 1, bindings: { jump: ["KeyF", null], help: ["Escape", 7], up: "KeyW" } }));
    expect(km.jump).toEqual(["KeyF", null]);
    expect(km.help).toEqual(DEFAULT_KEYMAP.help);
    expect(km.up).toEqual(DEFAULT_KEYMAP.up);
    expect(km.mute).toEqual(DEFAULT_KEYMAP.mute);
  });

  test("an empty primary takes the secondary", () => {
    const km = parseKeymap(JSON.stringify({ v: 1, bindings: { jump: [null, "KeyF"] } }));
    expect(km.jump).toEqual(["KeyF", null]);
  });

  test("a key on two actions starts over from the defaults", () => {
    const km = parseKeymap(JSON.stringify({ v: 1, bindings: { jump: ["KeyE", null] } }));
    expect(km).toEqual(DEFAULT_KEYMAP);
  });
});
