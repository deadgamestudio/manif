import { expect, test } from "bun:test";
import { nextMode } from "./inputMode.ts";

test("a finger switches to touch", () => {
  expect(nextMode("keyboard", { type: "pointerdown", pointerType: "touch" })).toBe("touch");
  expect(nextMode("touch", { type: "pointerdown", pointerType: "touch" })).toBe("touch");
});

test("any key switches back to the keyboard", () => {
  expect(nextMode("touch", { type: "keydown" })).toBe("keyboard");
  expect(nextMode("keyboard", { type: "keydown" })).toBe("keyboard");
});

test("a mouse or pen click keeps the current mode", () => {
  expect(nextMode("touch", { type: "pointerdown", pointerType: "mouse" })).toBe("touch");
  expect(nextMode("keyboard", { type: "pointerdown", pointerType: "mouse" })).toBe("keyboard");
  expect(nextMode("touch", { type: "pointerdown", pointerType: "pen" })).toBe("touch");
});
