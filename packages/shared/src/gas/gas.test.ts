import { describe, expect, test } from "bun:test";
import { PlayerStatus } from "../health/index.js";
import { TICK_DT } from "../net/index.js";
import type { CollisionWorld } from "../physics/index.js";
import {
  CANISTER_FLIGHT_TIME,
  GAS_DAMAGE,
  GAS_DAMAGE_INTERVAL,
  GAS_DURATION,
  GAS_LINGER,
  GAS_MAX_RANGE,
  GAS_RADIUS,
  GAS_SLOW,
  GAS_SQUAD_INTERVAL,
  MAX_GAS_CLOUDS,
} from "./constants.js";
import {
  GasField,
  cloudReaches,
  createCanister,
  createExposure,
  gasSpeedFactor,
  inAnyCloud,
  inGasCloud,
  isGassed,
  pickGasAim,
  scatterAim,
  stepCanister,
  stepExposure,
  type GasCloud,
  type GasFieldHooks,
} from "./gas.js";

const OPEN: CollisionWorld = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, boxes: [], circles: [] };
const NO_OBSTACLES = { boxes: [], circles: [] };
/** A wall along x = 5, from z = -10 to 10, one unit thick. */
const WALL = { x: 5, z: 0, halfX: 0.5, halfZ: 10 };
const WALLED: CollisionWorld = { ...OPEN, boxes: [WALL] };

const cloud = (x: number, z: number, endsAt = 100, radius = GAS_RADIUS): GasCloud => ({ x, z, radius, endsAt });

/** Run `seconds` of ticks; `inside(t)` says if the protester is in a cloud at time t. Returns the HP lost. */
function expose(seconds: number, inside: (t: number) => boolean, status: number = PlayerStatus.Free, start = 0) {
  const e = createExposure();
  let lost = 0;
  let t = start;
  const ticks = Math.round(seconds / TICK_DT);
  for (let i = 0; i < ticks; i++) {
    t += TICK_DT;
    lost += stepExposure(e, inside(t), status, t);
  }
  return { e, lost, t };
}

describe("point in cloud", () => {
  test("inside, on the edge, and just past it", () => {
    const c = cloud(0, 0);
    expect(inGasCloud({ x: 1, z: 1 }, c)).toBe(true);
    expect(inGasCloud({ x: GAS_RADIUS, z: 0 }, c)).toBe(true);
    expect(inGasCloud({ x: 0, z: -GAS_RADIUS }, c)).toBe(true);
    expect(inGasCloud({ x: GAS_RADIUS + 0.01, z: 0 }, c)).toBe(false);
  });

  test("a wall between the centre and the protester blocks the gas", () => {
    // Cloud just left of the wall, protester just right of it: in the circle, behind the wall.
    const c = cloud(4.2, 0);
    const behind = { x: 6, z: 0 };
    expect(inGasCloud(behind, c)).toBe(true);
    expect(cloudReaches(c, behind, { boxes: [WALL], circles: [] })).toBe(false);
    expect(cloudReaches(c, { x: 3, z: 0 }, { boxes: [WALL], circles: [] })).toBe(true);
  });

  test("an ended cloud reaches nobody", () => {
    const clouds = [cloud(0, 0, 5)];
    expect(inAnyCloud({ x: 0, z: 0 }, clouds, NO_OBSTACLES, 4.9)).toBe(true);
    expect(inAnyCloud({ x: 0, z: 0 }, clouds, NO_OBSTACLES, 5)).toBe(false);
  });
});

describe("exposure", () => {
  test("damage every interval while inside, starting one interval after entering", () => {
    const { lost } = expose(2, () => true);
    // Entered on the first tick: hits at +0.5, +1 and +1.5 s; the next one is due just after 2 s.
    expect(lost).toBe(GAS_DAMAGE * Math.floor((2 - TICK_DT) / GAS_DAMAGE_INTERVAL));
    const first = expose(GAS_DAMAGE_INTERVAL - TICK_DT, () => true);
    expect(first.lost).toBe(0);
  });

  test("two overlapping clouds do not double the damage", () => {
    const p = { x: 0, z: 0 };
    const one = [cloud(0, 0)];
    const two = [cloud(0, 0), cloud(1, 0)];
    const a = expose(3, () => inAnyCloud(p, one, NO_OBSTACLES, 0));
    const b = expose(3, () => inAnyCloud(p, two, NO_OBSTACLES, 0));
    expect(b.lost).toBe(a.lost);
    expect(a.lost).toBeGreaterThan(0);
  });

  test("slowed while gassed, and both stop GAS_LINGER after leaving", () => {
    const leaveAt = 1;
    const e = createExposure();
    let t = 0;
    let lostAfterStop = 0;
    for (let i = 0; i < Math.round(3 / TICK_DT); i++) {
      t += TICK_DT;
      const dmg = stepExposure(e, t <= leaveAt, PlayerStatus.Free, t);
      if (t <= leaveAt + 1e-9) expect(gasSpeedFactor(e, t)).toBe(GAS_SLOW);
      if (t >= leaveAt + GAS_LINGER + TICK_DT) {
        expect(isGassed(e, t)).toBe(false);
        expect(gasSpeedFactor(e, t)).toBe(1);
        lostAfterStop += dmg;
      }
    }
    expect(lostAfterStop).toBe(0);
  });

  test("never gassed: full speed, no damage", () => {
    const { e, lost, t } = expose(2, () => false);
    expect(lost).toBe(0);
    expect(gasSpeedFactor(e, t)).toBe(1);
  });

  test("no damage to KO or arrested protesters, and their exposure is cleared", () => {
    expect(expose(3, () => true, PlayerStatus.Ko).lost).toBe(0);
    expect(expose(3, () => true, PlayerStatus.Arrested).lost).toBe(0);
    const e = createExposure();
    stepExposure(e, true, PlayerStatus.Free, 1);
    expect(isGassed(e, 1)).toBe(true);
    expect(stepExposure(e, true, PlayerStatus.Ko, 2)).toBe(0);
    expect(isGassed(e, 2)).toBe(false);
  });

  test("grabbed protesters still cough (the health machine decides what damage does)", () => {
    expect(expose(2, () => true, PlayerStatus.Grabbed).lost).toBeGreaterThan(0);
  });
});

describe("aim", () => {
  const free = (x: number, z: number) => ({ x, z, status: PlayerStatus.Free });

  test("the biggest bunch in range, at its middle", () => {
    const aim = pickGasAim({ x: 0, z: 0 }, [free(0, 8), free(1, 8), free(0, 9), free(-6, 6)]);
    expect(aim).not.toBeNull();
    expect(aim!.x).toBeCloseTo(1 / 3);
    expect(aim!.z).toBeCloseTo(25 / 3);
  });

  test("nobody alone is worth a canister, nor anyone out of range", () => {
    expect(pickGasAim({ x: 0, z: 0 }, [free(0, 8)])).toBeNull();
    expect(pickGasAim({ x: 0, z: 0 }, [free(0, 2), free(0.5, 2)])).toBeNull();
    expect(pickGasAim({ x: 0, z: 0 }, [free(0, 30), free(0.5, 30)])).toBeNull();
  });

  test("grabbed, KO and arrested protesters do not count", () => {
    const others = [PlayerStatus.Grabbed, PlayerStatus.Ko, PlayerStatus.Arrested].map((status) => ({ x: 0.5, z: 8, status }));
    expect(pickGasAim({ x: 0, z: 0 }, [free(0, 8), ...others])).toBeNull();
  });

  test("scatter stays within its amount and never past max range", () => {
    let seed = 1;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 50; i++) {
      const s = scatterAim({ x: 0, z: 0 }, { x: 0, z: 8 }, 1, GAS_MAX_RANGE, rng);
      expect(Math.hypot(s.x, s.z - 8)).toBeLessThanOrEqual(1 + 1e-9);
    }
    const far = scatterAim({ x: 0, z: 0 }, { x: 0, z: GAS_MAX_RANGE }, 1, GAS_MAX_RANGE, () => 0.0);
    expect(Math.hypot(far.x, far.z)).toBeLessThanOrEqual(GAS_MAX_RANGE + 1e-9);
  });
});

describe("canister flight", () => {
  test("lands on its target after the flight time", () => {
    const c = createCanister("c", "crs-1", { x: 0, z: 0 }, { x: 0, z: 10 });
    let res = stepCanister(c, TICK_DT, OPEN);
    let ticks = 1;
    while (res.type === "flying") {
      res = stepCanister(c, TICK_DT, OPEN);
      ticks++;
    }
    expect(ticks).toBe(Math.round(CANISTER_FLIGHT_TIME / TICK_DT));
    expect(res).toMatchObject({ type: "landed", blocked: false });
    expect(c.z).toBeCloseTo(10);
  });

  test("stopped by a wall: lands on the near side", () => {
    const c = createCanister("c", "crs-1", { x: 0, z: 0 }, { x: 10, z: 0 });
    let res = stepCanister(c, TICK_DT, WALLED);
    while (res.type === "flying") res = stepCanister(c, TICK_DT, WALLED);
    expect(res).toMatchObject({ type: "landed", blocked: true });
    expect(c.x).toBeLessThan(WALL.x - WALL.halfX);
    expect(c.x).toBeGreaterThan(3.5);
  });
});

describe("gas field", () => {
  function recorder() {
    const log: string[] = [];
    const hooks: GasFieldHooks = {
      canisterAdded: (c) => log.push(`+can ${c.id}`),
      canisterRemoved: (id) => log.push(`-can ${id}`),
      cloudAdded: (id) => log.push(`+cloud ${id}`),
      cloudRemoved: (id) => log.push(`-cloud ${id}`),
    };
    return { log, hooks };
  }

  /** Step the field from `from` to `to` with a fake clock. */
  function run(field: GasField, from: number, to: number) {
    let t = from;
    while (t < to - 1e-9) {
      t += TICK_DT;
      field.step(TICK_DT, t, OPEN);
    }
    return t;
  }

  test("a canister becomes a cloud, which expires after GAS_DURATION and leaves the map", () => {
    const { log, hooks } = recorder();
    const field = new GasField(hooks);
    expect(field.launch("crs-1", { x: 0, z: 0 }, { x: 0, z: 8 }, 0)).not.toBeNull();
    let t = run(field, 0, CANISTER_FLIGHT_TIME);
    expect(field.cloudCount).toBe(1);
    expect(log).toEqual(["+can gas-1", "-can gas-1", "+cloud gas-1"]);
    const landedAt = t;
    t = run(field, t, landedAt + GAS_DURATION - 0.1);
    expect(field.cloudCount).toBe(1);
    run(field, t, landedAt + GAS_DURATION + TICK_DT);
    expect(field.cloudCount).toBe(0);
    expect(log.at(-1)).toBe("-cloud gas-1");
  });

  test("one throw per squad interval", () => {
    const field = new GasField();
    expect(field.launch("a", { x: 0, z: 0 }, { x: 0, z: 8 }, 0)).not.toBeNull();
    expect(field.launch("b", { x: 0, z: 0 }, { x: 0, z: 8 }, GAS_SQUAD_INTERVAL - 0.1)).toBeNull();
    expect(field.launch("b", { x: 0, z: 0 }, { x: 0, z: 8 }, GAS_SQUAD_INTERVAL)).not.toBeNull();
  });

  test("never more live clouds (canisters included) than the cap", () => {
    const field = new GasField(undefined, MAX_GAS_CLOUDS, 0);
    let t = 0;
    let max = 0;
    for (let i = 0; i < 400; i++) {
      t += TICK_DT;
      field.launch("crs", { x: 0, z: 0 }, { x: (i % 7) - 3, z: 8 }, t);
      field.step(TICK_DT, t, OPEN);
      max = Math.max(max, field.liveCount);
    }
    expect(max).toBe(MAX_GAS_CLOUDS);
    expect(field.cloudCount).toBeLessThanOrEqual(MAX_GAS_CLOUDS);
  });

  test("clear removes everything", () => {
    const { log, hooks } = recorder();
    const field = new GasField(hooks);
    field.launch("a", { x: 0, z: 0 }, { x: 0, z: 8 }, 0);
    run(field, 0, 2);
    field.launch("a", { x: 0, z: 0 }, { x: 0, z: 8 }, 5);
    field.clear();
    expect(field.liveCount).toBe(0);
    expect(log.slice(-2).sort()).toEqual(["-can gas-2", "-cloud gas-1"]);
  });
});
