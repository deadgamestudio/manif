/**
 * The brigade's bookkeeping (#17) on the real street, the real squad and the
 * real fire rules: a truck comes after the delay, its pompiers put the fire
 * out, get back on, and it leaves; the cap; the reset.
 */
import { describe, expect, test } from "bun:test";
import { MapSchema } from "@colyseus/schema";
import {
  CRS_STATS,
  CrsKind,
  FireField,
  MAX_CRS,
  STREET_LEVEL,
  TICK_DT,
  levelWorld,
  propCollisionWorld,
  type BrigadeStats,
  type CrsHost,
} from "@manif/shared";
import { Crs, CrsSquad } from "../crs/index.js";
import { FireBrigade, type BrigadeHost, type HoseTarget } from "./brigade.js";
import { TruckView } from "./schema.js";

const LEVEL = STREET_LEVEL;
const BRIGADE = CRS_STATS[CrsKind.Pompier].brigade as BrigadeStats;
const slot = (id: string) => LEVEL.propSlots.find((s) => s.id === id)!;

function setup(water = true) {
  const world = propCollisionWorld(LEVEL, () => false);
  const squad = new CrsSquad(LEVEL, world, new MapSchema<Crs>());
  const trucks = new MapSchema<TruckView>();
  const field = new FireField(LEVEL.propSlots);
  const people: HoseTarget[] = [];
  const pushed: string[] = [];
  const out: string[] = [];
  // Never accidental: deterministic.
  const brigade = new FireBrigade(LEVEL, squad, world, levelWorld(LEVEL), trucks, () => 0.999999);
  const crsHost: CrsHost = {
    protesters: () => [],
    protester: () => undefined,
    canBeHurt: () => false,
    batonHit: () => {},
    grab: () => false,
    release: () => {},
    drag: () => {},
    shove: () => {},
  };
  const host: BrigadeHost = {
    fires: () => field.values(),
    protesters: () => people,
    pushProtester: (id) => pushed.push(id),
    pushBot: (id) => pushed.push(id),
    extinguish: (id) => {
      const ok = water && field.extinguish(id) !== null;
      if (ok) out.push(id);
      return ok;
    },
    putOutBody: () => false,
    log: () => {},
  };
  let now = 0;
  let size = 0;
  const step = (seconds: number, until?: () => boolean) => {
    for (let t = 0; t < seconds; t += TICK_DT) {
      now += TICK_DT;
      squad.step(now, TICK_DT, crsHost, () => []);
      brigade.step(now, TICK_DT, host);
      field.step(TICK_DT, () => 2);
      if (field.size !== size) {
        size = field.size;
        squad.setHazards(size > 0 ? field.hazards(LEVEL.bounds) : null);
      }
      if (until?.()) return true;
    }
    return false;
  };
  const pompiers = () => squad.all.filter((b) => b.kind === CrsKind.Pompier);
  return { squad, trucks, field, brigade, step, pompiers, out, pushed, people };
}

describe("fire brigade", () => {
  test("a truck after the delay; its pompiers put the fire out, get back on, and it leaves", () => {
    const s = setup();
    s.field.ignite("bin-6", 2);
    s.squad.setHazards(s.field.hazards(LEVEL.bounds));
    s.step(BRIGADE.arriveDelay - 0.5);
    expect(s.trucks.size).toBe(0);
    expect(s.step(1, () => s.trucks.size === 1)).toBe(true);
    // Drives in, parks; the crew get off inside the street.
    expect(s.step(5, () => s.pompiers().length === BRIGADE.crew)).toBe(true);
    for (const p of s.pompiers()) expect(p.body.x).toBeLessThan(LEVEL.bounds.maxX);
    expect([...s.trucks.values()][0]?.parked).toBe(true);
    // Out well before it would have burnt out on its own (and whatever it spread to).
    expect(s.step(25, () => s.field.size === 0)).toBe(true);
    expect(s.out).toContain("bin-6");
    // Back on board, then gone.
    expect(s.step(30, () => s.trucks.size === 0)).toBe(true);
    expect(s.pompiers().length).toBe(0);
    expect(s.brigade.pompierCount).toBe(0);
  });

  test("two fires, one pompier each, both out", () => {
    const s = setup();
    s.field.ignite("bin-6", 2);
    s.field.ignite("car-2", 6);
    s.squad.setHazards(s.field.hazards(LEVEL.bounds));
    expect(s.step(60, () => s.field.size === 0)).toBe(true);
    expect(s.out.sort()).toEqual(["bin-6", "car-2"]);
  });

  test("pompiers count towards the bot cap: only as many get off as there is room for", () => {
    const s = setup();
    for (let i = 0; i < MAX_CRS - 1; i++) s.squad.spawn(-5 + (i % 10), 60 + Math.floor(i / 10) * 2);
    s.field.ignite("bin-6", 2);
    s.squad.setHazards(s.field.hazards(LEVEL.bounds));
    s.step(BRIGADE.arriveDelay + 5);
    expect(s.pompiers().length).toBe(1);
    expect(s.squad.size).toBe(MAX_CRS);
  });

  test("never more trucks than the cap, however long the fires burn", () => {
    // Water that does nothing: the fires keep burning, one car after another (30 s each), for 80 s.
    const s = setup(false);
    let max = 0;
    for (const id of ["car-1", "car-2", "car-3"]) {
      s.field.ignite(id, 6);
      for (let i = 0; i < 25; i++) {
        s.step(1);
        max = Math.max(max, s.trucks.size);
        expect(s.trucks.size).toBeLessThanOrEqual(BRIGADE.maxTrucks);
      }
    }
    expect(max).toBe(BRIGADE.maxTrucks);
  });

  test("a reset leaves no truck and no pompier", () => {
    const s = setup();
    s.field.ignite("bin-6", 2);
    s.step(BRIGADE.arriveDelay + 4);
    expect(s.trucks.size).toBe(1);
    s.brigade.clear();
    s.step(TICK_DT * 2);
    expect(s.trucks.size).toBe(0);
    expect(s.pompiers().length).toBe(0);
  });

  test("a protester standing in the jet is pushed", () => {
    const s = setup();
    s.field.ignite("bin-6", 2);
    s.squad.setHazards(s.field.hazards(LEVEL.bounds));
    const bin = slot("bin-6");
    // Stands right in front of the burning bin, where the hose will aim.
    s.people.push({ id: "alice", x: bin.x - 1.5, z: bin.z + 1.2, onFire: false });
    s.step(40, () => s.pushed.includes("alice"));
    expect(s.pushed).toContain("alice");
  });
});
