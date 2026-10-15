import { describe, expect, test } from "bun:test";
import { STREET_LEVEL, generateShops } from "@manif/shared";
import { carveBlocks } from "./blocks.ts";
import { HAUSSMANN, haussmann, type PartBox } from "./haussmann.ts";

/** A fixed random sequence, so the street's shops are the same every run. */
function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const shops = generateShops(STREET_LEVEL, lcg(7));
const { blocks } = carveBlocks(STREET_LEVEL, shops);
const looks = blocks.map((b) => ({ block: b, look: haussmann(b) }));

/** How far a box reaches out of its block's footprint, horizontally. */
function overhang(p: PartBox, b: (typeof blocks)[number]["box"]): number {
  return Math.max(
    0,
    b.x - b.halfX - p.min[0],
    p.max[0] - (b.x + b.halfX),
    b.z - b.halfZ - p.min[2],
    p.max[2] - (b.z + b.halfZ),
  );
}

describe("haussmann", () => {
  test("the street has shops carved into its blocks", () => {
    expect(blocks.some((b) => b.rooms.length > 0)).toBe(true);
  });

  test("the same block always gets the same look", () => {
    for (const { block, look } of looks) expect(haussmann(block)).toEqual(look);
  });

  test("blocks do not all look alike", () => {
    expect(new Set(looks.map(({ look }) => look.stone)).size).toBeGreaterThan(1);
  });

  test("nothing sticks out of a block by more than a balcony", () => {
    for (const { block, look } of looks) {
      for (const p of look.boxes) expect(overhang(p, block.box)).toBeLessThanOrEqual(HAUSSMANN.balcony + 1e-9);
    }
  });

  test("whatever sticks out stays above the tallest shop front, except the base's flat joints and doors", () => {
    for (const { block, look } of looks) {
      for (const p of look.boxes) {
        if (overhang(p, block.box) > 0.1) expect(p.min[1]).toBeGreaterThanOrEqual(4.25);
      }
    }
  });

  test("no part stands in front of a doorway, below the top of its shop front", () => {
    for (const { block, look } of looks) {
      for (const r of block.rooms) {
        const face = r.side < 0 ? r.rect.maxX : r.rect.minX;
        for (const p of look.boxes) {
          if (p.part === "stone" || p.part === "base") continue;
          // In front of the doorway: across its width, below its top, and on the street side of the facade.
          const across = p.max[2] > r.rect.minZ && p.min[2] < r.rect.maxZ;
          const below = p.min[1] < r.height;
          const outside = r.side < 0 ? p.max[0] > face - 0.01 : p.min[0] < face + 0.01;
          expect(across && below && outside).toBe(false);
        }
      }
    }
  });

  test("the walls are exactly the carved pieces, so doorways stay open", () => {
    for (const { block, look } of looks) {
      const walls = look.boxes.filter((p) => p.part === "stone" || p.part === "base");
      for (const r of block.rooms) {
        const inside = walls.filter(
          (w) =>
            w.min[0] < r.rect.maxX - 0.01 &&
            w.max[0] > r.rect.minX + 0.01 &&
            w.min[2] < r.rect.maxZ - 0.01 &&
            w.max[2] > r.rect.minZ + 0.01 &&
            w.min[1] < r.height - 0.01,
        );
        expect(inside).toEqual([]);
      }
    }
  });

  test("a mansard roof sits on top of every block, and the occlusion top includes it", () => {
    for (const { block, look } of looks) {
      expect(look.roof.y0).toBe(block.box.height);
      expect(look.top).toBe(block.box.height + HAUSSMANN.roof);
      expect(look.roof.inset * 2).toBeLessThan(Math.min(block.box.halfX, block.box.halfZ) * 2);
    }
  });

  test("every block has windows, balconies and chimneys", () => {
    for (const { look } of looks) {
      const parts = new Set(look.boxes.map((p) => p.part));
      for (const part of ["glass", "iron", "chimney", "pot", "dormer", "cornice"] as const) expect(parts.has(part)).toBe(true);
    }
  });
});
