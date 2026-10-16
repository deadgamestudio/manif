import { describe, expect, test } from "bun:test";
import { MapSchema } from "@colyseus/schema";
import {
  CRS_STATS,
  CrsKind,
  DOUANE,
  DOUANE_ID,
  DOUANE_JET,
  DouanePhase,
  KNOCKDOWN_THRESHOLD,
  NavGrid,
  STREET_LEVEL as LEVEL,
  TICK_DT,
  levelWorld,
  type PropFire,
} from "@manif/shared";
import { DouaneEvent, type DouaneHost, type DouaneTick, type SoakBody } from "./douane.js";
import { DouaneView } from "./schema.js";

const WORLD = levelWorld(LEVEL);
const NAV = new NavGrid(WORLD, CRS_STATS[CrsKind.Crs].radius);

function at(t: number, side = 0) {
  const { from, to } = LEVEL.progress;
  return { x: from.x + (to.x - from.x) * t + side, z: from.z + (to.z - from.z) * t };
}

/** A host that records what the water did. */
function recorder(bodies: SoakBody[], fires: PropFire[] = []) {
  const pushes: { id: string; strength: number }[] = [];
  const putOut: string[] = [];
  const out: string[] = [];
  const host: DouaneHost = {
    bodies: () => bodies,
    fires: () => fires,
    push: (b, _x, _z, strength) => pushes.push({ id: b.id, strength }),
    extinguish: (id) => {
      out.push(id);
      return true;
    },
    putOutBody: (b) => putOut.push(b.id),
  };
  return { host, pushes, putOut, out };
}

function setup(random: () => number = () => 0) {
  const views = new MapSchema<DouaneView>();
  const event = new DouaneEvent(LEVEL, views, { boxes: [], circles: [] }, random);
  const tick = (now: number, front = 0.42): DouaneTick => ({ now, dt: TICK_DT, front, rear: at(0.3), nav: NAV, world: WORLD });
  return { views, event, tick };
}

const body = (id: string, p: { x: number; z: number }, extra: Partial<SoakBody> = {}): SoakBody => ({ id, x: p.x, z: p.z, r: 0.4, bot: false, onFire: false, target: true, ...extra });

describe("La Douane's visit (#120)", () => {
  test("no roll, no visit; a roll arrives when the front reaches its point", () => {
    const quiet = setup(() => 0.99);
    expect(quiet.event.startRound()).toBeNull();
    quiet.event.step(quiet.tick(1, 0.6), recorder([]).host);
    expect(quiet.views.size).toBe(0);

    const { views, event, tick } = setup(() => 0);
    expect(event.startRound()).toBe(DOUANE.earliest);
    event.step(tick(1, 0.1), recorder([]).host);
    expect(views.size).toBe(0);
    event.step(tick(2, 0.2), recorder([]).host);
    expect(views.get(DOUANE_ID)?.phase).toBe(DouanePhase.Soaking);
  });

  test("soaks for its duration, leaves, then is gone; once a round", () => {
    const { views, event, tick } = setup();
    const { host } = recorder([]);
    event.startRound();
    let now = 0;
    event.step(tick(now), host);
    while (now < DOUANE.duration + 0.1) event.step(tick((now += TICK_DT)), host);
    expect(views.get(DOUANE_ID)?.phase).toBe(DouanePhase.Leaving);
    expect(views.get(DOUANE_ID)?.spraying).toBe(false);
    while (now < DOUANE.duration + DOUANE.leaveTimeout + 1) event.step(tick((now += TICK_DT)), host);
    expect(views.size).toBe(0);
    event.step(tick((now += 1), 0.5), host);
    expect(views.size).toBe(0);
  });

  test("walks up to the closest body, CRS or protester, and fires in bursts with pauses", () => {
    const { views, event, tick } = setup();
    const here = at(0.4);
    const crs = body("crs-1", { x: here.x + 5, z: here.z }, { bot: true });
    const far = body("p1", { x: here.x - 12, z: here.z });
    const rec = recorder([crs, far]);
    event.force(tick(0), here, 30);
    let now = 0;
    let firstOn = -1;
    const states: boolean[] = [];
    while (now < 12) {
      event.step(tick((now += TICK_DT)), rec.host);
      const on = views.get(DOUANE_ID)?.spraying === true;
      if (on && firstOn < 0) firstOn = now;
      states.push(on);
    }
    expect(firstOn).toBeGreaterThan(0);
    // He went for the CRS, the closer one.
    expect(rec.pushes.length).toBeGreaterThan(0);
    expect(rec.pushes.every((p) => p.id === "crs-1")).toBe(true);
    // Never hard enough to floor, and at most once per push interval.
    expect(rec.pushes.every((p) => p.strength === DOUANE_JET.knockback && p.strength < KNOCKDOWN_THRESHOLD)).toBe(true);
    expect(rec.pushes.length).toBeLessThanOrEqual(Math.ceil(12 / DOUANE_JET.pushInterval));
    // Bursts and pauses: it turned off and on again.
    let switches = 0;
    for (let i = 1; i < states.length; i++) if (states[i] !== states[i - 1]) switches++;
    expect(switches).toBeGreaterThanOrEqual(3);
    const share = states.filter(Boolean).length / states.length;
    expect(share).toBeLessThan(0.5);
  });

  test("water puts out a burning body, and nobody out of sight gets wet", () => {
    const { event, tick } = setup();
    const here = at(0.4);
    const burning = body("p1", { x: here.x + 2, z: here.z }, { onFire: true });
    const rec = recorder([burning]);
    event.force(tick(0), here);
    for (let now = 0; now < 1; now += TICK_DT) event.step(tick(now), rec.host);
    expect(rec.putOut).toContain("p1");

    // A wall between them: he walks around, but the water never goes through it.
    const views = new MapSchema<DouaneView>();
    const wall = { boxes: [{ type: "box" as const, x: here.x + 1, z: here.z, halfX: 0.2, halfZ: 5 }], circles: [] };
    const blocked = new DouaneEvent(LEVEL, views, wall, () => 0);
    const rec2 = recorder([body("p2", { x: here.x + 2, z: here.z })]);
    blocked.force(tick(0), here);
    // He stands still (already within stand-off), so he stays behind the wall.
    for (let now = 0; now < 3; now += TICK_DT) blocked.step(tick(now), rec2.host);
    expect(rec2.pushes).toEqual([]);
    expect(views.get(DOUANE_ID)?.spraying).toBe(false);
  });

  test("ignores bodies that are down or grabbed", () => {
    const { views, event, tick } = setup();
    const here = at(0.4);
    const rec = recorder([body("p1", { x: here.x + 2, z: here.z }, { target: false })]);
    event.force(tick(0), here);
    for (let now = 0; now < 2; now += TICK_DT) event.step(tick(now), rec.host);
    expect(views.get(DOUANE_ID)?.spraying).toBe(false);
    expect(rec.pushes).toEqual([]);
  });

  test("a forced visit is ignored while he is already here", () => {
    const { event, tick } = setup();
    expect(event.force(tick(0), at(0.4))).toBe(true);
    expect(event.force(tick(1), at(0.5))).toBe(false);
    expect(event.here).toBe(true);
    event.clear();
    expect(event.here).toBe(false);
  });
});
