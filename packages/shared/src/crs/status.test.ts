import { describe, expect, test } from "bun:test";
import { PlayerStatus } from "../health/index.js";
import { TICK_DT } from "../net/index.js";
import type { CollisionWorld } from "../physics/index.js";
import { THROWABLE_TYPES, ThrowableKind } from "../throwable/index.js";
import { createCrsBot, stepCrs, steerTo, type CrsBot, type CrsContext, type CrsHost } from "./brain.js";
import { CRS_STATS, CrsKind, CrsStatus } from "./constants.js";
import { NavGrid } from "./nav.js";
import {
  CRS_EFFECTS,
  STINK_BACKOFF,
  STINK_KEEP_AWAY,
  isBackingOff,
  isSplatted,
  isStinky,
  splatCrs,
  stinkCrs,
} from "./status.js";
import type { ProtesterView } from "./targeting.js";

const STATS = CRS_STATS[CrsKind.Crs];
const OPEN: CollisionWorld = { bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, boxes: [], circles: [] };
const TOMATE = THROWABLE_TYPES[ThrowableKind.Tomate];
const CROTTE = THROWABLE_TYPES[ThrowableKind.Crotte];

/** A host with protesters standing still; records baton hits, misses and grabs. */
class Host implements CrsHost {
  readonly people = new Map<string, ProtesterView>();
  readonly hits: string[] = [];
  readonly misses: string[] = [];
  readonly grabs: string[] = [];
  add(id: string, x: number, z: number) {
    this.people.set(id, { id, x, z, status: PlayerStatus.Free, down: false });
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
  batonHit(by: string) {
    this.hits.push(by);
  }
  batonMiss(by: string) {
    this.misses.push(by);
  }
  grab(id: string) {
    this.grabs.push(id);
    return false;
  }
  release() {}
  arrest() {}
  drag() {}
  shove() {}
}

function setup() {
  const host = new Host();
  const bots: CrsBot[] = [];
  const ctx: CrsContext = { world: OPEN, nav: new NavGrid(OPEN, STATS.radius), vans: [{ x: 0, z: -15 }], bots, now: 0, dt: TICK_DT };
  const tick = () => {
    ctx.now += TICK_DT;
    for (const b of bots) stepCrs(b, ctx, host);
  };
  const run = (seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += TICK_DT) tick();
  };
  const bot = (id: string, x: number, z: number) => {
    const b = createCrsBot(id, CrsKind.Crs, x, z);
    b.gasReadyAt = Infinity;
    bots.push(b);
    return b;
  };
  return { host, ctx, bots, run, bot };
}

describe("status timers (#15)", () => {
  test("the table names a status for the tomato (splat) and the poo (stink), none for the others", () => {
    expect(TOMATE.effect).toBe("splat");
    expect(CROTTE.effect).toBe("stink");
    expect(THROWABLE_TYPES[ThrowableKind.Pave].effect).toBeNull();
    expect(THROWABLE_TYPES[ThrowableKind.Trottinette].effect).toBeNull();
    expect(CRS_EFFECTS.splat).toBe(splatCrs);
    expect(CRS_EFFECTS.stink).toBe(stinkCrs);
  });

  test("a splat lasts its time, then wears off", () => {
    const b = createCrsBot("c", CrsKind.Crs, 0, 0);
    expect(isSplatted(b, 0)).toBe(false);
    expect(splatCrs(b, 10, TOMATE.effectTime)).toBe(true);
    expect(isSplatted(b, 10)).toBe(true);
    expect(isSplatted(b, 10 + TOMATE.effectTime - 0.01)).toBe(true);
    expect(isSplatted(b, 10 + TOMATE.effectTime)).toBe(false);
  });

  test("a second tomato refreshes the timer, it doesn't stack", () => {
    const b = createCrsBot("c", CrsKind.Crs, 0, 0);
    splatCrs(b, 10, 3);
    splatCrs(b, 10, 3);
    expect(b.splatUntil).toBe(13);
    splatCrs(b, 12, 3);
    expect(b.splatUntil).toBe(15);
    // An earlier, shorter one never shortens it.
    splatCrs(b, 11, 1);
    expect(b.splatUntil).toBe(15);
  });

  test("a second poo refreshes the stink and the back-off, no stacking", () => {
    const b = createCrsBot("c", CrsKind.Crs, 0, 0);
    stinkCrs(b, 10, 5);
    stinkCrs(b, 10, 5);
    expect(b.stinkUntil).toBe(15);
    expect(b.backOffUntil).toBe(10 + STINK_BACKOFF);
    stinkCrs(b, 11, 5);
    expect(b.stinkUntil).toBe(16);
    expect(b.backOffUntil).toBe(11 + STINK_BACKOFF);
  });

  test("splatted and stinky at the same time is allowed", () => {
    const b = createCrsBot("c", CrsKind.Crs, 0, 0);
    splatCrs(b, 0, 3);
    stinkCrs(b, 0, 5);
    expect(isSplatted(b, 1)).toBe(true);
    expect(isStinky(b, 1)).toBe(true);
  });

  test("a bot that is out takes no status, and shows none", () => {
    const b = createCrsBot("c", CrsKind.Crs, 0, 0);
    splatCrs(b, 0, 3);
    b.status = CrsStatus.Out;
    expect(isSplatted(b, 1)).toBe(false);
    expect(splatCrs(b, 1, 3)).toBe(false);
    expect(stinkCrs(b, 1, 3)).toBe(false);
    expect(isStinky(b, 1)).toBe(false);
  });
});

describe("a splatted CRS (#15)", () => {
  test("swings and misses, and never grabs, while splatted; hits again once it wears off", () => {
    const { host, ctx, run, bot } = setup();
    host.add("p", 0, 0);
    const b = bot("c", 0, STATS.radius + 0.4 + 0.1);
    splatCrs(b, ctx.now, 3);
    run(2.9);
    expect(host.misses.length).toBeGreaterThan(0);
    expect(host.hits).toEqual([]);
    expect(host.grabs).toEqual([]);
    run(STATS.batonCooldown + 0.3);
    expect(host.hits.length).toBeGreaterThan(0);
  });

  test("stumbles: covers less ground towards its target than a clean one", () => {
    const clean = setup();
    clean.host.add("p", 0, -15);
    const a = clean.bot("c", 0, 10);
    clean.run(2);
    const splat = setup();
    splat.host.add("p", 0, -15);
    const b = splat.bot("c", 0, 10);
    splatCrs(b, 0, 5);
    splat.run(2);
    const cleanGone = 10 - a.body.z;
    const splatGone = 10 - b.body.z;
    expect(cleanGone).toBeGreaterThan(STATS.speed * 2 * 0.9);
    expect(splatGone).toBeLessThan(cleanGone * 0.7);
    expect(splatGone).toBeGreaterThan(0);
  });
});

describe("a stinky CRS (#15)", () => {
  test("backs off from its protester for a moment, then comes back for them", () => {
    const { host, ctx, run, bot } = setup();
    host.add("p", 0, 0);
    const b = bot("c", 0, 3);
    run(0.2);
    const before = b.body.z;
    stinkCrs(b, ctx.now, 5);
    expect(isBackingOff(b, ctx.now)).toBe(true);
    run(STINK_BACKOFF - 0.1);
    expect(b.body.z).toBeGreaterThan(before + 1.5);
    const farthest = b.body.z;
    run(1.5);
    expect(b.body.z).toBeLessThan(farthest);
  });

  test("other CRS steer away from it instead of brushing past", () => {
    const { ctx, bot } = setup();
    const stinky = bot("s", 0, 0);
    // A bot walking past, aiming for a point beyond the stinky one along a line that would brush it.
    const other = bot("o", -1.2, 0);
    steerTo(other, -1.2, -10, ctx);
    const clean = { x: other.input.x, z: other.input.z };
    stinkCrs(stinky, ctx.now, 5);
    steerTo(other, -1.2, -10, ctx);
    // Pushed sideways, away from the stinky bot (to -x), much harder than the plain separation.
    expect(other.input.x).toBeLessThan(clean.x - 0.3);
  });

  test("bots keep their distance from a stinky one while chasing the same protester", () => {
    const { host, ctx, run, bot } = setup();
    host.add("p", 0, -12);
    const stinky = bot("s", 0, 0);
    const other = bot("o", 0.3, 4);
    stinkCrs(stinky, ctx.now, 5);
    stinky.backOffUntil = 0;
    let closest = Infinity;
    for (let t = 0; t < 2.5; t += TICK_DT) {
      run(TICK_DT);
      closest = Math.min(closest, Math.hypot(stinky.body.x - other.body.x, stinky.body.z - other.body.z));
    }
    expect(closest).toBeGreaterThan(STATS.radius * 2 + STINK_KEEP_AWAY * 0.5);
  });
});
