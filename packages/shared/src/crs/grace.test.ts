import { describe, expect, test } from "bun:test";
import { RESPAWN_INVULNERABILITY } from "../health/index.js";
import { CRS_GRACE } from "./constants.js";
import { CrsGrace } from "./grace.js";

describe("CrsGrace (#131)", () => {
  test("freed from a grab: CRS_GRACE of grace, then none", () => {
    const g = new CrsGrace();
    expect(g.isGraced("a", 10)).toBe(false);
    g.freed("a", 10);
    expect(g.isGraced("a", 10)).toBe(true);
    expect(g.isGraced("a", 10 + CRS_GRACE - 0.01)).toBe(true);
    expect(g.isGraced("a", 10 + CRS_GRACE)).toBe(false);
    // Only them.
    expect(g.isGraced("b", 10.5)).toBe(false);
  });

  test("back on their feet: the baton knockdown is forgotten and the grace starts", () => {
    const g = new CrsGrace();
    g.floored("a");
    expect(g.isBatonDown("a", true)).toBe(true);
    // Standing, a baton knockdown is no knockdown.
    expect(g.isBatonDown("a", false)).toBe(false);
    expect(g.isGraced("a", 5)).toBe(false);
    g.gotUp("a", 5);
    expect(g.isBatonDown("a", true)).toBe(false);
    expect(g.isGraced("a", 5 + CRS_GRACE / 2)).toBe(true);
    expect(g.isGraced("a", 5 + CRS_GRACE)).toBe(false);
  });

  test("back from the van: the grace runs CRS_GRACE past the respawn invulnerability", () => {
    const g = new CrsGrace();
    g.respawned("a", 20);
    expect(g.isGraced("a", 20 + RESPAWN_INVULNERABILITY + CRS_GRACE - 0.01)).toBe(true);
    expect(g.isGraced("a", 20 + RESPAWN_INVULNERABILITY + CRS_GRACE)).toBe(false);
  });

  test("joining mid-march: CRS_GRACE", () => {
    const g = new CrsGrace();
    g.joined("a", 3);
    expect(g.isGraced("a", 3 + CRS_GRACE - 0.01)).toBe(true);
    expect(g.isGraced("a", 3 + CRS_GRACE)).toBe(false);
  });

  test("a shorter grace never cuts a longer one short; a later one extends it", () => {
    const g = new CrsGrace();
    g.respawned("a", 0);
    g.freed("a", 0.5);
    expect(g.isGraced("a", RESPAWN_INVULNERABILITY + CRS_GRACE - 0.01)).toBe(true);
    g.freed("a", 10);
    expect(g.isGraced("a", 10 + CRS_GRACE - 0.01)).toBe(true);
    g.grant("a", 11, 0);
    g.grant("a", 11, Number.NaN);
    expect(g.isGraced("a", 10 + CRS_GRACE)).toBe(false);
  });

  test("leaving forgets everything", () => {
    const g = new CrsGrace();
    g.floored("a");
    g.freed("a", 0);
    g.remove("a");
    expect(g.isBatonDown("a", true)).toBe(false);
    expect(g.isGraced("a", 0.5)).toBe(false);
    g.freed("b", 0);
    g.clear();
    expect(g.isGraced("b", 0.5)).toBe(false);
  });
});
