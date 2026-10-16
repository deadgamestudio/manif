import { describe, expect, test } from "bun:test";
import { MapSchema } from "@colyseus/schema";
import {
  CAMEO,
  CRS_STATS,
  CrsKind,
  MOLUCHAN,
  MOLUCHAN_ID,
  MoluchanPhase,
  NavGrid,
  PlayerStatus,
  ROUND_DURATION,
  STREET_LEVEL as LEVEL,
  TICK_DT,
  levelWorld,
} from "@manif/shared";
import { MoluchanEvent, type MoluchanTick } from "./moluchan.js";
import { MoluchanView } from "./schema.js";

const WORLD = levelWorld(LEVEL);
const NAV = new NavGrid(WORLD, CRS_STATS[CrsKind.Crs].radius);

function at(t: number, side = 0) {
  const { from, to } = LEVEL.progress;
  return { x: from.x + (to.x - from.x) * t + side, z: from.z + (to.z - from.z) * t };
}

function setup(random: () => number = () => 0) {
  const views = new MapSchema<MoluchanView>();
  const event = new MoluchanEvent(LEVEL, views, random);
  const crowd = [0, 1, -1, 2].map((side) => ({ ...at(0.4, side), status: PlayerStatus.Free }));
  // The march clock starts at the first roll, so a lucky roll brings him at now = 0.
  const tick = (now: number, front = 0.42, elapsed = now + CAMEO.firstRoll): MoluchanTick => ({ now, dt: TICK_DT, elapsed, timeLeft: ROUND_DURATION - elapsed, front, protesters: crowd, rear: at(0.3), nav: NAV, world: WORLD });
  return { views, event, tick };
}

describe("Moluchan's visit (#85)", () => {
  test("a roll each minute of march (#132): unlucky rolls bring nobody, a lucky one brings him", () => {
    const quiet = setup(() => 0.99);
    quiet.event.startRound();
    for (let now = 0; now < 400; now += 0.5) quiet.event.step(quiet.tick(now));
    expect(quiet.views.size).toBe(0);

    const { views, event, tick } = setup(() => 0);
    event.startRound();
    event.step(tick(1, 0.42, CAMEO.firstRoll - 0.5));
    expect(views.size).toBe(0);
    event.step(tick(2, 0.42, CAMEO.firstRoll));
    expect(views.get(MOLUCHAN_ID)?.phase).toBe(MoluchanPhase.Rallying);
    expect(event.view()?.priority).toBe(MOLUCHAN.targetWeight);
  });

  test("no visit with too little of the march left for his 30 s", () => {
    const { views, event, tick } = setup(() => 0);
    event.startRound();
    event.step(tick(0, 0.42, ROUND_DURATION - MOLUCHAN.duration + 1));
    expect(views.size).toBe(0);
  });

  test("rallies 30 s, leaves by a side street, then is gone; once a round", () => {
    const { views, event, tick } = setup();
    event.startRound();
    let now = 0;
    event.step(tick(now));
    expect(event.aura).not.toBeNull();
    expect(MOLUCHAN.duration).toBe(30);
    while (now < MOLUCHAN.duration - 0.1) event.step(tick((now += TICK_DT)));
    expect(views.get(MOLUCHAN_ID)?.phase).toBe(MoluchanPhase.Rallying);
    while (now < MOLUCHAN.duration + 0.1) event.step(tick((now += TICK_DT)));
    expect(views.get(MOLUCHAN_ID)?.phase).toBe(MoluchanPhase.Leaving);
    // No ring while leaving, but still fair game for the CRS.
    expect(event.aura).toBeNull();
    expect(event.view()).toBeDefined();
    while (now < MOLUCHAN.duration + MOLUCHAN.leaveTimeout + 1) event.step(tick((now += TICK_DT)));
    expect(views.size).toBe(0);
    // The next minutes' rolls bring nobody: he came this round.
    while (now < 200) event.step(tick((now += 0.5)));
    expect(views.size).toBe(0);
  });

  test("a CRS grab ends it early: no ring, no longer a target, gone after a last line", () => {
    const { views, event, tick } = setup();
    event.force(tick(0));
    expect(event.grab(1)).toBe(true);
    expect(event.aura).toBeNull();
    expect(event.view()).toBeUndefined();
    expect(event.grab(1.1)).toBe(false);
    event.step(tick(1 + MOLUCHAN.grabbedLinger + 0.1));
    expect(views.size).toBe(0);
  });

  test("walks towards the crowd and stays behind the front", () => {
    const { event, tick } = setup();
    event.force(tick(0), at(0.3));
    for (let now = 0; now < 8; now += TICK_DT) event.step(tick(now));
    const v = event.view();
    expect(v).toBeDefined();
    const crowd = at(0.4);
    expect(Math.hypot((v?.x ?? 0) - crowd.x, (v?.z ?? 0) - crowd.z)).toBeLessThan(MOLUCHAN.auraRadius);
  });

  test("buffs inside the ring only, and the heal goes in whole HP", () => {
    const { event, tick } = setup();
    expect(event.speedAt(at(0.4))).toBe(1);
    event.force(tick(0), at(0.4));
    const inside = at(0.4, 2);
    const outside = at(0.4, MOLUCHAN.auraRadius + 3);
    expect(event.speedAt(inside)).toBeCloseTo(MOLUCHAN.speedFactor, 9);
    expect(event.speedAt(outside)).toBe(1);
    expect(event.struggleAt(inside)).toBe(MOLUCHAN.struggleFactor);
    expect(event.struggleAt(outside)).toBe(1);
    let healed = 0;
    for (let i = 0; i < Math.round(2 / TICK_DT); i++) {
      for (const [id, hp] of event.heals([{ id: "in", ...inside }, { id: "out", ...outside }], TICK_DT)) {
        expect(id).toBe("in");
        healed += hp;
      }
    }
    expect(healed).toBe(Math.round(2 * MOLUCHAN.healRate));
  });

  test("every synced field is a real number from the first sync (a missing rotation hid his body)", () => {
    const { views, event, tick } = setup();
    event.force(tick(0), at(0.4));
    const v = views.get(MOLUCHAN_ID);
    for (const k of ["x", "z", "rotation", "phase", "line", "left"] as const) expect(Number.isFinite(v?.[k])).toBe(true);
  });

  test("a forced visit while he is there does nothing; clear removes him", () => {
    const { views, event, tick } = setup();
    expect(event.force(tick(0))).toBe(true);
    expect(event.force(tick(1))).toBe(false);
    event.clear();
    expect(views.size).toBe(0);
    expect(event.view()).toBeUndefined();
  });
});
