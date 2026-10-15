import { describe, expect, test } from "bun:test";
import { STREET_LEVEL, type Rect } from "@manif/shared";
import { crosswalkPlacements, cutRange, dashPlacements, kerbLayout, KERB_WIDTH, PAVEMENT_DEEP } from "./scenery.ts";

const L = STREET_LEVEL;

describe("crosswalkPlacements", () => {
  test("crosswalks stay in the street, off the start and the destination", () => {
    const cw = crosswalkPlacements(L);
    expect(cw.length).toBeGreaterThan(0);
    for (const c of cw) {
      expect(c.z - 2).toBeGreaterThan(L.destination.maxZ);
      expect(c.z + 2).toBeLessThan(L.start.minZ);
    }
  });
});

describe("dashPlacements", () => {
  test("no dash runs across a crosswalk", () => {
    const cw = crosswalkPlacements(L);
    for (const d of dashPlacements(L)) for (const c of cw) expect(Math.abs(d.z - c.z)).toBeGreaterThanOrEqual(3);
  });

  test("the dashes run between the destination and the start", () => {
    const dashes = dashPlacements(L);
    expect(dashes.length).toBeGreaterThan(30);
    for (const d of dashes) {
      expect(d.z - 1).toBeGreaterThan(L.destination.maxZ);
      expect(d.z + 1).toBeLessThan(L.start.minZ);
    }
  });
});

describe("cutRange", () => {
  test("takes the cuts out of the range", () => {
    expect(cutRange(0, 10, [[2, 4], [8, 12], [-5, -1]])).toEqual([[0, 2], [4, 8]]);
    expect(cutRange(0, 10, [[-1, 11]])).toEqual([]);
  });
});

describe("kerbLayout", () => {
  const layout = kerbLayout(L);
  const facadeOf = (r: Rect) => L.facades.find((f) => Math.sign(r.minX + r.maxX) === f.side && r.minZ >= f.minZ - 1e-9 && r.maxZ <= f.maxZ + 1e-9);

  test("one pavement per facade, from the kerb line to the facade, inside the block's length", () => {
    expect(layout.pavements.length).toBe(L.facades.length);
    for (const p of layout.pavements) {
      const f = facadeOf(p)!;
      expect(f).toBeDefined();
      expect(p.maxX - p.minX).toBeCloseTo(PAVEMENT_DEEP);
      expect(f.side < 0 ? p.minX : p.maxX).toBeCloseTo(f.side * f.face);
    }
  });

  test("the kerb and gutter breaks where a crosswalk meets the pavement, and only there", () => {
    const cw = crosswalkPlacements(L);
    for (const r of [...layout.kerbs, ...layout.gutters]) for (const c of cw) expect(r.maxZ <= c.z - 2 + 1e-9 || r.minZ >= c.z + 2 - 1e-9).toBe(true);
    // Along the street, the kerb covers the whole pavement but for the crossings.
    const along = layout.kerbs.filter((k) => k.maxX - k.minX < KERB_WIDTH + 1e-9 && k.maxZ - k.minZ > KERB_WIDTH + 1e-9);
    const kerbLength = along.reduce((sum, k) => sum + k.maxZ - k.minZ, 0);
    const pavementLength = layout.pavements.reduce((sum, p) => sum + p.maxZ - p.minZ, 0);
    const crossed = layout.pavements.reduce((sum, p) => sum + cw.filter((c) => c.z - 2 >= p.minZ && c.z + 2 <= p.maxZ).length * 4, 0);
    expect(kerbLength).toBeCloseTo(pavementLength - crossed);
  });

  test("the gutter lies on the road, against the kerb, and the kerb on the pavement", () => {
    for (const g of layout.gutters) {
      const f = facadeOf(g)!;
      const kerbLine = f.face - PAVEMENT_DEEP;
      expect(Math.max(Math.abs(g.minX), Math.abs(g.maxX))).toBeCloseTo(kerbLine);
    }
    for (const k of layout.kerbs) {
      const f = facadeOf(k)!;
      expect(Math.min(Math.abs(k.minX), Math.abs(k.maxX))).toBeGreaterThanOrEqual(f.face - PAVEMENT_DEEP - 1e-9);
      expect(Math.max(Math.abs(k.minX), Math.abs(k.maxX))).toBeLessThanOrEqual(f.face + 1e-9);
    }
  });

  test("nothing over the destination, where the forecourt is", () => {
    const d = L.destination;
    for (const r of [...layout.pavements, ...layout.kerbs, ...layout.gutters]) {
      const overlaps = r.minX < d.maxX && r.maxX > d.minX && r.minZ < d.maxZ && r.maxZ > d.minZ;
      expect(overlaps).toBe(false);
    }
  });
});
