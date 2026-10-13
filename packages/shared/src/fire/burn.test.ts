import { describe, expect, test } from "bun:test";
import { DOWN_DURATION, createBody, isDown, knockDown, stepBody, type CollisionWorld } from "../physics/index.js";
import { PLAYER_RADIUS, PLAYER_SPEED } from "../player/index.js";
import { MAX_HP } from "../health/index.js";
import { propShape } from "../prop/index.js";
import { BURN_DAMAGE, BURN_DAMAGE_INTERVAL, CRS_BURN_DAMAGE, CRS_BURN_DAMAGE_INTERVAL, ON_FIRE_DURATION, ON_FIRE_SPEED } from "./constants.js";
import { burnSpeedFactor, createBurn, isOnFire, putOutBurn, stepBurn } from "./burn.js";
import { inFireZone } from "./fire.js";

const DT = 1 / 30;

/** Ticks a body for `seconds`, `inFire` deciding each tick; returns the total damage. */
function run(b: ReturnType<typeof createBurn>, from: number, seconds: number, inFire: (t: number) => boolean, canBurn = true) {
  let total = 0;
  let t = from;
  for (; t < from + seconds - 1e-9; t += DT) total += stepBurn(b, inFire(t), canBurn, t + DT);
  return total;
}

describe("on fire", () => {
  test("walking into a fire: on fire, faster, hurt every interval, out ON_FIRE_DURATION after leaving", () => {
    const b = createBurn();
    expect(stepBurn(b, true, true, 0)).toBe(0);
    expect(isOnFire(b, 0)).toBe(true);
    expect(burnSpeedFactor(b, 0)).toBe(ON_FIRE_SPEED);
    // Left the fire at once: it burns ON_FIRE_DURATION, one damage tick per interval.
    const total = run(b, 0, ON_FIRE_DURATION + 1, () => false);
    // One tick per interval (the one landing on the very end may or may not count, float sums of dt).
    const ticks = ON_FIRE_DURATION / BURN_DAMAGE_INTERVAL;
    expect(total).toBeGreaterThanOrEqual(BURN_DAMAGE * (ticks - 1));
    expect(total).toBeLessThanOrEqual(BURN_DAMAGE * ticks);
    expect(isOnFire(b, ON_FIRE_DURATION + 1)).toBe(false);
    expect(burnSpeedFactor(b, ON_FIRE_DURATION + 1)).toBe(1);
  });

  test("staying in the fire keeps it burning", () => {
    const b = createBurn();
    run(b, 0, 10, () => true);
    expect(isOnFire(b, 10)).toBe(true);
  });

  test("patted out (or hit by water): out at once, no more damage", () => {
    const b = createBurn();
    stepBurn(b, true, true, 0);
    putOutBurn(b);
    expect(isOnFire(b, 0.1)).toBe(false);
    expect(run(b, 0, 3, () => false)).toBe(0);
  });

  test("KO or arrested: put out, never hurt", () => {
    const b = createBurn();
    stepBurn(b, true, true, 0);
    expect(run(b, 0, 3, () => true, false)).toBe(0);
    expect(isOnFire(b, 3)).toBe(false);
  });

  test("CRS numbers: same rules, their own damage", () => {
    const b = createBurn();
    let total = 0;
    for (let t = 0; t < ON_FIRE_DURATION + 1; t += DT) total += stepBurn(b, t === 0, true, t, CRS_BURN_DAMAGE, CRS_BURN_DAMAGE_INTERVAL);
    expect(total).toBe(CRS_BURN_DAMAGE * Math.floor(ON_FIRE_DURATION / CRS_BURN_DAMAGE_INTERVAL));
  });
});

describe("trapped in fire", () => {
  test("knocked down beside a burning bin: gets up, walks out, and the damage is bounded", () => {
    const bin = propShape({ id: "bin", kind: "bin", x: 0, z: 0, rotation: 0 }, false)!;
    const world: CollisionWorld = {
      bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
      boxes: [],
      circles: [bin.type === "circle" ? bin : { x: 0, z: 0, r: 0.5 }],
    };
    const body = createBody(0, 0.5 + PLAYER_RADIUS);
    knockDown(body);
    const b = createBurn();
    let damage = 0;
    let t = 0;
    let leftAt = Infinity;
    for (; t < 15; t += DT) {
      // Holding "away from the fire": ignored while down, walked once up.
      stepBody(world, body, { x: 0, z: 1 }, PLAYER_SPEED * burnSpeedFactor(b, t), PLAYER_RADIUS, DT);
      const inside = inFireZone(bin, body.x, body.z, PLAYER_RADIUS);
      if (!inside && leftAt === Infinity) leftAt = t;
      damage += stepBurn(b, inside, true, t);
    }
    expect(isDown(body)).toBe(false);
    expect(leftAt).toBeLessThan(DOWN_DURATION + 0.5);
    expect(isOnFire(b, t)).toBe(false);
    expect(damage).toBeLessThan(MAX_HP / 2);
  });
});
