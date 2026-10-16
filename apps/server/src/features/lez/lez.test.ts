import { describe, expect, test } from "bun:test";
import { MapSchema } from "@colyseus/schema";
import {
  CAMEO,
  CRS_STATS,
  CrsKind,
  LEZ,
  LEZ_ID,
  LEZ_LINES,
  LeZPhase,
  MOLUCHAN_ID,
  NavGrid,
  PlayerStatus,
  ROUND_DURATION,
  STREET_LEVEL as LEVEL,
  TICK_DT,
  leZLineText,
  levelWorld,
  progressAt,
} from "@manif/shared";
import { CameoStage } from "../cameo/index.js";
import { MoluchanEvent, MoluchanView } from "../moluchan/index.js";
import { LeZEvent, type LeZHost, type LeZTick } from "./lez.js";
import { LeZView } from "./schema.js";

const WORLD = levelWorld(LEVEL);
const NAV = new NavGrid(WORLD, CRS_STATS[CrsKind.Crs].radius);

function at(t: number, side = 0) {
  const { from, to } = LEVEL.progress;
  return { x: from.x + (to.x - from.x) * t + side, z: from.z + (to.z - from.z) * t };
}

function recorder() {
  const credited: string[][] = [];
  const host: LeZHost = { chasedOff: (ids) => credited.push([...ids]) };
  return { host, credited };
}

/** A CRS line a little ahead of the front. */
const LINE = [at(0.53, -2), at(0.53, 0), at(0.53, 2)];

function setup(random: () => number = () => 0, stage?: CameoStage) {
  const views = new MapSchema<LeZView>();
  const event = new LeZEvent(LEVEL, views, random, () => {}, stage ?? new CameoStage(random));
  // The march clock starts at the first roll, so a lucky roll brings him at now = 0.
  const tick = (now: number, front = 0.5, elapsed = now + CAMEO.firstRoll): LeZTick => ({
    now,
    dt: TICK_DT,
    elapsed,
    timeLeft: ROUND_DURATION - elapsed,
    front,
    rear: at(0.3),
    nav: NAV,
    world: WORLD,
    crs: LINE,
  });
  return { views, event, tick };
}

function run(s: ReturnType<typeof setup>, from: number, seconds: number): number {
  let now = from;
  const end = from + seconds;
  while (now < end) {
    now += TICK_DT;
    s.event.step(s.tick(now));
  }
  return now;
}

describe("Le Z's visit (#133)", () => {
  test("through the shared cameo roll (#132): unlucky rolls bring nobody, a lucky one brings him, once a round", () => {
    const quiet = setup(() => 0.99);
    quiet.event.startRound();
    for (let now = 0; now < 400; now += 0.5) quiet.event.step(quiet.tick(now, 0.5, now));
    expect(quiet.views.size).toBe(0);

    const s = setup(() => 0);
    s.event.startRound();
    s.event.step(s.tick(1, 0.5, CAMEO.firstRoll - 0.5));
    expect(s.views.size).toBe(0);
    s.event.step(s.tick(2, 0.5, CAMEO.firstRoll));
    const v = s.views.get(LEZ_ID);
    expect(v?.phase).toBe(LeZPhase.Holding);
    // His arrival line, a key moment.
    expect(leZLineText(v?.line ?? -1)).toBe("Je suis historien, moi !");
    // Comes in from a side street ahead of the front (behind the CRS from the cortège's side).
    expect(progressAt(LEVEL, v?.x ?? 0, v?.z ?? 0)).toBeGreaterThan(0.5);
  });

  test("stays LEZ.duration (30 s), walks off, is gone; no second visit that round", () => {
    const s = setup(() => 0);
    s.event.startRound();
    s.event.step(s.tick(0));
    expect(s.event.here).toBe(true);
    let now = run(s, 0, LEZ.duration - 0.2);
    expect(s.event.phase).toBe(LeZPhase.Holding);
    now = run(s, now, 0.4);
    expect(s.event.phase).toBe(LeZPhase.Leaving);
    expect(leZLineText(s.views.get(LEZ_ID)?.line ?? -1)).toBe("Bon, j'ai une émission.");
    now = run(s, now, LEZ.leaveTimeout + 1);
    expect(s.event.here).toBe(false);
    run(s, now, 200);
    expect(s.event.here).toBe(false);
  });

  test("stands behind the CRS line, down the street from the cortège", () => {
    const s = setup();
    s.event.force({ now: 0, front: 0.5, rear: at(0.3) });
    run(s, 0, 12);
    const p = s.event.position;
    expect(p).not.toBeNull();
    expect(progressAt(LEVEL, p?.x ?? 0, p?.z ?? 0)).toBeGreaterThan(0.53);
    expect(progressAt(LEVEL, p?.x ?? 0, p?.z ?? 0)).toBeLessThan(0.6);
  });

  test("walking up to him doesn't push him off; he moves when the action really moves", () => {
    const s = setup();
    s.event.force({ now: 0, front: 0.5, rear: at(0.3) });
    let now = run(s, 0, 10);
    const settled = { ...(s.event.position ?? { x: 0, z: 0 }) };
    // A protester comes a few metres closer (the front creeps up): he stays put.
    let t = now;
    while (t < now + 5) {
      t += TICK_DT;
      s.event.step({ ...s.tick(t, 0.52), crs: [] });
    }
    now = t;
    const p1 = s.event.position ?? { x: 0, z: 0 };
    expect(Math.hypot(p1.x - settled.x, p1.z - settled.z)).toBeLessThan(1.5);
    // The cortège surges ahead: he walks to a new spot.
    while (t < now + 8) {
      t += TICK_DT;
      s.event.step({ ...s.tick(t, 0.65), crs: [] });
    }
    const p2 = s.event.position ?? { x: 0, z: 0 };
    expect(progressAt(LEVEL, p2.x, p2.z)).toBeGreaterThan(0.65);
  });

  test("his ring for the CRS while he holds forth, none once he leaves; profiling until chased", () => {
    const s = setup();
    expect(s.event.rally).toBeNull();
    expect(s.event.profiling).toBe(false);
    s.event.force({ now: 0, front: 0.5, rear: at(0.3) }, at(0.56), 2);
    const ring = s.event.rally;
    expect(ring).toMatchObject({ radius: LEZ.auraRadius, speedFactor: 1.15, grabFactor: 1.5 });
    expect(ring?.x).toBeCloseTo(at(0.56).x, 5);
    expect(s.event.profiling).toBe(true);
    run(s, 0, 2.1);
    expect(s.event.phase).toBe(LeZPhase.Leaving);
    expect(s.event.rally).toBeNull();
    expect(s.event.profiling).toBe(true);
    s.event.forceChase(2.2);
    expect(s.event.profiling).toBe(false);
  });

  test("4 hits chase him off: a line, every hitter credited once, no more hits, gone", () => {
    const s = setup();
    const p = at(0.56);
    s.event.force({ now: 0, front: 0.5, rear: at(0.3) }, p);
    const r = recorder();
    expect(s.event.hurt("a", p.x - 1, p.z, 0.1, r.host, true)).toBe(true);
    expect(s.event.hurt("b", p.x - 1, p.z, 0.2, r.host)).toBe(true);
    expect(s.event.hurt("a", p.x - 1, p.z, 0.3, r.host)).toBe(true);
    expect(s.views.get(LEZ_ID)?.phase).toBe(LeZPhase.Holding);
    expect(r.credited).toEqual([]);
    expect(s.event.hurt("c", p.x - 1, p.z, 0.4, r.host)).toBe(true);
    const v = s.views.get(LEZ_ID);
    expect(v?.phase).toBe(LeZPhase.Chased);
    expect(v?.hurts).toBe(4);
    expect(leZLineText(v?.line ?? -1)).toBe("Je retourne sur mon plateau.");
    expect(r.credited.map((c) => c.sort())).toEqual([["a", "b", "c"]]);
    expect(s.event.hurt("d", p.x, p.z, 0.5, r.host)).toBe(false);
    expect(s.event.target()).toBeNull();
    expect(s.event.rally).toBeNull();
    run(s, 0.4, LEZ.chasedLinger + LEZ.leaveTimeout + 1);
    expect(s.event.here).toBe(false);
    expect(s.views.size).toBe(0);
    expect(r.credited.length).toBe(1);
  });

  test("a tomato has its own line, any other hit the book one (ordinary lines, when the turn allows)", () => {
    const s = setup();
    const p = at(0.56);
    s.event.force({ now: 0, front: 0.5, rear: at(0.3) }, p);
    const r = recorder();
    // Past his arrival bubble and his silence, before he holds forth again (LEZ.talkEvery): the turn is free.
    const t = CAMEO.bubble + CAMEO.silenceMax + 0.1;
    expect(t).toBeLessThan(LEZ.talkEvery);
    run(s, 0, t);
    s.event.hurt("a", p.x - 1, p.z, t, r.host, true);
    expect(leZLineText(s.views.get(LEZ_ID)?.line ?? -1)).toBe("Ma chemise de plateau !");
    // A hit inside that silence says nothing new.
    s.event.hurt("a", p.x - 1, p.z, t + 3, r.host);
    expect(s.views.get(LEZ_ID)?.line ?? -1).toBe(-1);
    const later = t + CAMEO.bubble + CAMEO.silenceMax + 0.1;
    run(s, t, later - t);
    s.event.hurt("b", p.x - 1, p.z, later, r.host);
    expect(leZLineText(s.views.get(LEZ_ID)?.line ?? -1)).toBe("Vous n'avez pas lu mon livre !");
  });

  test("debug chase credits nobody; a new round clears him", () => {
    const s = setup();
    s.event.force({ now: 0, front: 0.5, rear: at(0.3) });
    expect(s.event.forceChase(0)).toBe(true);
    expect(s.event.forceChase(0)).toBe(false);
    s.event.startRound();
    expect(s.views.size).toBe(0);
    expect(s.event.here).toBe(false);
  });
});

describe("Le Z and the other cameos share the bubble (#132)", () => {
  test("never two bubbles up with Moluchan; Le Z holds forth in short bursts with silences", () => {
    const stage = new CameoStage(() => 0.5);
    const m = new MoluchanEvent(LEVEL, new MapSchema<MoluchanView>(), () => 0.5, () => {}, stage);
    const z = setup(() => 0.5, stage);
    const crowd = [0, 1, -1].map((side) => ({ ...at(0.45, side), status: PlayerStatus.Free }));
    const mt = (now: number) => ({ now, dt: TICK_DT, elapsed: 60 + now, timeLeft: 300, front: 0.5, protesters: crowd, rear: at(0.3), nav: NAV, world: WORLD });
    m.startRound();
    z.event.startRound();
    m.force(mt(0), at(0.45), 60);
    z.event.force({ now: 0, front: 0.5, rear: at(0.3) }, undefined, 60);
    const mViews = (m as unknown as { views: MapSchema<MoluchanView> }).views;
    let zUp = 0;
    let mUp = 0;
    const ticks = Math.round(40 / TICK_DT);
    for (let i = 1; i <= ticks; i++) {
      const now = i * TICK_DT;
      m.step(mt(now));
      z.event.step(z.tick(now, 0.5, 60 + now));
      const zl = z.views.get(LEZ_ID)?.line ?? -1;
      const ml = mViews.get(MOLUCHAN_ID)?.line ?? -1;
      expect(zl >= 0 && ml >= 0).toBe(false);
      if (zl >= 0) {
        zUp++;
        expect(LEZ_LINES[zl]?.kind).toBe(now < CAMEO.bubble ? "arrive" : "talk");
      }
      if (ml >= 0) mUp++;
    }
    expect(zUp).toBeGreaterThan(0);
    expect(mUp).toBeGreaterThan(0);
    expect(zUp / ticks).toBeLessThan(0.35);
  });
});
