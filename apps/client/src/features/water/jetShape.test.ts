import { describe, expect, test } from "bun:test";
import { jetModelFit } from "./jetShape.ts";
import { JET_LOOK, JET_MODEL } from "./waterVisuals.ts";

describe("jetModelFit", () => {
  test("the model ends where the jet's reach ends, sagging like the placeholder", () => {
    const { scale } = jetModelFit(5);
    expect(JET_MODEL.length * scale[2]).toBeCloseTo(5);
    expect(JET_MODEL.sag * scale[1]).toBeCloseTo(JET_LOOK.sag);
  });
  test("the water flies at the same speed on a short hose and a long cannon", () => {
    const speed = (range: number) => (range / JET_MODEL.loop) * jetModelFit(range).timeScale;
    expect(speed(5)).toBeCloseTo(JET_MODEL.speed);
    expect(speed(12)).toBeCloseTo(JET_MODEL.speed);
  });
});
