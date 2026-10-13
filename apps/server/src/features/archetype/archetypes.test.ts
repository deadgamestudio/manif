/**
 * Every server system that reads an archetype modifier (#14), fed from the
 * shared table: walking speed (and the dodge burst), max HP and respawn, the
 * heal aura, the dodge cooldown, the rescue time and the throw range. Grab
 * time, prop damage and target priority are pure functions (shared tests);
 * the room only multiplies them in.
 */
import { describe, expect, test } from "bun:test";
import { MapSchema } from "@colyseus/schema";
import {
  Archetype,
  DODGE_COOLDOWN,
  MAX_HP,
  PlayerStatus,
  RESCUE_TIME,
  THROWABLE_TYPES,
  TICK_DT,
  ThrowableKind,
  archetypeStats,
  type AuraSubject,
  type CollisionWorld,
  type RescueSubject,
} from "@manif/shared";
import { Bodies, type BodyView } from "../physics/index.js";
import { Healths, type HealthView } from "../health/index.js";
import { DodgeCooldowns } from "../dodge/index.js";
import { Rescues } from "../rescue/index.js";
import { Throwables, type GroundItem, type ProjectileView } from "../throwable/index.js";
import { HealAuras } from "./index.js";

const OPEN: CollisionWorld = { bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 }, boxes: [], circles: [] };
const view = (): BodyView & HealthView => ({ x: 0, z: 0, rotation: 0, down: false, dodging: false, airborne: false, hp: 0, status: 0, stateLeft: 0 });
const stats = (a: Archetype) => archetypeStats(a);

/** How far a body walks in one second at the archetype's speed (6 m/s base). */
function walked(a: Archetype, dodge = false): number {
  const bodies = new Bodies(OPEN, 0.4, 6);
  const v = view();
  bodies.place("p", v, 0, 0);
  if (dodge) bodies.dodge("p", v, 0, 1);
  const steps = dodge ? Math.round(0.3 / TICK_DT) : Math.round(1 / TICK_DT);
  for (let i = 0; i < steps; i++) bodies.step("p", v, { x: 0, z: 1 }, TICK_DT, OPEN, stats(a).speed);
  return v.z;
}

describe("speed (#14)", () => {
  test("the walk follows the archetype", () => {
    expect(walked(Archetype.Lambda)).toBeCloseTo(6, 1);
    expect(walked(Archetype.Retraite)).toBeCloseTo(6 * 0.75, 1);
    expect(walked(Archetype.Cite)).toBeCloseTo(6 * 1.12, 1);
    expect(walked(Archetype.GiletJaune)).toBeLessThan(walked(Archetype.Lambda));
  });

  test("so does the dodge burst", () => {
    expect(walked(Archetype.Cite, true)).toBeGreaterThan(walked(Archetype.Lambda, true));
    expect(walked(Archetype.Retraite, true)).toBeLessThan(walked(Archetype.Lambda, true));
  });
});

describe("max HP (#14)", () => {
  test("reset to the archetype's max, the default without one", () => {
    const h = new Healths();
    const v = view();
    h.reset("g", v, stats(Archetype.GiletJaune).maxHp);
    expect(v.hp).toBe(130);
    h.reset("e", v, stats(Archetype.Etudiant).maxHp);
    expect(v.hp).toBe(75);
    h.reset("l", v);
    expect(v.hp).toBe(MAX_HP);
  });

  test("a gilet jaune comes back from the van at 130", () => {
    const h = new Healths();
    const v = view();
    h.reset("g", v, 130);
    h.damage("g", v, 200, 0);
    for (let t = 0; t < 30; t += 0.5) h.tick("g", v, t);
    expect(v.status).toBe(PlayerStatus.Free);
    expect(v.hp).toBe(130);
  });
});

describe("heal aura (#14)", () => {
  const at = (id: string, x: number, a: Archetype): AuraSubject => ({ id, x, z: 0, stats: stats(a) });

  test("a hurt teammate near a CGT gets 2 HP a second, up to the max", () => {
    const h = new Healths();
    const v = view();
    h.reset("t", v);
    h.damage("t", v, 10, 0);
    const auras = new HealAuras();
    const cgt = [at("c", 2, Archetype.Cgt)];
    for (let i = 0; i < Math.round(1 / TICK_DT); i++) {
      for (const [id, hp] of auras.step([at("t", 0, Archetype.Lambda)], cgt, TICK_DT)) h.heal(id, v, hp, 0);
    }
    expect(v.hp).toBe(92);
    for (let i = 0; i < Math.round(10 / TICK_DT); i++) {
      for (const [id, hp] of auras.step([at("t", 0, Archetype.Lambda)], cgt, TICK_DT)) h.heal(id, v, hp, 0);
    }
    expect(v.hp).toBe(MAX_HP);
  });

  test("two CGT heal like one (no stacking)", () => {
    const one = new HealAuras();
    const two = new HealAuras();
    let a = 0;
    let b = 0;
    for (let i = 0; i < Math.round(2 / TICK_DT); i++) {
      for (const [, hp] of one.step([at("t", 0, Archetype.Lambda)], [at("c1", 1, Archetype.Cgt)], TICK_DT)) a += hp;
      for (const [, hp] of two.step([at("t", 0, Archetype.Lambda)], [at("c1", 1, Archetype.Cgt), at("c2", -1, Archetype.Cgt)], TICK_DT)) b += hp;
    }
    expect(a).toBe(4);
    expect(b).toBe(a);
  });
});

describe("dodge cooldown (#14)", () => {
  test("the bobo's comes back sooner", () => {
    const d = new DodgeCooldowns();
    d.start("p", 0);
    const bobo = DODGE_COOLDOWN * stats(Archetype.Bobo).dodgeCooldown;
    expect(d.ready("p", bobo - 0.05, bobo)).toBe(false);
    expect(d.ready("p", bobo, bobo)).toBe(true);
    expect(d.ready("p", bobo)).toBe(false);
  });
});

describe("rescue time (#14)", () => {
  function ticksToFree(a: Archetype): number {
    const people = new Map<string, RescueSubject>([
      ["r", { id: "r", x: 0, z: 0, status: PlayerStatus.Free }],
      ["t", { id: "t", x: 1, z: 0, status: PlayerStatus.Grabbed }],
    ]);
    const r = new Rescues();
    r.hold("r", true);
    for (let i = 1; i < 200; i++) {
      const done = r.step(
        TICK_DT,
        (id) => people.get(id),
        () => people.values(),
        () => true,
        () => true,
        () => RESCUE_TIME * stats(a).rescueTime,
      );
      if (done.length > 0) return i;
    }
    return Infinity;
  }

  test("the étudiant·e pulls a teammate free in 60% of the time", () => {
    const base = ticksToFree(Archetype.Lambda);
    expect(base).toBe(Math.round(RESCUE_TIME / TICK_DT));
    expect(ticksToFree(Archetype.Etudiant)).toBe(Math.round(base * 0.6));
  });
});

describe("throw range (#14)", () => {
  /** Where a pavé thrown along +z by archetype `a` lands. */
  function landsAt(a: Archetype): number {
    const items = new MapSchema<GroundItem>();
    const t = new Throwables(items, new MapSchema<ProjectileView>());
    t.launch("p", ThrowableKind.Pave, 0, 0, 0, 1, stats(a).throwRange);
    for (let i = 0; i < 200; i++) t.step(TICK_DT, OPEN, () => [], () => undefined);
    let z = Number.NaN;
    items.forEach((it) => {
      z = it.z;
    });
    return z;
  }

  test("the mec de cité throws further, the bobo shorter", () => {
    const range = THROWABLE_TYPES[ThrowableKind.Pave].range;
    expect(landsAt(Archetype.Lambda)).toBeCloseTo(range, 3);
    expect(landsAt(Archetype.Cite)).toBeCloseTo(range * 1.25, 3);
    expect(landsAt(Archetype.Bobo)).toBeCloseTo(range * 0.75, 3);
  });
});
