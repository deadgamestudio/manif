import { describe, expect, test } from "bun:test";
import { MapSchema } from "@colyseus/schema";
import { BENANAS, BENANAS_ID, BenanasPhase, CRS_STATS, CrsKind, NavGrid, STREET_LEVEL as LEVEL, TICK_DT, levelWorld } from "@manif/shared";
import { BenanasEvent, type BenanasBody, type BenanasHost, type BenanasTick } from "./benanas.js";
import { BenanasView } from "./schema.js";

const WORLD = levelWorld(LEVEL);
const NAV = new NavGrid(WORLD, CRS_STATS[CrsKind.Crs].radius);

function at(t: number, side = 0) {
  const { from, to } = LEVEL.progress;
  return { x: from.x + (to.x - from.x) * t + side, z: from.z + (to.z - from.z) * t };
}

/** A host that records his punches and the unmasking. */
function recorder(people: BenanasBody[]) {
  const punches: string[] = [];
  const credited: string[][] = [];
  const host: BenanasHost = {
    people: () => people,
    punch: (id) => {
      punches.push(id);
      return true;
    },
    unmasked: (ids) => credited.push([...ids]),
  };
  return { host, punches, credited };
}

function setup(random: () => number = () => 0) {
  const views = new MapSchema<BenanasView>();
  const event = new BenanasEvent(LEVEL, views, random);
  const tick = (now: number, front = 0.42): BenanasTick => ({ now, dt: TICK_DT, front, rear: at(0.3), nav: NAV, world: WORLD });
  return { views, event, tick };
}

const person = (id: string, p: { x: number; z: number }, target = true): BenanasBody => ({ id, x: p.x, z: p.z, r: 0.4, target });

/** Steps the event from `from` for `seconds`, returns the time reached. */
function run(s: ReturnType<typeof setup>, host: BenanasHost, from: number, seconds: number): number {
  let now = from;
  const end = from + seconds;
  while (now < end) {
    now += TICK_DT;
    s.event.step(s.tick(now), host);
  }
  return now;
}

describe("Bénanas's visit (#123)", () => {
  test("no roll, no visit; a roll arrives when the front reaches its point", () => {
    const quiet = setup(() => 0.99);
    expect(quiet.event.startRound()).toBeNull();
    quiet.event.step(quiet.tick(1, 0.7), recorder([]).host);
    expect(quiet.views.size).toBe(0);

    const s = setup(() => 0);
    expect(s.event.startRound()).toBeCloseTo(BENANAS.earliest, 5);
    s.event.step(s.tick(1, BENANAS.earliest - 0.01), recorder([]).host);
    expect(s.views.size).toBe(0);
    s.event.step(s.tick(2, BENANAS.earliest + 0.01), recorder([]).host);
    expect(s.views.get(BENANAS_ID)?.phase).toBe(BenanasPhase.Prowling);
    expect(s.views.get(BENANAS_ID)?.line).toBeGreaterThanOrEqual(0);
  });

  test("walks up to a lone protester and floors them, then leaves them alone and goes for the next", () => {
    const s = setup();
    const me = at(0.5);
    s.event.force({ now: 0, front: 0.5, rear: at(0.3) }, { x: me.x + 4, z: me.z });
    const lone = person("lone", me);
    const other = person("other", at(0.45));
    const r = recorder([lone, other]);
    let now = run(s, r.host, 0, 3);
    expect(r.punches).toEqual(["lone"]);
    expect(s.views.get(BENANAS_ID)?.swings).toBe(1);
    // A cooldown and a switch: the next punch is for the other one, never "lone" again in a row.
    now = run(s, r.host, now, 8);
    expect(r.punches.length).toBeGreaterThanOrEqual(2);
    expect(r.punches[1]).toBe("other");
    for (let i = 1; i < r.punches.length; i++) expect(r.punches[i]).not.toBe(r.punches[i - 1]);
  });

  test("leaves a group alone", () => {
    const s = setup();
    const p = at(0.5);
    s.event.force({ now: 0, front: 0.5, rear: at(0.3) }, { x: p.x + 8, z: p.z });
    const group = [person("a", p), person("b", { x: p.x + 1, z: p.z }), person("c", { x: p.x, z: p.z + 1 })];
    const r = recorder(group);
    run(s, r.host, 0, 6);
    expect(r.punches).toEqual([]);
  });

  test("three protesters close in: he backs off, away from them, and punches nobody", () => {
    const s = setup();
    const p = at(0.5);
    s.event.force({ now: 0, front: 0.5, rear: at(0.3) }, p);
    // Three on his left, within crowdRadius: he goes the other way.
    const crowd = [person("a", { x: p.x - 1.5, z: p.z }), person("b", { x: p.x - 1.2, z: p.z + 1 }), person("c", { x: p.x - 1.2, z: p.z - 1 })];
    const r = recorder(crowd);
    run(s, r.host, 0, 1.5);
    const v = s.views.get(BENANAS_ID);
    expect(r.punches).toEqual([]);
    expect(v && v.x).toBeGreaterThan(p.x + 1);
  });

  test("4 hits take his helmet off: every hitter credited once, he runs off, and is gone for good", () => {
    const s = setup();
    const p = at(0.5);
    s.event.force({ now: 0, front: 0.5, rear: at(0.3) }, p);
    const r = recorder([]);
    expect(s.event.hurt("a", p.x - 1, p.z, 0.1, r.host)).toBe(true);
    expect(s.event.hurt("b", p.x - 1, p.z, 0.2, r.host)).toBe(true);
    expect(s.event.hurt("a", p.x - 1, p.z, 0.3, r.host)).toBe(true);
    expect(s.views.get(BENANAS_ID)?.phase).toBe(BenanasPhase.Prowling);
    expect(s.event.hurt("c", p.x - 1, p.z, 0.4, r.host)).toBe(true);
    expect(s.views.get(BENANAS_ID)?.phase).toBe(BenanasPhase.Unmasked);
    expect(s.views.get(BENANAS_ID)?.hurts).toBe(4);
    expect(r.credited.map((c) => c.sort())).toEqual([["a", "b", "c"]]);
    // Off already: no more hits, no target for swings and throws.
    expect(s.event.hurt("d", p.x, p.z, 0.5, r.host)).toBe(false);
    expect(s.event.target()).toBeNull();
    // He runs, faster than walking, hits nobody, and is gone within the linger and the leave timeout.
    const lone = person("lone", { x: p.x + 1, z: p.z });
    const r2 = recorder([lone]);
    run(s, r2.host, 0.4, BENANAS.unmaskedLinger + BENANAS.leaveTimeout + 1);
    expect(r2.punches).toEqual([]);
    expect(s.views.size).toBe(0);
    expect(s.event.here).toBe(false);
  });

  test("time's up: walks off with his helmet on, punches nobody, gone", () => {
    const s = setup();
    const p = at(0.5);
    s.event.force({ now: 0, front: 0.5, rear: at(0.3) }, p, 2);
    const r = recorder([]);
    run(s, r.host, 0, 2.1);
    expect(s.views.get(BENANAS_ID)?.phase).toBe(BenanasPhase.Leaving);
    expect(s.event.target()).not.toBeNull();
    run(s, r.host, 2.1, BENANAS.leaveTimeout + 1);
    expect(s.event.here).toBe(false);
  });

  test("debug unmask credits nobody; a new round clears him", () => {
    const s = setup();
    s.event.force({ now: 0, front: 0.5, rear: at(0.3) });
    expect(s.event.forceUnmask(0)).toBe(true);
    expect(s.event.forceUnmask(0)).toBe(false);
    expect(s.views.get(BENANAS_ID)?.phase).toBe(BenanasPhase.Unmasked);
    s.event.startRound();
    expect(s.views.size).toBe(0);
  });
});
