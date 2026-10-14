import { describe, expect, test } from "bun:test";
import { ACTION_POINTS, ARRIVED_BONUS, SCORE_MAX, WIN_BONUS } from "./constants.js";
import { actionPoints, addPoints, endBonus, isDeviceToken } from "./score.js";

describe("actionPoints", () => {
  test("each scored action is worth its row", () => {
    expect(actionPoints("rescues", 0)).toBe(50);
    expect(actionPoints("crsOut", 0)).toBe(60);
    expect(actionPoints("propsBroken", 0)).toBe(10);
    expect(actionPoints("splats", 0)).toBe(15);
    expect(actionPoints("firesLit", 0)).toBe(10);
    expect(actionPoints("hpHealed", 0, 7)).toBe(7);
    expect(actionPoints("arrests", 0)).toBe(-20);
  });

  test("jokes score nothing", () => {
    for (const stat of ["knockdowns", "slips", "hosed", "teammatesThrown"] as const) expect(actionPoints(stat, 0)).toBe(0);
  });

  test("past the per-round cap, an action scores nothing", () => {
    const cap = ACTION_POINTS.rescues?.cap ?? 0;
    expect(actionPoints("rescues", cap - 1)).toBe(50);
    expect(actionPoints("rescues", cap)).toBe(0);
    expect(actionPoints("rescues", cap + 10)).toBe(0);
  });

  test("an amount straddling the cap only counts the part under it", () => {
    const cap = ACTION_POINTS.hpHealed?.cap ?? 0;
    expect(actionPoints("hpHealed", cap - 2, 5)).toBe(2);
  });

  test("arrests have no cap: each one costs", () => {
    expect(actionPoints("arrests", 1000)).toBe(-20);
  });

  test("a zero or negative amount scores nothing", () => {
    expect(actionPoints("crsOut", 0, 0)).toBe(0);
    expect(actionPoints("crsOut", 0, -3)).toBe(0);
  });

  test("capped rescues: a staged grab-and-rescue loop between two friends stops paying", () => {
    let score = 0;
    for (let i = 0; i < 50; i++) score = addPoints(score, actionPoints("rescues", i));
    expect(score).toBe(50 * (ACTION_POINTS.rescues?.cap ?? 0));
  });
});

describe("addPoints", () => {
  test("never below 0", () => {
    expect(addPoints(0, -20)).toBe(0);
    expect(addPoints(10, -20)).toBe(0);
    expect(addPoints(30, -20)).toBe(10);
  });

  test("the floor applies at the moment: points earned after an arrest at 0 all count", () => {
    let score = addPoints(0, actionPoints("arrests", 0));
    score = addPoints(score, actionPoints("crsOut", 0));
    expect(score).toBe(60);
  });

  test("never past the synced range", () => {
    expect(addPoints(SCORE_MAX, 60)).toBe(SCORE_MAX);
  });
});

describe("endBonus", () => {
  test("a lost round gives nothing, wherever you stand", () => {
    expect(endBonus(false, true)).toBe(0);
    expect(endBonus(false, false)).toBe(0);
  });

  test("a win pays everyone in the room, more for those in the Préfecture", () => {
    expect(endBonus(true, false)).toBe(WIN_BONUS);
    expect(endBonus(true, true)).toBe(WIN_BONUS + ARRIVED_BONUS);
  });
});

describe("device tokens", () => {
  test("a device token is 43 base64url characters, nothing else", () => {
    expect(isDeviceToken("a".repeat(43))).toBe(true);
    expect(isDeviceToken("Az09_-".repeat(7) + "x")).toBe(true);
    expect(isDeviceToken("a".repeat(42))).toBe(false);
    expect(isDeviceToken("a".repeat(44))).toBe(false);
    expect(isDeviceToken("a".repeat(42) + "=")).toBe(false);
    expect(isDeviceToken(42)).toBe(false);
    expect(isDeviceToken(undefined)).toBe(false);
    expect(isDeviceToken({ token: "a".repeat(43) })).toBe(false);
  });
});
