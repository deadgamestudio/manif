import { describe, expect, test } from "bun:test";
import { LEZ_HEAD_SCALE, LEZ_POSE, LEZ_RING, LEZ_THIN } from "./look.ts";

describe("Le Z's look (#133)", () => {
  test("upright, chin up: never hunched (a hard rule agreed with the owner)", () => {
    // The spine only a touch forward, the head tipped back.
    expect(LEZ_POSE.spine).toBeGreaterThanOrEqual(0);
    expect(LEZ_POSE.spine).toBeLessThanOrEqual(0.2);
    expect(LEZ_POSE.head).toBeLessThanOrEqual(0);
  });

  test("the raised index points up, the mic hand up at the chest", () => {
    const aims = Object.fromEntries(LEZ_POSE.aims);
    expect(aims.forearm_L?.[1]).toBeGreaterThan(0.9);
    expect(aims.socket_hand_R?.[1]).toBeGreaterThan(0.9);
  });

  test("a small man with a big head; a blue ring, not Moluchan's red", () => {
    expect(LEZ_THIN).toBeLessThan(1);
    expect(LEZ_HEAD_SCALE).toBeGreaterThan(1);
    expect(LEZ_RING.color).not.toBe("#ff5a2a");
  });
});
