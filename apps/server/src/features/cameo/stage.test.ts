import { describe, expect, test } from "bun:test";
import { MapSchema } from "@colyseus/schema";
import {
  BENANAS_ID,
  CAMEO_VOICE_LINES,
  CRS_STATS,
  CrsKind,
  DOUANE_ID,
  MOLUCHAN_ID,
  NavGrid,
  PlayerStatus,
  ROUND_DURATION,
  STREET_LEVEL as LEVEL,
  TICK_DT,
  cameoBubbleSeconds,
  levelWorld,
} from "@manif/shared";
import { BenanasEvent, BenanasView, type BenanasHost } from "../benanas/index.js";
import { DouaneEvent, DouaneView, type DouaneHost, type SoakBody } from "../douane/index.js";
import { MoluchanEvent, MoluchanView } from "../moluchan/index.js";
import { CameoStage } from "./index.js";

const WORLD = levelWorld(LEVEL);
const NAV = new NavGrid(WORLD, CRS_STATS[CrsKind.Crs].radius);

function at(t: number, side = 0) {
  const { from, to } = LEVEL.progress;
  return { x: from.x + (to.x - from.x) * t + side, z: from.z + (to.z - from.z) * t };
}

/** A seeded generator (Park-Miller). */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

/** The three cameos of one room, sharing one stage, all forced onto the street at once. */
function room() {
  const random = seeded(5);
  const stage = new CameoStage(random);
  const views = { m: new MapSchema<MoluchanView>(), d: new MapSchema<DouaneView>(), b: new MapSchema<BenanasView>() };
  const moluchan = new MoluchanEvent(LEVEL, views.m, random, () => {}, stage);
  const douane = new DouaneEvent(LEVEL, views.d, { boxes: [], circles: [] }, random, () => {}, stage);
  const benanas = new BenanasEvent(LEVEL, views.b, random, () => {}, stage);
  // Somebody close to La Douane, so he fires (and wants to shout), and a group Bénanas won't pick on.
  const soaked: SoakBody = { id: "p1", ...at(0.4, 2), r: 0.4, bot: false, onFire: false, target: true };
  const douaneHost: DouaneHost = { bodies: () => [soaked], fires: () => [], push: () => {}, extinguish: () => false, putOutBody: () => {} };
  const benanasHost: BenanasHost = { people: () => [], punch: () => true, unmasked: () => {} };
  const crowd = [0, 1, -1].map((side) => ({ ...at(0.4, side), status: PlayerStatus.Free }));
  const tick = (now: number) => ({ now, dt: TICK_DT, elapsed: 60 + now, timeLeft: ROUND_DURATION - 60 - now, front: 0.42, protesters: crowd, rear: at(0.3), nav: NAV, world: WORLD });
  for (const e of [moluchan, douane, benanas]) e.startRound();
  moluchan.force(tick(0), at(0.4), 60);
  douane.force(tick(0), at(0.4, 4), 60);
  benanas.force(tick(0), at(0.45), 60);
  const step = (now: number) => {
    moluchan.step(tick(now));
    douane.step(tick(now), douaneHost);
    benanas.step(tick(now), benanasHost);
  };
  /** Who has a bubble up in the synced state. */
  const talking = () =>
    [
      [MOLUCHAN_ID, views.m.get(MOLUCHAN_ID)?.line ?? -1],
      [DOUANE_ID, views.d.get(DOUANE_ID)?.line ?? -1],
      [BENANAS_ID, views.b.get(BENANAS_ID)?.line ?? -1],
    ]
      .filter(([, line]) => (line as number) >= 0)
      .map(([id]) => id as string);
  return { moluchan, douane, benanas, step, talking, views };
}

/** The longest any bubble may stay up: the longest voice clip's (#137). */
const LONGEST_BUBBLE = Math.max(...Object.entries(CAMEO_VOICE_LINES).flatMap(([id, lines]) => lines.map((_, i) => cameoBubbleSeconds(id, i))));

describe("the cameos' speaking turn (#132)", () => {
  test("all three on the street at once: never two bubbles in the synced state, with silences between", () => {
    const r = room();
    // Each arrival is a key moment and cuts the one before: only the last is up.
    expect(r.talking()).toEqual([BENANAS_ID]);
    const upTicks: Record<string, number> = { [MOLUCHAN_ID]: 0, [DOUANE_ID]: 0, [BENANAS_ID]: 0 };
    let silent = 0;
    let longestBubble = 0;
    let run = 0;
    let last: string | null = null;
    const ticks = Math.round(40 / TICK_DT);
    for (let i = 1; i <= ticks; i++) {
      r.step(i * TICK_DT);
      const on = r.talking();
      expect(on.length).toBeLessThanOrEqual(1);
      const who = on[0] ?? null;
      if (who) upTicks[who] = (upTicks[who] ?? 0) + 1;
      else silent++;
      run = who !== null && who === last ? run + 1 : who ? 1 : 0;
      longestBubble = Math.max(longestBubble, run * TICK_DT);
      last = who;
    }
    // Short bursts: a bubble never stays up past its time (its voice clip's, #137).
    expect(longestBubble).toBeLessThanOrEqual(LONGEST_BUBBLE + TICK_DT);
    // Moluchan (rallying) and La Douane (firing) both got a word in, and nobody hogs the screen.
    expect(upTicks[MOLUCHAN_ID]).toBeGreaterThan(0);
    expect(upTicks[DOUANE_ID]).toBeGreaterThan(0);
    for (const id of [MOLUCHAN_ID, DOUANE_ID]) expect((upTicks[id] ?? 0) / ticks).toBeLessThan(0.35);
    expect(silent).toBeGreaterThan(0);
  });

  test("a bubble stays up as long as its voice clip, then comes down (#137)", () => {
    const r = room();
    const line = r.views.b.get(BENANAS_ID)?.line ?? -1;
    expect(line).toBeGreaterThanOrEqual(0);
    const hold = cameoBubbleSeconds(BENANAS_ID, line);
    let t = 0;
    for (; t < hold - TICK_DT; t += TICK_DT) {
      r.step(t);
      expect(r.talking()).toEqual([BENANAS_ID]);
    }
    r.step(hold + TICK_DT);
    expect(r.talking()).not.toContain(BENANAS_ID);
  });

  test("a key moment cuts whoever was talking in the same patch: Moluchan grabbed", () => {
    const r = room();
    expect(r.talking()).toEqual([BENANAS_ID]);
    r.moluchan.grab(0.5);
    expect(r.talking()).toEqual([MOLUCHAN_ID]);
  });

  test("Bénanas unmasked always speaks, even right after his arrival line", () => {
    const r = room();
    r.moluchan.grab(0.5);
    r.benanas.forceUnmask(0.6);
    expect(r.talking()).toEqual([BENANAS_ID]);
  });

  test("a cameo that leaves the street frees the turn", () => {
    const r = room();
    r.benanas.clear();
    expect(r.talking()).toEqual([]);
    expect(r.views.b.size).toBe(0);
  });
});
