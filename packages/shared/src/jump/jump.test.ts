import { describe, expect, test } from "bun:test";
import {
  applyImpulse,
  createBody,
  isAirborne,
  isDown,
  knockDown,
  landBody,
  startDodge,
  startJump,
  stepBody,
  type Body,
} from "../physics/body.js";
import { circleOverlaps, MIN_OBSTACLE_HALF_THICKNESS, type CircleShape, type CollisionWorld } from "../physics/collision.js";
import { STREET_LEVEL } from "../level/index.js";
import { PROP_TYPES, propCollisionWorld, propShape } from "../prop/index.js";
import { JUMP_COOLDOWN, JUMP_DURATION } from "./constants.js";
import { jumpHeight, jumpReady } from "./jump.js";

const DT = 1 / 30;
const R = 0.4;
const SPEED = 6;
const STILL = { x: 0, z: 0 };
const EAST = { x: 1, z: 0 };
const BOUNDS = { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 };
const OPEN: CollisionWorld = { bounds: BOUNDS, boxes: [], circles: [] };
const JUMP_TICKS = Math.round(JUMP_DURATION / DT);
/** A bin (r 0.5) and a fallen CRS (r 0.45): what a hop clears. */
const BIN: CircleShape = { x: 0, z: 0, r: 0.5, hoppable: true };
const FALLEN_CRS: CircleShape = { x: 0, z: 0, r: 0.45, hoppable: true, soft: true };

function run(w: CollisionWorld, b: Body, ticks: number, input = STILL) {
  for (let t = 0; t < ticks; t++) stepBody(w, b, input, SPEED, R, DT);
}

/** Small deterministic RNG (mulberry32), so the random tests always run the same cases. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("cooldown", () => {
  test("first hop is always ready", () => {
    expect(jumpReady(undefined, 0)).toBe(true);
  });

  test("refused until JUMP_COOLDOWN after the last start, accepted exactly at it", () => {
    expect(jumpReady(10, 10)).toBe(false);
    expect(jumpReady(10, 10 + JUMP_DURATION)).toBe(false);
    expect(jumpReady(10, 10 + JUMP_COOLDOWN - DT)).toBe(false);
    let now = 10;
    for (let i = 0; i < Math.round(JUMP_COOLDOWN / DT); i++) now += DT;
    expect(jumpReady(10, now)).toBe(true);
  });

  test("the cooldown is longer than the hop: some time on the ground between two hops", () => {
    expect(JUMP_COOLDOWN).toBeGreaterThan(JUMP_DURATION);
  });

  test("spamming: with the cooldown, never airborne for more than one hop in a row", () => {
    const b = createBody(0, 0);
    let lastAt: number | undefined;
    let now = 0;
    let longest = 0;
    let streak = 0;
    for (let t = 0; t < 300; t++) {
      // A press every tick.
      if (jumpReady(lastAt, now) && startJump(b)) lastAt = now;
      now += DT;
      stepBody(OPEN, b, STILL, SPEED, R, DT);
      streak = isAirborne(b) ? streak + 1 : 0;
      longest = Math.max(longest, streak);
    }
    expect(longest).toBeLessThan(JUMP_TICKS);
  });
});

describe("airborne window", () => {
  test("airborne after steps 1 to JUMP_TICKS - 1, landed at the end of step JUMP_TICKS", () => {
    const b = createBody(0, 0);
    expect(startJump(b)).toBe(true);
    expect(isAirborne(b)).toBe(true);
    for (let t = 1; t < JUMP_TICKS; t++) {
      const res = stepBody(OPEN, b, STILL, SPEED, R, DT);
      expect(isAirborne(b)).toBe(true);
      expect(res.landed).toBe(false);
    }
    const res = stepBody(OPEN, b, STILL, SPEED, R, DT);
    expect(isAirborne(b)).toBe(false);
    expect(res.landed).toBe(true);
  });

  test("walking speed is unchanged in the air, and the held direction still steers", () => {
    const walker = createBody(0, 0);
    const hopper = createBody(0, 0);
    startJump(hopper);
    run(OPEN, walker, JUMP_TICKS, EAST);
    run(OPEN, hopper, JUMP_TICKS, EAST);
    expect(hopper.x).toBeCloseTo(walker.x, 9);
    const h2 = createBody(0, 0);
    startJump(h2);
    run(OPEN, h2, 5, EAST);
    run(OPEN, h2, 5, { x: 0, z: 1 });
    expect(h2.z).toBeCloseTo(SPEED * DT * 5, 9);
  });

  test("refused while down, dodging or already in the air; no dodge in the air", () => {
    const down = createBody(0, 0);
    knockDown(down);
    expect(startJump(down)).toBe(false);
    const dodging = createBody(0, 0);
    startDodge(dodging, 1, 0);
    expect(startJump(dodging)).toBe(false);
    const air = createBody(0, 0);
    expect(startJump(air)).toBe(true);
    expect(startJump(air)).toBe(false);
    expect(startDodge(air, 1, 0)).toBe(false);
  });

  test("the cosmetic arc: 0 at both ends, peak halfway", () => {
    expect(jumpHeight(0)).toBe(0);
    expect(jumpHeight(JUMP_DURATION)).toBe(0);
    expect(jumpHeight(-1)).toBe(0);
    expect(jumpHeight(Number.NaN)).toBe(0);
    expect(jumpHeight(JUMP_DURATION / 2)).toBeGreaterThan(jumpHeight(JUMP_DURATION / 4));
  });
});

describe("baton timing", () => {
  // The room resolves a baton swing in the CRS step, after the protesters'
  // step of the same tick: it misses when the protester is airborne then.
  // A press arrives between two ticks and starts the hop before the next one.
  function timeline(pressBeforeTick: number, ticks: number): boolean[] {
    const b = createBody(0, 0);
    const misses: boolean[] = [];
    for (let tick = 1; tick <= ticks; tick++) {
      if (tick === pressBeforeTick) startJump(b);
      stepBody(OPEN, b, STILL, SPEED, R, DT);
      misses.push(isAirborne(b));
    }
    return misses;
  }

  test("hop just before the swing's tick: it misses", () => {
    expect(timeline(5, 5)[4]).toBe(true);
  });

  test("hop just after the swing resolved (the next tick): it had landed", () => {
    expect(timeline(6, 5)[4]).toBe(false);
  });

  test("the swing misses on the hop's first JUMP_TICKS - 1 ticks and lands on its last", () => {
    const misses = timeline(1, JUMP_TICKS + 2);
    for (let t = 0; t < JUMP_TICKS - 1; t++) expect(misses[t]).toBe(true);
    expect(misses[JUMP_TICKS - 1]).toBe(false);
    expect(misses[JUMP_TICKS]).toBe(false);
  });
});

describe("hoppable filtering", () => {
  for (const [name, shape] of [
    ["an intact bin", BIN],
    ["a fallen CRS", FALLEN_CRS],
  ] as const) {
    test(`walking into ${name} stops; hopping passes over it and lands clear`, () => {
      const w: CollisionWorld = { bounds: BOUNDS, boxes: [], circles: [shape] };
      const walker = createBody(-1.2, 0);
      run(w, walker, 40, EAST);
      expect(walker.x).toBeLessThan(0);
      expect(circleOverlaps(w, walker.x, walker.z, R)).toBe(false);
      const hopper = createBody(-1.2, 0);
      startJump(hopper);
      run(w, hopper, JUMP_TICKS + 5, EAST);
      expect(hopper.x).toBeGreaterThan(shape.r + R);
      expect(circleOverlaps(w, hopper.x, hopper.z, R)).toBe(false);
    });
  }

  test("a car, a wall or a shield (not hoppable) still blocks a hop", () => {
    const car = propShape({ id: "car", kind: "car", x: 0, z: 0, rotation: 0 }, false);
    expect(car && PROP_TYPES.car.hoppable).toBe(false);
    const shield: CircleShape = { x: 0, z: 0, r: 0.6 };
    const wall = { x: 0, z: 0, halfX: MIN_OBSTACLE_HALF_THICKNESS, halfZ: 10 };
    for (const w of [
      { bounds: BOUNDS, boxes: car?.type === "box" ? [car] : [], circles: [] },
      { bounds: BOUNDS, boxes: [wall], circles: [] },
      { bounds: BOUNDS, boxes: [], circles: [shield] },
    ] satisfies CollisionWorld[]) {
      const b = createBody(-2, 0);
      startJump(b);
      run(w, b, JUMP_TICKS + 5, EAST);
      expect(b.x).toBeLessThan(0);
      expect(circleOverlaps(w, b.x, b.z, R)).toBe(false);
    }
  });

  test("only bins are hoppable props; their shape says so", () => {
    expect(PROP_TYPES.bin.hoppable).toBe(true);
    expect(PROP_TYPES.car.hoppable).toBe(false);
    expect(PROP_TYPES.bus_shelter.hoppable).toBe(false);
    expect(PROP_TYPES.banque.hoppable).toBe(false);
    const bin = STREET_LEVEL.propSlots.find((s) => s.kind === "bin");
    expect(bin && propShape(bin, false)?.hoppable).toBe(true);
  });

  test("walls and props of the real street block a ground body exactly as before", () => {
    const world = propCollisionWorld(STREET_LEVEL, () => false);
    const bin = STREET_LEVEL.propSlots.find((s) => s.id === "bin-1");
    if (!bin) throw new Error("bin-1 missing");
    // Hoppable shapes are only skipped when asked.
    expect(circleOverlaps(world, bin.x, bin.z, R)).toBe(true);
    expect(circleOverlaps(world, bin.x, bin.z, R, 1e-6, true)).toBe(false);
  });
});

describe("soft shapes (fallen CRS)", () => {
  test("block a walker like any shape", () => {
    const w: CollisionWorld = { bounds: BOUNDS, boxes: [], circles: [FALLEN_CRS] };
    const b = createBody(-2, 0);
    run(w, b, 40, EAST);
    expect(b.x).toBeCloseTo(-(FALLEN_CRS.r + R), 6);
  });

  test("squeezing a body against a wall: the wall wins, the fallen CRS gives way", () => {
    // Gap between the CRS and the wall: 0.3, narrower than a body (0.8).
    const wall = { x: 1, z: 0, halfX: MIN_OBSTACLE_HALF_THICKNESS, halfZ: 10 };
    const crs: CircleShape = { ...FALLEN_CRS, x: -0.25 };
    const w: CollisionWorld = { bounds: BOUNDS, boxes: [wall], circles: [crs] };
    const b = createBody(0.2, -3);
    run(w, b, 40, { x: 0, z: 1 });
    expect(circleOverlaps({ ...w, circles: [] }, b.x, b.z, R)).toBe(false);
  });

  test("squeezing a body against a bin: the bin wins", () => {
    const bin: CircleShape = { ...BIN, x: 0.8 };
    const crs: CircleShape = { ...FALLEN_CRS, x: -0.45 };
    const w: CollisionWorld = { bounds: BOUNDS, boxes: [], circles: [bin, crs] };
    const b = createBody(0.1, -3);
    run(w, b, 40, { x: 0, z: 1 });
    expect(circleOverlaps({ ...w, circles: [bin] }, b.x, b.z, R)).toBe(false);
  });
});

describe("landing", () => {
  test("hopping straight up on top of a bin: pushed out the shortest way", () => {
    const w: CollisionWorld = { bounds: BOUNDS, boxes: [], circles: [BIN] };
    const b = createBody(0.3, 0);
    // Got there in the air (a hop from the side), now standing still above it.
    startJump(b);
    run(w, b, JUMP_TICKS, STILL);
    expect(isAirborne(b)).toBe(false);
    expect(circleOverlaps(w, b.x, b.z, R)).toBe(false);
    expect(b.x).toBeCloseTo(BIN.r + R, 6);
    expect(b.z).toBeCloseTo(0, 6);
  });

  test("a bin in a pocket against a wall: lands on its own side of the wall, outside the bin", () => {
    // Gap between bin and wall smaller than a body: the push-out towards the wall has no room.
    const wall = { x: 0.9, z: 0, halfX: MIN_OBSTACLE_HALF_THICKNESS, halfZ: 10 };
    const w: CollisionWorld = { bounds: BOUNDS, boxes: [wall], circles: [BIN] };
    const b = createBody(-0.1, 0);
    b.x = 0.0;
    b.jumpTime = DT;
    stepBody(w, b, STILL, SPEED, R, DT);
    expect(circleOverlaps(w, b.x, b.z, R)).toBe(false);
    expect(b.x).toBeLessThan(wall.x - wall.halfX);
  });

  test("knocked down mid-hop over a bin: the hop ends and the body comes down clear of it", () => {
    const w: CollisionWorld = { bounds: BOUNDS, boxes: [], circles: [BIN] };
    const b = createBody(-1.2, 0);
    startJump(b);
    // Right above the bin.
    while (b.x < -0.1) stepBody(w, b, EAST, SPEED, R, DT);
    expect(circleOverlaps(w, b.x, b.z, R)).toBe(true);
    applyImpulse(b, 0, 1, 1e6, "always");
    expect(isDown(b)).toBe(true);
    expect(isAirborne(b)).toBe(false);
    const res = stepBody(w, b, STILL, SPEED, R, DT);
    expect(res.landed).toBe(true);
    expect(circleOverlaps(w, b.x, b.z, R)).toBe(false);
    run(w, b, 60);
    expect(circleOverlaps(w, b.x, b.z, R)).toBe(false);
  });

  test("landing clear of everything moves nothing", () => {
    const b = createBody(5, 5);
    expect(landBody(OPEN, b, R)).toBe(false);
    expect(b.x).toBe(5);
  });
});

describe("never ends inside anything", () => {
  test("random hops near every bin of the real street, with fallen CRS strewn about", () => {
    const props = propCollisionWorld(STREET_LEVEL, () => false);
    const rand = rng(45);
    let checked = 0;
    for (const slot of STREET_LEVEL.propSlots) {
      if (slot.kind !== "bin") continue;
      for (let n = 0; n < 200; n++) {
        // A couple of fallen CRS near the bin, sometimes right against a wall.
        const fallen: CircleShape[] = [];
        for (let k = 0; k < 2; k++) {
          const a = rand() * Math.PI * 2;
          const d = 0.8 + rand() * 2;
          fallen.push({ x: slot.x + Math.cos(a) * d, z: slot.z + Math.sin(a) * d, r: 0.45, hoppable: true, soft: true });
        }
        const world: CollisionWorld = { bounds: props.bounds, boxes: props.boxes, circles: [...fallen, ...props.circles] };
        const a = rand() * Math.PI * 2;
        const d = 0.9 + rand() * 2.5;
        const x = slot.x + Math.cos(a) * d;
        const z = slot.z + Math.sin(a) * d;
        if (circleOverlaps(world, x, z, R)) continue;
        const b = createBody(x, z);
        // Towards the bin, give or take, at a random moment in the walk.
        const aim = Math.atan2(slot.z - z, slot.x - x) + (rand() - 0.5) * 1.2;
        const input = { x: Math.cos(aim), z: Math.sin(aim) };
        const before = Math.floor(rand() * 8);
        for (let t = 0; t < before; t++) stepBody(world, b, input, SPEED, R, DT);
        startJump(b);
        // Sometimes a hit mid-hop, sometimes stop moving mid-air.
        const hitAt = rand() < 0.3 ? Math.floor(rand() * JUMP_TICKS) : -1;
        const stopAt = rand() < 0.3 ? Math.floor(rand() * JUMP_TICKS) : -1;
        for (let t = 0; t < JUMP_TICKS + 20; t++) {
          if (t === hitAt) applyImpulse(b, rand() - 0.5, rand() - 0.5, 4 + rand() * 12);
          const res = stepBody(world, b, t >= stopAt && stopAt >= 0 ? STILL : input, SPEED, R, DT);
          // Landing: clear of everything, fallen CRS included.
          if (res.landed) expect(circleOverlaps(world, b.x, b.z, R)).toBe(false);
          // On the ground: never in a wall or a prop. (A body squeezed into a gap between a
          // fallen CRS and a wall or a bin may overlap the CRS: it is soft and gives way.)
          if (!isAirborne(b)) expect(circleOverlaps(props, b.x, b.z, R)).toBe(false);
          // In the air it may be over a bin or a fallen CRS, never in a wall, a car or anything else.
          else expect(circleOverlaps(world, b.x, b.z, R, 1e-6, true)).toBe(false);
        }
        expect(isAirborne(b)).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  test("a grid of hops in 16 directions across the whole street", () => {
    const world = propCollisionWorld(STREET_LEVEL, () => false);
    const { minX, maxX, minZ, maxZ } = world.bounds;
    let checked = 0;
    for (let x = minX + 1; x < maxX; x += 1.7) {
      for (let z = minZ + 1; z < maxZ; z += 3.1) {
        if (circleOverlaps(world, x, z, R)) continue;
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const b = createBody(x, z);
          startJump(b);
          run(world, b, JUMP_TICKS + 10, { x: Math.cos(a), z: Math.sin(a) });
          expect(circleOverlaps(world, b.x, b.z, R)).toBe(false);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});
