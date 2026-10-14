/**
 * The CRS LBD (#73): whom it aims at (offenders only), the aim and what
 * foils it, the shot and its cooldown, the distance it keeps, and the ball
 * (first protester in line, stopped by walls and CRS, never tunnelling).
 */
import { describe, expect, test } from "bun:test";
import { DODGE_COOLDOWN } from "../dodge/index.js";
import { PlayerStatus } from "../health/index.js";
import { TICK_DT } from "../net/index.js";
import { createBody, type CollisionWorld, type Vec2 } from "../physics/index.js";
import { createCrsBot, hitCrs, stepCrs, type CrsBot, type CrsContext, type CrsHost } from "./brain.js";
import { CRS_STATS, CrsKind, CrsStatus, OFFENDER_MEMORY } from "./constants.js";
import { LBD_BEHAVIOUR, ballBlockers, clearShot, createBall, stepBall, type BallBody } from "./lbd.js";
import { NavGrid } from "./nav.js";
import { Offenders } from "./offenders.js";
import { isOffender, pickLbdTarget, type LbdTargetQuery, type ProtesterView } from "./targeting.js";
import { splatCrs } from "./status.js";

const LBD = CRS_STATS[CrsKind.Lbd].lbd!;
const bounds = { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };
const OPEN: CollisionWorld = { bounds, boxes: [], circles: [] };

const view = (id: string, x: number, z: number, patch: Partial<ProtesterView> = {}): ProtesterView => ({
  id,
  x,
  z,
  status: PlayerStatus.Free,
  down: false,
  ...patch,
});

const query = (patch: Partial<LbdTargetQuery> = {}): LbdTargetQuery => ({
  now: 10,
  range: LBD.range,
  memory: OFFENDER_MEMORY,
  currentId: null,
  switchMargin: 3,
  inLine: () => true,
  ...patch,
});

describe("offenders (#73, decision 1)", () => {
  test("only someone who broke, hit or threw something in the last OFFENDER_MEMORY seconds counts", () => {
    expect(isOffender({}, 10, OFFENDER_MEMORY)).toBe(false);
    expect(isOffender({ offendedAt: 9 }, 10, OFFENDER_MEMORY)).toBe(true);
    expect(isOffender({ offendedAt: 10 - OFFENDER_MEMORY }, 10, OFFENDER_MEMORY)).toBe(true);
    expect(isOffender({ offendedAt: 10 - OFFENDER_MEMORY - 0.1 }, 10, OFFENDER_MEMORY)).toBe(false);
  });

  test("the room's record: the latest offence wins, forgotten on leaving, cleared for a new round", () => {
    const o = new Offenders();
    expect(o.lastAt("a")).toBeUndefined();
    o.mark("a", 5);
    o.mark("a", 3);
    expect(o.lastAt("a")).toBe(5);
    o.mark("a", 7);
    o.mark("b", 1);
    expect(o.lastAt("a")).toBe(7);
    o.forget("a");
    expect(o.lastAt("a")).toBeUndefined();
    o.clear();
    expect(o.lastAt("b")).toBeUndefined();
  });
});

describe("pickLbdTarget (#73)", () => {
  test("an idle protester is never picked, however close; an offender is", () => {
    const idle = view("idle", 0, 3);
    const thrower = view("thrower", 0, 12, { offendedAt: 9 });
    expect(pickLbdTarget({ x: 0, z: 0 }, [idle], query())).toBeNull();
    expect(pickLbdTarget({ x: 0, z: 0 }, [idle, thrower], query())).toBe("thrower");
  });

  test("an offence too long ago, out of range, out of line, down or not free: not picked", () => {
    const from = { x: 0, z: 0 };
    expect(pickLbdTarget(from, [view("a", 0, 5, { offendedAt: 10 - OFFENDER_MEMORY - 1 })], query())).toBeNull();
    expect(pickLbdTarget(from, [view("a", 0, LBD.range + 1, { offendedAt: 9 })], query())).toBeNull();
    expect(pickLbdTarget(from, [view("a", 0, 5, { offendedAt: 9 })], query({ inLine: () => false }))).toBeNull();
    expect(pickLbdTarget(from, [view("a", 0, 5, { offendedAt: 9, down: true })], query())).toBeNull();
    expect(pickLbdTarget(from, [view("a", 0, 5, { offendedAt: 9, status: PlayerStatus.Grabbed })], query())).toBeNull();
  });

  test("the nearest offender by weighted distance, sticky on the current one", () => {
    const from = { x: 0, z: 0 };
    const near = view("near", 0, 6, { offendedAt: 9 });
    const far = view("far", 0, 8, { offendedAt: 9 });
    expect(pickLbdTarget(from, [far, near], query())).toBe("near");
    // A black bloc (#14) counts as nearer.
    expect(pickLbdTarget(from, [near, { ...far, priority: 1.5 }], query())).toBe("far");
    // Sticky: the current one is kept unless another is switchMargin closer.
    expect(pickLbdTarget(from, [far, near], query({ currentId: "far" }))).toBe("far");
    expect(pickLbdTarget(from, [view("far", 0, 15, { offendedAt: 9 }), near], query({ currentId: "far" }))).toBe("near");
  });
});

/** A host with plain protester views; records shots and baton hits. */
class FakeHost implements CrsHost {
  readonly people = new Map<string, ProtesterView>();
  readonly shots: { by: string; from: Vec2; dirX: number; dirZ: number }[] = [];
  readonly batonHits: string[] = [];
  grabs = 0;
  add(id: string, x: number, z: number, patch: Partial<ProtesterView> = {}) {
    const p = view(id, x, z, patch);
    this.people.set(id, p);
    return p;
  }
  protesters() {
    return this.people.values();
  }
  protester(id: string) {
    return this.people.get(id);
  }
  canBeHurt() {
    return true;
  }
  batonHit(_by: string, id: string) {
    this.batonHits.push(id);
  }
  grab() {
    this.grabs++;
    return true;
  }
  canGrab() {
    return true;
  }
  arrest() {}
  release() {}
  drag() {}
  shove() {}
  fireLbd(by: string, from: Vec2, dirX: number, dirZ: number) {
    this.shots.push({ by, from: { x: from.x, z: from.z }, dirX, dirZ });
  }
}

function setup(world: CollisionWorld = OPEN) {
  const host = new FakeHost();
  const bots: CrsBot[] = [];
  const ctx: CrsContext = { world, nav: new NavGrid(world, 0.45), vans: [], bots, now: 0, dt: TICK_DT, rng: () => 0.9 };
  // Its first shot is ready at once in these tests.
  const bot = createCrsBot("lbd", CrsKind.Lbd, 0, 0, 0, -LBD.firstShotDelay);
  bots.push(bot);
  const tick = (seconds = TICK_DT) => {
    for (let t = 0; t < seconds - 1e-9; t += TICK_DT) {
      ctx.now += TICK_DT;
      stepCrs(bot, ctx, host, LBD_BEHAVIOUR);
    }
  };
  return { host, ctx, bots, bot, tick };
}

describe("the LBD's aim and shot (#73)", () => {
  test("a fresh unit waits firstShotDelay before its first aim", () => {
    const host = new FakeHost();
    const bot = createCrsBot("lbd", CrsKind.Lbd, 0, 0, 0, 0);
    const ctx: CrsContext = { world: OPEN, nav: new NavGrid(OPEN, 0.45), vans: [], bots: [bot], now: 0, dt: TICK_DT };
    host.add("p", 0, 12, { offendedAt: 0 });
    for (let t = 0; t < LBD.firstShotDelay - 0.2; t += TICK_DT) {
      ctx.now += TICK_DT;
      stepCrs(bot, ctx, host, LBD_BEHAVIOUR);
      expect(bot.aimId).toBeNull();
    }
  });

  test("aims at the thrower, not at the idle protester standing nearer, then fires once along the line after aimTime", () => {
    const { host, ctx, bot, tick } = setup();
    host.add("idle", 3, 11);
    host.add("thrower", 0, 13, { offendedAt: 0 });
    tick();
    expect(bot.aimId).toBe("thrower");
    tick(LBD.aimTime - 2 * TICK_DT);
    expect(host.shots).toHaveLength(0);
    tick(3 * TICK_DT);
    expect(host.shots).toHaveLength(1);
    expect(bot.aimId).toBeNull();
    const shot = host.shots[0]!;
    expect(shot.dirX).toBeCloseTo(0, 5);
    expect(shot.dirZ).toBeCloseTo(1, 5);
    // The idle protester was never aimed at. Re-aims only after the cooldown.
    host.people.get("thrower")!.offendedAt = ctx.now;
    tick(LBD.cooldown - 0.2);
    expect(bot.aimId).toBeNull();
    expect(host.shots).toHaveLength(1);
    tick(0.3);
    expect(bot.aimId).toBe("thrower");
  });

  test("nobody broke, hit or threw anything: no aim, ever", () => {
    const { host, bot, tick } = setup();
    host.add("a", 0, 12);
    host.add("b", 2, 14);
    for (let i = 0; i < 300; i++) {
      tick();
      expect(bot.aimId).toBeNull();
    }
    expect(host.shots).toHaveLength(0);
  });

  test("a dodge during the aim foils it: no shot, and a pause of reaimDelay before the next aim", () => {
    const { host, ctx, bot, tick } = setup();
    const p = host.add("p", 0, 13, { offendedAt: 0 });
    tick();
    expect(bot.aimId).toBe("p");
    tick(0.3);
    p.dodging = true;
    tick();
    p.dodging = false;
    expect(bot.aimId).toBeNull();
    const foiledAt = ctx.now;
    tick(LBD.aimTime + 0.2);
    expect(host.shots).toHaveLength(0);
    expect(bot.shotReadyAt).toBeCloseTo(foiledAt + LBD.reaimDelay, 5);
    tick(LBD.reaimDelay - (LBD.aimTime + 0.2) + 0.1);
    expect(bot.aimId).toBe("p");
  });

  test("cover: a wall in the line means no aim, and stepping behind one mid-aim foils it", () => {
    const wall: CollisionWorld = { bounds, boxes: [{ x: 0, z: 6, halfX: 1.5, halfZ: 0.3 }], circles: [] };
    const { host, bot, tick } = setup(wall);
    const p = host.add("p", 0, 13, { offendedAt: 0 });
    tick(0.5);
    expect(bot.aimId).toBeNull();
    // Steps out into the open: aimed at.
    p.x = 8;
    tick(0.5);
    expect(bot.aimId).toBe("p");
    // Back behind the wall before the shot.
    p.x = 0;
    tick(LBD.aimTime);
    expect(bot.aimId).toBeNull();
    expect(host.shots).toHaveLength(0);
  });

  test("an offender behind cover: it walks round the cover until it has a shot", () => {
    const wall: CollisionWorld = { bounds, boxes: [{ x: 0, z: 6, halfX: 2, halfZ: 0.3 }], circles: [] };
    const { host, ctx, bot, tick } = setup(wall);
    host.add("p", 0, 13, { offendedAt: 0 });
    let aimedAt = -1;
    for (let i = 0; i < 200 && aimedAt < 0; i++) {
      host.people.get("p")!.offendedAt = ctx.now;
      tick();
      if (bot.aimId === "p") aimedAt = ctx.now;
    }
    expect(aimedAt).toBeGreaterThan(0);
    expect(Math.abs(bot.body.x)).toBeGreaterThan(0.5);
  });

  test("another CRS in the line blocks the aim (the ball would stop there)", () => {
    const { host, bots, bot, tick } = setup();
    bots.push(createCrsBot("crs-2", CrsKind.Crs, 0, 6));
    host.add("p", 0, 13, { offendedAt: 0 });
    tick(0.5);
    expect(bot.aimId).toBeNull();
  });

  test("a hit on the shooter mid-aim foils it", () => {
    const { host, ctx, bot, tick } = setup();
    host.add("p", 0, 13, { offendedAt: 0 });
    tick();
    expect(bot.aimId).toBe("p");
    hitCrs(bot, 0, -1, 1, ctx.now);
    tick(LBD.aimTime + 0.1);
    expect(host.shots).toHaveLength(0);
  });

  test("splatted (#15): it still fires, but off by splatMiss, so the ball goes wide", () => {
    const { host, ctx, bot, tick } = setup();
    host.add("p", 0, 13, { offendedAt: 0 });
    splatCrs(bot, ctx.now, 10);
    tick(LBD.aimTime + 0.2);
    expect(host.shots).toHaveLength(1);
    const shot = host.shots[0]!;
    const angle = Math.atan2(shot.dirX, shot.dirZ);
    expect(Math.abs(angle)).toBeCloseTo(LBD.splatMiss, 3);
  });

  test("it never grabs, even a weakened protester right against it; it swings its soft baton instead", () => {
    const { host, bot, tick } = setup();
    host.add("p", 0, 0.9, { hp: 10, down: false });
    tick(3);
    expect(host.grabs).toBe(0);
    expect(bot.status).not.toBe(CrsStatus.Grabbing);
    expect(host.batonHits.length).toBeGreaterThan(0);
    expect(host.batonHits.length).toBeLessThanOrEqual(2);
  });

  test("it keeps its distance: backs away from a protester closing in, walks up to a far one", () => {
    const close = setup();
    close.host.add("p", 0, 5);
    close.tick(1);
    expect(close.bot.body.z).toBeLessThan(-1);
    const far = setup();
    far.host.add("p", 0, 22);
    far.tick(1);
    expect(far.bot.body.z).toBeGreaterThan(1);
    const fine = setup();
    fine.host.add("p", 0, 13);
    fine.tick(1);
    expect(Math.hypot(fine.bot.body.x, fine.bot.body.z)).toBeLessThan(0.1);
  });
});

describe("the ball (#73)", () => {
  const people = (...bodies: [string, number, number][]): BallBody[] => bodies.map(([id, x, z]) => ({ id, x, z, r: 0.4 }));
  const fly = (world: CollisionWorld, blockers: BallBody[], targets: BallBody[], dt = TICK_DT) => {
    const ball = createBall("b", "lbd", { x: 0, z: 0 }, 0, 1, LBD);
    for (let i = 0; i < 1000; i++) {
      const res = stepBall(ball, dt, world, blockers, targets);
      if (res.type !== "flying") return res;
    }
    throw new Error("still flying");
  };

  test("hits the first protester in its line: a teammate in the way takes it", () => {
    const res = fly(OPEN, [], people(["behind", 0, 12], ["front", 0.2, 8]));
    expect(res).toMatchObject({ type: "hit", id: "front" });
  });

  test("stopped by a wall, a prop or a car (anything in the world) before the protester", () => {
    const wall: CollisionWorld = { bounds, boxes: [{ x: 0, z: 5, halfX: 1, halfZ: 0.2 }], circles: [] };
    const res = fly(wall, [], people(["p", 0, 10]));
    expect(res.type).toBe("blocked");
    if (res.type === "blocked") {
      expect(res.by).toBeNull();
      expect(res.z).toBeLessThan(5);
    }
  });

  test("stopped by another CRS (a shield line), never by its own shooter", () => {
    const res = fly(OPEN, [{ id: "lbd", x: 0, z: 0, r: 0.45 }, { id: "crs-2", x: 0, z: 6, r: 0.6 }], people(["p", 0, 10]));
    expect(res).toMatchObject({ type: "blocked", by: "crs-2" });
  });

  test("drops after ballRange with nobody in the way", () => {
    const res = fly(OPEN, [], []);
    expect(res.type).toBe("dropped");
    if (res.type === "dropped") expect(res.z).toBeCloseTo(LBD.ballRange, 5);
  });

  test("never tunnels: a whole second in one step still hits a thin body on the way", () => {
    const res = fly(OPEN, [], people(["p", 0, 15]), 1);
    expect(res).toMatchObject({ type: "hit", id: "p" });
  });

  test("ballBlockers: standing bots in uniform, not the shooter, not one out or down, not a BAC in disguise", () => {
    const shooter = createCrsBot("lbd", CrsKind.Lbd, 0, 0);
    const standing = createCrsBot("a", CrsKind.Crs, 0, 4);
    const out = createCrsBot("b", CrsKind.Crs, 0, 5);
    out.status = CrsStatus.Out;
    const down = createCrsBot("c", CrsKind.Crs, 0, 6);
    down.body.downTime = 1;
    const bac = createCrsBot("d", CrsKind.Bac, 0, 7);
    const ids = ballBlockers([shooter, standing, out, down, bac], "lbd").map((b) => b.id);
    expect(ids).toEqual(["a"]);
  });

  test("clearShot: blocked by the world or a blocker, never by a protester (who takes the hit)", () => {
    const from = { x: 0, z: 0 };
    const to = { x: 0, z: 12 };
    expect(clearShot(from, to, OPEN, [], LBD.ballRadius)).toBe(true);
    expect(clearShot(from, to, OPEN, [{ id: "c", x: 0.3, z: 6, r: 0.45 }], LBD.ballRadius)).toBe(false);
    expect(clearShot(from, to, OPEN, [{ id: "c", x: 3, z: 6, r: 0.45 }], LBD.ballRadius)).toBe(true);
    const car: CollisionWorld = { bounds, boxes: [], circles: [{ x: 0, z: 6, r: 1 }] };
    expect(clearShot(from, to, car, [], LBD.ballRadius)).toBe(false);
  });
});

describe("the LBD's numbers (#73)", () => {
  test("weak up close, never grabs, and its hit floors without lasting harm", () => {
    const s = CRS_STATS[CrsKind.Lbd];
    expect(s.maxHp).toBeLessThan(CRS_STATS[CrsKind.Crs].maxHp);
    expect(s.batonCooldown).toBeGreaterThan(CRS_STATS[CrsKind.Crs].batonCooldown);
    expect(s.grabReach).toBeLessThan(0);
    expect(LBD.cooldown).toBeGreaterThanOrEqual(6);
    expect(LBD.cooldown).toBeLessThanOrEqual(8);
    expect(LBD.standoffMin).toBeLessThan(LBD.standoffMax);
    expect(LBD.range).toBeGreaterThan(LBD.standoffMax);
    expect(LBD.damage).toBeLessThanOrEqual(10);
  });

  test("a dodge is back in time for the next aim: dodging can foil every shot, not only the first", () => {
    expect(LBD.reaimDelay + LBD.aimTime).toBeGreaterThanOrEqual(DODGE_COOLDOWN);
  });

  test("createCrsBot body is a plain CRS-sized body", () => {
    const bot: CrsBot = createCrsBot("x", CrsKind.Lbd, 1, 2);
    expect(bot.body).toMatchObject(createBody(1, 2));
    expect(bot.aimId).toBeNull();
  });
});
