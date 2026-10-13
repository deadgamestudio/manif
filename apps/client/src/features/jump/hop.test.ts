import { describe, expect, test } from "bun:test";
import { JUMP_DURATION, JUMP_HEIGHT } from "@manif/shared";
import { HopArc } from "./hop.ts";

const FRAME = 1 / 60;

describe("hop arc (#45)", () => {
  test("rises to JUMP_HEIGHT halfway and comes back down by the end", () => {
    const hop = new HopArc();
    let peak = 0;
    for (let t = 0; t < JUMP_DURATION - 1e-9; t += FRAME) {
      hop.update(FRAME, true);
      peak = Math.max(peak, hop.lift);
    }
    expect(peak).toBeGreaterThan(JUMP_HEIGHT * 0.98);
    expect(peak).toBeLessThanOrEqual(JUMP_HEIGHT + 1e-9);
    hop.update(FRAME, true);
    expect(hop.lift).toBe(0);
  });

  test("on the ground: no lift; the first airborne frame takes off", () => {
    const hop = new HopArc();
    hop.update(FRAME, false);
    expect(hop.lift).toBe(0);
    expect(hop.tookOff).toBe(false);
    hop.update(FRAME, true);
    expect(hop.tookOff).toBe(true);
    hop.update(FRAME, true);
    expect(hop.tookOff).toBe(false);
  });

  test("cut short mid-air (a knock-down): settles down quickly, never snaps", () => {
    const hop = new HopArc();
    for (let i = 0; i < 15; i++) hop.update(FRAME, true);
    const high = hop.lift;
    expect(high).toBeGreaterThan(0.4);
    hop.update(FRAME, false);
    expect(hop.lift).toBeGreaterThan(high * 0.6);
    expect(hop.lift).toBeLessThan(high);
    expect(hop.squash).toBeGreaterThan(0.8);
    for (let i = 0; i < 30; i++) hop.update(FRAME, false);
    expect(hop.lift).toBe(0);
    expect(hop.squash).toBe(0);
  });

  test("bad frame times change nothing", () => {
    const hop = new HopArc();
    hop.update(Number.NaN, true);
    hop.update(-1, true);
    expect(hop.lift).toBe(0);
  });
});
