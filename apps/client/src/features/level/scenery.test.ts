import { describe, expect, test } from "bun:test";
import { STREET_LEVEL } from "@manif/shared";
import { crosswalkPlacements, dashPlacements, pavementPlacements } from "./scenery.ts";

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

describe("pavementPlacements", () => {
  test("every tile lies against its facade, inside the block's length, kerb towards the street", () => {
    const tiles = pavementPlacements(L);
    expect(tiles.length).toBeGreaterThan(50);
    for (const t of tiles) {
      const f = L.facades.find((fa) => Math.sign(t.x) === fa.side && t.z > fa.minZ && t.z < fa.maxZ);
      expect(f).toBeDefined();
      expect(Math.abs(t.x)).toBeCloseTo(f!.face - 1.5);
      // Kerb (+Z of the model) turned towards x = 0.
      expect(Math.sin(t.yaw) * Math.sign(t.x)).toBeLessThan(0);
    }
  });
});
