import { describe, expect, test } from "bun:test";
import { SKIN_CELL, isPaletteSize, paintCell, paintCells, paintKey, parseHexColour } from "./palettePixels.ts";

/** A 16×1 strip where cell i is (i, i + 100, i + 200, 255). */
function strip(): Uint8Array {
  const px = new Uint8Array(16 * 4);
  for (let i = 0; i < 16; i++) px.set([i, i + 100, i + 200, 255], i * 4);
  return px;
}

describe("palette pixels", () => {
  test("paints only the skin cell, on a copy", () => {
    const src = strip();
    const out = paintCell(src, 16, 1, SKIN_CELL, [0x8d, 0x6e, 0x63]);
    expect(Array.from(out.slice(6 * 4, 7 * 4))).toEqual([0x8d, 0x6e, 0x63, 255]);
    for (let i = 0; i < 16; i++) {
      if (i === SKIN_CELL) continue;
      expect(Array.from(out.slice(i * 4, i * 4 + 4))).toEqual([i, i + 100, i + 200, 255]);
    }
    expect(Array.from(src.slice(6 * 4, 7 * 4))).toEqual([6, 106, 206, 255]);
  });

  test("a wider strip paints the whole cell, on every row", () => {
    const w = 32;
    const h = 2;
    const out = paintCell(new Uint8Array(w * h * 4), w, h, SKIN_CELL, [1, 2, 3]);
    const painted: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (out[(y * w + x) * 4] === 1) painted.push(y * w + x);
    expect(painted).toEqual([12, 13, 44, 45]);
  });

  test("paints several cells at once, on a copy", () => {
    const src = strip();
    const out = paintCells(src, 16, 1, { 1: "#203a68", [SKIN_CELL]: "#8D6E63" });
    expect(Array.from(out.slice(4, 8))).toEqual([0x20, 0x3a, 0x68, 255]);
    expect(Array.from(out.slice(6 * 4, 7 * 4))).toEqual([0x8d, 0x6e, 0x63, 255]);
    expect(Array.from(out.slice(8 * 4, 9 * 4))).toEqual([8, 108, 208, 255]);
    expect(Array.from(src.slice(4, 8))).toEqual([1, 101, 201, 255]);
  });

  test("keys a paint the same whatever the order or case", () => {
    expect(paintKey({ 6: "#8D6E63", 1: "203a68" })).toBe("1:#203a68,6:#8d6e63");
    expect(paintKey({ 1: "#203a68", 6: "#8d6e63" })).toBe(paintKey({ 6: "#8d6e63", 1: "#203a68" }));
    expect(() => paintKey({ 16: "#000000" })).toThrow();
    expect(() => paintKey({ 1: "navy" })).toThrow();
  });

  test("rejects pixels that don't match the size", () => {
    expect(() => paintCell(new Uint8Array(8), 16, 1, SKIN_CELL, [0, 0, 0])).toThrow();
  });

  test("reads #rrggbb colours", () => {
    expect(parseHexColour("#8d6e63")).toEqual([141, 110, 99]);
    expect(parseHexColour("FFFFFF")).toEqual([255, 255, 255]);
    expect(() => parseHexColour("#fff")).toThrow();
    expect(() => parseHexColour("tomato")).toThrow();
  });

  test("knows a palette strip when it sees one", () => {
    expect(isPaletteSize(16, 1)).toBe(true);
    expect(isPaletteSize(32, 2)).toBe(true);
    expect(isPaletteSize(2048, 1536)).toBe(false);
    expect(isPaletteSize(16, 16)).toBe(false);
    expect(isPaletteSize(8, 1)).toBe(false);
  });
});
