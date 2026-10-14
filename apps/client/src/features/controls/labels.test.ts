import { describe, expect, test } from "bun:test";
import { DEFAULT_KEYMAP, rebind, type Keymap } from "./keymap.ts";
import { DEFAULT_LABELS, inSentence, keyLabels, keyName } from "./labels.ts";

const QWERTY = new Map([
  ["KeyQ", "q"],
  ["KeyW", "w"],
  ["KeyA", "a"],
  ["KeyS", "s"],
  ["KeyD", "d"],
  ["KeyM", "m"],
  ["Semicolon", ";"],
  ["Digit1", "1"],
]);
const AZERTY_MAP = new Map([
  ["KeyQ", "a"],
  ["KeyW", "z"],
  ["KeyA", "q"],
  ["Semicolon", "m"],
  ["Digit1", "&"],
]);

describe("keyName", () => {
  test("without a layout map, AZERTY names", () => {
    expect(keyName("KeyW")).toBe("Z");
    expect(keyName("KeyA")).toBe("Q");
    expect(keyName("KeyQ")).toBe("A");
    expect(keyName("KeyE")).toBe("E");
    expect(keyName("Semicolon")).toBe("M");
  });

  test("with a layout map, the printed letter", () => {
    expect(keyName("KeyW", QWERTY)).toBe("W");
    expect(keyName("KeyW", AZERTY_MAP)).toBe("Z");
    expect(keyName("Semicolon", AZERTY_MAP)).toBe("M");
    // Not in the map: the AZERTY fallback.
    expect(keyName("KeyZ", AZERTY_MAP)).toBe("W");
  });

  test("named keys, mouse buttons, digits and the numpad", () => {
    expect(keyName("Space")).toBe("Espace");
    expect(keyName("ShiftLeft")).toBe("Maj");
    expect(keyName("ShiftRight", null, true)).toBe("Maj droite");
    expect(keyName("ArrowUp")).toBe("↑");
    expect(keyName("Mouse0")).toBe("Clic");
    expect(keyName("Mouse2")).toBe("Clic droit");
    expect(keyName("Mouse3")).toBe("Souris 4");
    expect(keyName("Digit1", AZERTY_MAP)).toBe("1");
    expect(keyName("Numpad5")).toBe("Pavé 5");
  });

  test("clic goes lowercase mid-sentence, nothing else", () => {
    expect(inSentence("Clic droit")).toBe("clic droit");
    expect(inSentence("E")).toBe("E");
  });
});

describe("keyLabels", () => {
  test("the defaults read like the help always did", () => {
    expect(DEFAULT_LABELS).toEqual({
      move: "ZQSD ou flèches",
      attack: "Clic",
      jump: "Espace",
      dodge: "Maj",
      interact: "E",
      board: "Tab",
      help: "C",
      mute: "M",
    });
  });

  test("QWERTY with a layout map says WASD, and still M for the sound", () => {
    expect(keyLabels(DEFAULT_KEYMAP, QWERTY).move).toBe("WASD ou flèches");
    expect(keyLabels(DEFAULT_KEYMAP, QWERTY).mute).toBe("M");
    expect(keyLabels(DEFAULT_KEYMAP, AZERTY_MAP).mute).toBe("M");
  });

  test("follows a rebind", () => {
    const r = rebind(DEFAULT_KEYMAP, "jump", 0, "KeyF");
    if (!r.ok) throw new Error(r.reason);
    expect(keyLabels(r.keymap).jump).toBe("F");
  });

  test("movement without second keys, or on named keys", () => {
    const noArrows: Keymap = { ...DEFAULT_KEYMAP, up: ["KeyW", null] };
    expect(keyLabels(noArrows).move).toBe("ZQSD");
    const named: Keymap = { ...DEFAULT_KEYMAP, up: ["Numpad8", "ArrowUp"] };
    expect(keyLabels(named).move).toBe("Pavé 8 Q S D ou flèches");
  });
});
