import { describe, expect, test } from "bun:test";
import { DRAG_MIN_TIME, GRAB_IMMUNITY, PlayerStatus, createHealth, damage, deliver, grab, isGrabImmune, rescue, tickHealth, type Health } from "../health/index.js";
import { STREET_LEVEL, levelWorld } from "../level/index.js";
import { TICK_DT } from "../net/index.js";
import { KNOCKDOWN_THRESHOLD, applyImpulse, circleOverlaps, createBody, isDown, stepBody, type Body, type CollisionWorld } from "../physics/index.js";
import { PLAYER_RADIUS, PLAYER_SPEED } from "../player/index.js";
import { GAS_SLOW } from "../gas/index.js";
import { burnCrs, createCrsBot, hitCrs, isWeakened, pickVan, stepCrs, steerTo, strikeCrs, stunCrs, type CrsBot, type CrsContext, type CrsHost } from "./brain.js";
import { CRS_STATS, CrsKind, CrsStatus, GRAB_HP_THRESHOLD, GRAB_WINDUP_SLACK } from "./constants.js";
import { NavGrid } from "./nav.js";
import { vanDoors, type ProtesterView } from "./targeting.js";

const STATS = CRS_STATS[CrsKind.Crs];
const bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
const OPEN: CollisionWorld = { bounds, boxes: [], circles: [] };
const VAN = { x: 0, z: -15 };

interface FakeProtester {
  view: ProtesterView;
  body: Body;
  health: Health;
}

/** The room, reduced to what bots need, on top of the real health machine and bodies. */
class FakeHost implements CrsHost {
  readonly people = new Map<string, FakeProtester>();
  readonly batonHits: { by: string; id: string }[] = [];
  readonly releases: string[] = [];
  readonly arrests: string[] = [];
  /** Floored by a baton (like the room, #70): that knockdown alone is not "down" enough to be grabbed. */
  readonly batonDowned = new Set<string>();
  now = 0;

  add(id: string, x: number, z: number): FakeProtester {
    const p = { view: { id, x, z, status: PlayerStatus.Free, down: false }, body: createBody(x, z), health: createHealth() };
    this.people.set(id, p);
    return p;
  }

  private sync(p: FakeProtester) {
    p.view.status = p.health.status;
    p.view.x = p.body.x;
    p.view.z = p.body.z;
    p.view.down = isDown(p.body);
    p.view.hp = p.health.hp;
    if (!p.view.down) this.batonDowned.delete(p.view.id);
    p.view.batonDown = p.view.down && this.batonDowned.has(p.view.id);
  }

  protesters(): Iterable<ProtesterView> {
    return Array.from(this.people.values(), (p) => p.view);
  }
  protester(id: string) {
    return this.people.get(id)?.view;
  }
  canBeHurt(id: string) {
    const p = this.people.get(id);
    return !!p && (p.health.status === PlayerStatus.Free || p.health.status === PlayerStatus.Grabbed);
  }
  batonHit(by: string, id: string, dirX: number, dirZ: number, amount: number, impulse: number) {
    const p = this.people.get(id);
    if (!p) return;
    this.batonHits.push({ by, id });
    p.health = damage(p.health, amount, this.now);
    if (applyImpulse(p.body, dirX, dirZ, impulse).knockedDown) this.batonDowned.add(id);
    this.sync(p);
  }
  grab(id: string, duration: number) {
    const p = this.people.get(id);
    if (!p) return false;
    const next = grab(p.health, this.now, duration);
    if (next === p.health) return false;
    p.health = next;
    this.sync(p);
    return true;
  }
  canGrab(id: string) {
    const p = this.people.get(id);
    return !!p && p.health.status === PlayerStatus.Free && !isGrabImmune(p.health, this.now);
  }
  arrest(id: string) {
    const p = this.people.get(id);
    if (!p) return;
    this.arrests.push(id);
    p.health = deliver(p.health, this.now);
  }
  release(id: string) {
    const p = this.people.get(id);
    if (!p) return;
    this.releases.push(id);
    p.health = rescue(p.health, this.now);
    this.sync(p);
  }
  drag(id: string, x: number, z: number) {
    const p = this.people.get(id);
    if (!p) return;
    p.body.x = x;
    p.body.z = z;
    this.sync(p);
  }
  shove() {}
  /** What the room does for players each tick, before the bots: health timers, then bodies. */
  tickPeople(world: CollisionWorld) {
    for (const p of this.people.values()) {
      p.health = tickHealth(p.health, this.now).health;
      stepBody(world, p.body, { x: 0, z: 0 }, 6, PLAYER_RADIUS, TICK_DT);
      this.sync(p);
    }
  }
}

function setup(world: CollisionWorld = OPEN, vans = [VAN]) {
  const host = new FakeHost();
  const nav = new NavGrid(world, STATS.radius);
  const bots: CrsBot[] = [];
  const ctx: CrsContext = { world, nav, vans, bots, now: 0, dt: TICK_DT };
  const tick = () => {
    ctx.now += TICK_DT;
    host.now = ctx.now;
    host.tickPeople(world);
    for (const b of bots) stepCrs(b, ctx, host);
  };
  const run = (seconds: number, until?: () => boolean) => {
    for (let t = 0; t < seconds; t += TICK_DT) {
      tick();
      if (until?.()) return true;
    }
    return false;
  };
  const addBot = (id: string, x: number, z: number) => {
    const b = createCrsBot(id, CrsKind.Crs, x, z);
    bots.push(b);
    return b;
  };
  /** Run until a bot holds someone: the wind-up (#70) and a tick or two. */
  const windUp = () => run(STATS.grabWindup + 3 * TICK_DT, () => bots.some((b) => b.status === CrsStatus.Grabbing));
  return { host, ctx, bots, tick, run, addBot, windUp };
}

/** A protester "touching" a bot: edges within grab reach. */
const touching = STATS.radius + PLAYER_RADIUS + STATS.grabReach / 2;

describe("chasing", () => {
  test("walks to the nearest free protester and hits them with the baton", () => {
    const { host, run, addBot } = setup();
    addBot("crs-1", 0, 0);
    host.add("near", 0, 8);
    host.add("far", 0, -15);
    expect(run(5, () => host.batonHits.length > 0)).toBe(true);
    expect(host.batonHits[0]).toEqual({ by: "crs-1", id: "near" });
    const near = host.people.get("near")!;
    expect(near.health.hp).toBe(100 - STATS.batonDamage);
    // The baton floors the protester (#2).
    expect(STATS.batonImpulse).toBeGreaterThanOrEqual(KNOCKDOWN_THRESHOLD);
    expect(near.view.down).toBe(true);
  });

  test("baton hits come no faster than the cooldown", () => {
    const { host, run, addBot, bots } = setup();
    addBot("crs-1", 0, 0);
    const p = host.add("p", 0, touching);
    // Never grabs in this test: keep the grab on cooldown.
    bots[0]!.grabReadyAt = Infinity;
    const times: number[] = [];
    let last = 0;
    run(6, () => {
      if (host.batonHits.length > last) {
        last = host.batonHits.length;
        times.push(host.now);
        // Put the protester back in reach, standing.
        p.body.x = 0;
        p.body.z = touching;
        p.body.vx = p.body.vz = 0;
        p.body.downTime = 0;
      }
      return false;
    });
    expect(times.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(STATS.batonCooldown - 1e-6);
  });

  test("does not chase KO or arrested protesters", () => {
    const { host, run, addBot, bots } = setup();
    addBot("crs-1", 0, 0);
    host.add("ko", 0, 5).health = { ...createHealth(), status: PlayerStatus.Ko, hp: 0, until: 1e9 };
    host.add("van", 3, 0).health = { ...createHealth(), status: PlayerStatus.Arrested, until: 1e9 };
    run(1);
    expect(bots[0]!.targetId).toBeNull();
    expect(bots[0]!.body.x).toBe(0);
    expect(bots[0]!.body.z).toBe(0);
  });

  test("with nobody in sight, walks back to its post", () => {
    const { run, addBot, bots } = setup();
    addBot("crs-1", 0, 0);
    bots[0]!.body.x = 8;
    bots[0]!.body.z = -6;
    expect(run(6, () => Math.hypot(bots[0]!.body.x, bots[0]!.body.z) < 0.6)).toBe(true);
    // Then stays there.
    run(1);
    expect(Math.hypot(bots[0]!.body.x, bots[0]!.body.z)).toBeLessThan(0.6);
  });

  test("drops a target who gets KO'd and goes for the next one", () => {
    const { host, run, addBot, bots } = setup();
    addBot("crs-1", 0, 0);
    const a = host.add("a", 0, 6);
    host.add("b", 0, -10);
    run(0.2);
    expect(bots[0]!.targetId).toBe("a");
    a.health = { ...a.health, status: PlayerStatus.Ko, until: 1e9 };
    run(0.1);
    expect(bots[0]!.targetId).toBe("b");
  });
});

describe("grabbing", () => {
  test("a free protester who is down when touched gets grabbed, after the wind-up (#70)", () => {
    const { host, tick, addBot, bots, windUp } = setup();
    addBot("crs-1", 0, 0);
    const p = host.add("p", 0, touching);
    p.body.downTime = 1;
    tick();
    // The wind-up: arms out, nobody grabbed yet.
    expect(bots[0]!.windupId).toBe("p");
    expect(p.health.status).toBe(PlayerStatus.Free);
    windUp();
    expect(p.health.status).toBe(PlayerStatus.Grabbed);
    expect(bots[0]!.windupId).toBeNull();
    expect(bots[0]!.status).toBe(CrsStatus.Grabbing);
    expect(bots[0]!.grabbedId).toBe("p");
  });

  test("a KO protester is never grabbed", () => {
    const { host, run, addBot, bots } = setup();
    addBot("crs-1", 0, 0);
    const p = host.add("p", 0, touching);
    p.health = { ...p.health, status: PlayerStatus.Ko, hp: 0, until: 1e9 };
    run(1);
    expect(bots[0]!.status).toBe(CrsStatus.Active);
    expect(p.health.status).toBe(PlayerStatus.Ko);
  });

  test("two CRS touching the same protester on the same tick make one grab", () => {
    const { host, tick, addBot, bots, windUp } = setup();
    addBot("crs-1", 0, 0);
    addBot("crs-2", 0, 2 * touching);
    const p = host.add("p", 0, touching);
    p.body.downTime = 1;
    windUp();
    const grabbing = bots.filter((b) => b.status === CrsStatus.Grabbing);
    expect(grabbing.length).toBe(1);
    expect(grabbing[0]!.grabbedId).toBe("p");
    expect(p.health.status).toBe(PlayerStatus.Grabbed);
    // The other one does not hold anybody and looks elsewhere.
    const other = bots.find((b) => b.status !== CrsStatus.Grabbing)!;
    expect(other.grabbedId).toBeNull();
    tick();
    expect(other.targetId).toBeNull();
  });

  test("already grabbed: the grab is refused", () => {
    const { host, run, addBot, bots } = setup();
    addBot("crs-1", 0, 0);
    const p = host.add("p", 0, touching);
    p.health = grab(p.health, 0, 100);
    run(0.5);
    expect(bots[0]!.status).toBe(CrsStatus.Active);
    expect(bots[0]!.grabbedId).toBeNull();
  });

  test("drags to the van and the protester is arrested on arrival (#70), before the fallback", () => {
    const { host, run, addBot, bots, windUp, ctx } = setup();
    addBot("crs-1", 0, 0);
    const p = host.add("p", 0, touching);
    p.body.downTime = 1;
    windUp();
    const grabbedAt = ctx.now;
    const startDist = Math.hypot(VAN.x - p.body.x, VAN.z - p.body.z);
    run(2);
    expect(p.health.status).toBe(PlayerStatus.Grabbed);
    // Dragged closer to the van, at reduced speed, right behind the bot.
    expect(Math.hypot(VAN.x - p.body.x, VAN.z - p.body.z)).toBeLessThan(startDist - 2);
    expect(Math.hypot(p.body.x - bots[0]!.body.x, p.body.z - bots[0]!.body.z)).toBeLessThan(STATS.radius + PLAYER_RADIUS + 0.2);
    expect(run(STATS.grabDuration, () => p.health.status === PlayerStatus.Arrested)).toBe(true);
    const took = ctx.now - grabbedAt;
    // About the walk at drag speed (15 m at 4.2 x 0.55), well before the fallback.
    expect(took).toBeLessThan(STATS.grabDuration - 2);
    expect(took).toBeGreaterThan(startDist / (STATS.speed * STATS.dragSpeedFactor) - 1);
    expect(host.arrests).toEqual(["p"]);
    expect(Math.hypot(VAN.x - bots[0]!.body.x, VAN.z - bots[0]!.body.z)).toBeLessThan(0.8);
    run(2 * TICK_DT);
    expect(bots[0]!.status).toBe(CrsStatus.Active);
    expect(bots[0]!.grabbedId).toBeNull();
  });

  test("a van right beside the grab: the bot waits at the door until DRAG_MIN_TIME (#70)", () => {
    const near = { x: 0, z: -1.2 };
    const { host, run, addBot, windUp, ctx } = setup(OPEN, [near]);
    addBot("crs-1", 0, 0);
    const p = host.add("p", 0, touching);
    p.body.downTime = 1;
    windUp();
    const grabbedAt = ctx.now;
    run(DRAG_MIN_TIME - 0.2);
    expect(p.health.status).toBe(PlayerStatus.Grabbed);
    expect(run(0.5, () => p.health.status === PlayerStatus.Arrested)).toBe(true);
    expect(ctx.now - grabbedAt).toBeGreaterThanOrEqual(DRAG_MIN_TIME - 1e-6);
  });

  test("a van it can never reach: the fallback (grabDuration) still ends the drag (#70)", () => {
    // The van's door is boxed in by walls: no path, and the bot gets stuck against them.
    const door = { x: 0, z: -15 };
    const world: CollisionWorld = {
      bounds,
      boxes: [
        { x: 0, z: -12.5, halfX: 3, halfZ: 0.5 },
        { x: 0, z: -17.5, halfX: 3, halfZ: 0.5 },
        { x: -2.5, z: -15, halfX: 0.5, halfZ: 2 },
        { x: 2.5, z: -15, halfX: 0.5, halfZ: 2 },
      ],
      circles: [],
    };
    const { host, run, addBot, bots, windUp, ctx } = setup(world, [door]);
    addBot("crs-1", 0, 0);
    const p = host.add("p", 0, touching);
    p.body.downTime = 1;
    windUp();
    const grabbedAt = ctx.now;
    run(STATS.grabDuration - 0.3);
    expect(p.health.status).toBe(PlayerStatus.Grabbed);
    expect(host.arrests).toEqual([]);
    expect(run(0.6, () => p.health.status === PlayerStatus.Arrested)).toBe(true);
    expect(ctx.now - grabbedAt).toBeCloseTo(STATS.grabDuration, 0);
    run(2 * TICK_DT);
    expect(bots[0]!.status).toBe(CrsStatus.Active);
  });

  test("a stunned CRS lets go and the protester is free again", () => {
    const { host, tick, run, addBot, bots, ctx, windUp } = setup();
    const bot = addBot("crs-1", 0, 0);
    const p = host.add("p", 0, touching);
    p.body.downTime = 1;
    windUp();
    expect(bot.status).toBe(CrsStatus.Grabbing);
    expect(stunCrs(bot, ctx.now)).toBe(true);
    tick();
    expect(p.health.status).toBe(PlayerStatus.Free);
    expect(bot.grabbedId).toBeNull();
    expect(bot.status).toBe(CrsStatus.Stunned);
    // Stands still while stunned, then back to work.
    const x = bot.body.x;
    const z = bot.body.z;
    run(STATS.stunDuration - 0.2);
    expect(bot.body.x).toBe(x);
    expect(bot.body.z).toBe(z);
    run(0.4);
    expect(bots[0]!.status).not.toBe(CrsStatus.Stunned);
  });

  test("a knocked-down CRS lets go", () => {
    const { host, tick, addBot, windUp } = setup();
    const bot = addBot("crs-1", 0, 0);
    const p = host.add("p", 0, touching);
    p.body.downTime = 1;
    windUp();
    expect(bot.status).toBe(CrsStatus.Grabbing);
    applyImpulse(bot.body, 1, 0, KNOCKDOWN_THRESHOLD + 1);
    tick();
    expect(p.health.status).toBe(PlayerStatus.Free);
    expect(bot.status).toBe(CrsStatus.Active);
  });

  test("a rescued protester is not grabbed again during GRAB_IMMUNITY, even by another CRS touching them (#10)", () => {
    const { host, tick, addBot, ctx, windUp } = setup();
    const holder = addBot("crs-1", 0, 0);
    const p = host.add("p", 0, touching);
    p.body.downTime = 1;
    windUp();
    expect(holder.status).toBe(CrsStatus.Grabbing);
    // A teammate pulls them free (what the room's rescue does).
    p.health = rescue(p.health, ctx.now);
    const freedAt = ctx.now;
    tick();
    expect(holder.status).toBe(CrsStatus.Active);
    // A fresh CRS, ready to grab, keeps touching them while they lie on the floor.
    const fresh = addBot("crs-2", 15, 0);
    let grabbedAt = -1;
    for (let t = 0; t < GRAB_IMMUNITY + STATS.grabWindup + 0.5 && grabbedAt < 0; t += TICK_DT) {
      p.body.x = fresh.body.x - touching;
      p.body.z = fresh.body.z;
      p.body.vx = 0;
      p.body.vz = 0;
      p.body.downTime = 1;
      tick();
      if (p.health.status === PlayerStatus.Grabbed) grabbedAt = ctx.now;
    }
    expect(grabbedAt).toBeGreaterThan(0);
    // #70: the fresh CRS winds up only once the immunity is over, then grabs.
    expect(grabbedAt - freedAt).toBeGreaterThanOrEqual(GRAB_IMMUNITY + STATS.grabWindup - 1e-6);
    expect(grabbedAt - freedAt).toBeLessThan(GRAB_IMMUNITY + STATS.grabWindup + 3 * TICK_DT);
  });

  test("the grabbed protester disconnects: the CRS is free next tick, no error", () => {
    const { host, tick, addBot, windUp } = setup();
    const bot = addBot("crs-1", 0, 0);
    const p = host.add("p", 0, touching);
    p.body.downTime = 1;
    windUp();
    expect(bot.status).toBe(CrsStatus.Grabbing);
    host.people.delete("p");
    expect(() => tick()).not.toThrow();
    expect(bot.status).toBe(CrsStatus.Active);
    expect(bot.grabbedId).toBeNull();
    expect(host.releases).toEqual([]);
  });
});

describe("only a weakened protester is grabbed (#70)", () => {
  /** Keep `p` standing in contact with the bot at (0, 0), as if they leaned on it. */
  const holdInContact = (p: { body: Body }) => {
    p.body.x = 0;
    p.body.z = touching;
    p.body.vx = p.body.vz = 0;
  };

  test("a full-HP protester leaning on a CRS gets the baton, never a grab, even floored by it", () => {
    const { host, run, addBot, bots } = setup();
    addBot("crs-1", 0, 0);
    const p = host.add("p", 0, touching);
    let windups = 0;
    // Two hits take 100 HP to 60: still above the threshold.
    run(STATS.batonCooldown + 0.3, () => {
      holdInContact(p);
      if (bots[0]!.windupId !== null) windups++;
      return false;
    });
    expect(host.batonHits.length).toBe(2);
    expect(p.health.hp).toBe(100 - 2 * STATS.batonDamage);
    expect(p.health.hp).toBeGreaterThan(GRAB_HP_THRESHOLD);
    expect(windups).toBe(0);
    expect(p.health.status).toBe(PlayerStatus.Free);
  });

  test("beaten down to the threshold, the next contact winds up a grab", () => {
    const { host, run, addBot, bots } = setup();
    addBot("crs-1", 0, 0);
    const p = host.add("p", 0, touching);
    expect(
      run(6, () => {
        holdInContact(p);
        return p.health.status === PlayerStatus.Grabbed;
      }),
    ).toBe(true);
    // Three baton hits (100 -> 40), then the wind-up, then the grab.
    expect(host.batonHits.length).toBe(Math.ceil((100 - GRAB_HP_THRESHOLD) / STATS.batonDamage));
    expect(p.health.hp).toBeLessThanOrEqual(GRAB_HP_THRESHOLD);
    expect(bots[0]!.status).toBe(CrsStatus.Grabbing);
  });

  test("isWeakened: low HP, or knocked over by anything but a baton", () => {
    const view = { id: "p", x: 0, z: 0, status: PlayerStatus.Free, down: false, hp: 100 };
    expect(isWeakened(view)).toBe(false);
    expect(isWeakened({ ...view, hp: GRAB_HP_THRESHOLD })).toBe(true);
    expect(isWeakened({ ...view, hp: GRAB_HP_THRESHOLD + 1 })).toBe(false);
    expect(isWeakened({ ...view, down: true })).toBe(true);
    expect(isWeakened({ ...view, down: true, batonDown: true })).toBe(false);
    expect(isWeakened({ ...view, down: true, batonDown: true, hp: 20 })).toBe(true);
  });

  test("the BAC grabs whatever the HP (grabAnyHp), after its shorter wind-up", () => {
    const { host, ctx, bots, run } = setup();
    const bac = createCrsBot("bac-1", CrsKind.Bac, 0, 0);
    bac.revealed = true;
    bots.push(bac);
    const bacStats = CRS_STATS[CrsKind.Bac];
    expect(bacStats.grabWindup).toBeLessThan(STATS.grabWindup);
    const p = host.add("p", 0, bacStats.radius + PLAYER_RADIUS + bacStats.grabReach / 2);
    expect(run(bacStats.grabWindup + 3 * TICK_DT, () => p.health.status === PlayerStatus.Grabbed)).toBe(true);
    expect(p.health.hp).toBe(100);
    expect(ctx.now).toBeGreaterThanOrEqual(bacStats.grabWindup);
  });
});

describe("the grab's wind-up (#70)", () => {
  /** A bot about to grab a downed protester: the wind-up has just started. */
  function windingUp() {
    const t = setup();
    const bot = t.addBot("crs-1", 0, 0);
    const p = t.host.add("p", 0, touching);
    p.body.downTime = 2;
    t.tick();
    expect(bot.windupId).toBe("p");
    return { ...t, bot, p };
  }

  test("starts on contact and lasts grabWindup: the bot stands still meanwhile", () => {
    const { bot, p, run, ctx } = windingUp();
    const started = ctx.now;
    const x = bot.body.x;
    run(STATS.grabWindup - 2 * TICK_DT);
    expect(p.health.status).toBe(PlayerStatus.Free);
    expect(bot.windupId).toBe("p");
    expect(bot.body.x).toBe(x);
    expect(run(4 * TICK_DT, () => p.health.status === PlayerStatus.Grabbed)).toBe(true);
    expect(ctx.now - started).toBeGreaterThanOrEqual(STATS.grabWindup - 1e-6);
  });

  test("a dodge cancels it, and the bot waits its grab cooldown", () => {
    const { bot, p, tick, run, ctx } = windingUp();
    p.view.dodging = true;
    tick();
    expect(bot.windupId).toBeNull();
    expect(bot.grabReadyAt).toBeCloseTo(ctx.now + STATS.grabCooldown, 5);
    p.view.dodging = false;
    run(STATS.grabWindup + 0.2);
    expect(p.health.status).toBe(PlayerStatus.Free);
  });

  test("a hop cancels it", () => {
    const { bot, p, tick } = windingUp();
    p.view.airborne = true;
    tick();
    expect(bot.windupId).toBeNull();
    expect(p.health.status).toBe(PlayerStatus.Free);
  });

  test("a hit that staggers the bot cancels it", () => {
    const { bot, p, tick, ctx } = windingUp();
    hitCrs(bot, 0, touching, 1, ctx.now);
    expect(bot.windupId).toBeNull();
    tick();
    expect(p.health.status).toBe(PlayerStatus.Free);
    expect(bot.grabReadyAt).toBeGreaterThan(ctx.now);
  });

  test("a thrown item cancels it too", () => {
    const { bot, ctx } = windingUp();
    strikeCrs(bot, 0, 1, 0, 0, 0, ctx.now);
    expect(bot.windupId).toBeNull();
  });

  test("stepping out of reach cancels it", () => {
    const { bot, p, tick } = windingUp();
    p.body.z = touching + GRAB_WINDUP_SLACK + 0.3;
    p.body.vz = 0;
    tick();
    expect(bot.windupId).toBeNull();
    expect(p.health.status).toBe(PlayerStatus.Free);
  });

  test("a stunned bot drops it", () => {
    const { bot, p, tick, ctx } = windingUp();
    stunCrs(bot, ctx.now);
    tick();
    expect(bot.windupId).toBeNull();
    expect(p.health.status).toBe(PlayerStatus.Free);
  });
});

describe("where the drag goes (#70)", () => {
  test("pickVan: the nearest van by walking distance, not as the crow flies", () => {
    // A wall between the bot and the closer van makes the walk there longer than to the other one.
    const world: CollisionWorld = { bounds, boxes: [{ x: 0, z: -3, halfX: 15, halfZ: 0.5 }], circles: [] };
    const nav = new NavGrid(world, STATS.radius);
    const behindWall = { x: 0, z: -6 };
    const open = { x: 0, z: 9 };
    expect(pickVan({ x: 0, z: 0 }, [behindWall, open], nav)).toBe(1);
    // Without the wall, the closer one.
    expect(pickVan({ x: 0, z: 0 }, [behindWall, open], new NavGrid(OPEN, STATS.radius))).toBe(0);
  });

  test("pickVan: none reachable, the nearest as the crow flies; no vans, -1", () => {
    const world: CollisionWorld = {
      bounds,
      boxes: [
        { x: 0, z: -12.5, halfX: 3, halfZ: 0.5 },
        { x: 0, z: -17.5, halfX: 3, halfZ: 0.5 },
        { x: -2.5, z: -15, halfX: 0.5, halfZ: 2 },
        { x: 2.5, z: -15, halfX: 0.5, halfZ: 2 },
      ],
      circles: [],
    };
    const nav = new NavGrid(world, STATS.radius);
    expect(pickVan({ x: 0, z: 0 }, [{ x: 0, z: -15 }], nav)).toBe(0);
    expect(pickVan({ x: 0, z: 0 }, [], nav)).toBe(-1);
  });

  test("the grab picks the van, and the drag heads for it", () => {
    const vans = [
      { x: 15, z: 15 },
      { x: -15, z: 0 },
    ];
    const { host, run, addBot, windUp } = setup(OPEN, vans);
    const bot = addBot("crs-1", 0, 0);
    const p = host.add("p", 0, touching);
    p.body.downTime = 1;
    windUp();
    expect(bot.dragVan).toBe(1);
    run(1.5);
    expect(bot.body.x).toBeLessThan(-1.5);
  });

  test("the street: every van door can be reached and each one is picked from somewhere", () => {
    const world = levelWorld(STREET_LEVEL);
    const nav = new NavGrid(world, STATS.radius);
    const doors = vanDoors(STREET_LEVEL);
    expect(doors.length).toBeGreaterThanOrEqual(5);
    const picked = new Set<number>();
    for (let z = 95; z >= -95; z -= 5) picked.add(pickVan({ x: 0, z }, doors, nav));
    expect(picked.size).toBe(doors.length);
  });
});

describe("protesters hitting a CRS", () => {
  test("pushes it away; every third hit in a row knocks it over", () => {
    const bot = createCrsBot("crs-1", CrsKind.Crs, 0, 0);
    const first = hitCrs(bot, 0, -1, 1, 0)!;
    expect(first.impulse.dirZ).toBeCloseTo(1, 6);
    expect(first.impulse.knockedDown).toBe(false);
    expect(hitCrs(bot, 0, -1, 1, 0.5)!.impulse.knockedDown).toBe(false);
    expect(hitCrs(bot, 0, -1, 1, 1)!.impulse.knockedDown).toBe(true);
    expect(bot.hp).toBe(STATS.maxHp - 3);
  });

  test("hits too far apart do not stack", () => {
    const bot = createCrsBot("crs-1", CrsKind.Crs, 0, 0);
    for (let i = 0; i < 3; i++) expect(hitCrs(bot, 0, -1, 1, i * (STATS.staggerWindow + 0.1))!.impulse.knockedDown).toBe(false);
  });

  test("at 0 HP it is out, on the floor, and ignores further hits", () => {
    const bot = createCrsBot("crs-1", CrsKind.Crs, 0, 0);
    const res = hitCrs(bot, 0, -1, STATS.maxHp, 0)!;
    expect(res.out).toBe(true);
    expect(bot.status).toBe(CrsStatus.Out);
    expect(isDown(bot.body)).toBe(true);
    expect(hitCrs(bot, 0, -1, 1, 0.1)).toBeNull();
    expect(stunCrs(bot, 0.1)).toBe(false);
  });

  test("stats come from the table: changing the row changes the bot", () => {
    const bot = createCrsBot("crs-1", CrsKind.Crs, 0, 0);
    expect(bot.hp).toBe(STATS.maxHp);
    expect(bot.stats).toBe(STATS);
  });
});

describe("a thrown item hitting a CRS (#8)", () => {
  test("damages it, pushes it along the throw, floors and stuns it", () => {
    const bot = createCrsBot("crs-1", CrsKind.Crs, 0, 0);
    const res = strikeCrs(bot, 1, 0, 2, KNOCKDOWN_THRESHOLD + 4, 1.5, 0)!;
    expect(res.out).toBe(false);
    expect(bot.hp).toBe(STATS.maxHp - 2);
    expect(res.impulse.dirX).toBeCloseTo(1, 6);
    expect(res.impulse.knockedDown).toBe(true);
    expect(bot.status).toBe(CrsStatus.Stunned);
    expect(bot.statusUntil).toBeCloseTo(1.5, 6);
  });

  test("a grabbing CRS struck lets go on its next tick, with the rescue's grab immunity", () => {
    const { host, tick, addBot, bots, ctx, windUp } = setup();
    addBot("crs-1", 0, 0);
    const p = host.add("p", 0, touching);
    p.body.downTime = 1;
    windUp();
    expect(bots[0]!.status).toBe(CrsStatus.Grabbing);
    strikeCrs(bots[0]!, 0, 1, 2, KNOCKDOWN_THRESHOLD + 4, 1.5, ctx.now);
    tick();
    expect(host.releases).toEqual(["p"]);
    expect(p.health.status).toBe(PlayerStatus.Free);
    expect(p.health.grabImmuneUntil).toBeGreaterThan(ctx.now);
  });

  test("the hit that empties its HP takes it out; an out bot ignores it", () => {
    const bot = createCrsBot("crs-1", CrsKind.Crs, 0, 0);
    expect(strikeCrs(bot, 1, 0, STATS.maxHp, 1, 1.5, 0)!.out).toBe(true);
    expect(bot.status).toBe(CrsStatus.Out);
    expect(isDown(bot.body)).toBe(true);
    expect(strikeCrs(bot, 1, 0, 1, 1, 1.5, 0.1)).toBeNull();
  });

  test("fire (#16): HP off with no push or stun; at 0 it is out", () => {
    const bot = createCrsBot("crs-1", CrsKind.Crs, 0, 0);
    expect(burnCrs(bot, 1, 0)).toBe(false);
    expect(bot.hp).toBe(STATS.maxHp - 1);
    expect(bot.status).toBe(CrsStatus.Active);
    expect(bot.body.vx === 0 && bot.body.vz === 0 && !isDown(bot.body)).toBe(true);
    expect(burnCrs(bot, STATS.maxHp, 1)).toBe(true);
    expect(bot.status).toBe(CrsStatus.Out);
    expect(burnCrs(bot, 1, 2)).toBe(false);
  });
});

describe("the full street", () => {
  const world = levelWorld(STREET_LEVEL);
  const nav = new NavGrid(world, STATS.radius);

  /**
   * Walk a bot from every CRS spawn point to goals spread along the street,
   * around buildings, kiosks and works walls. It must get there in reasonable
   * time and never stay pressed against a wall (no progress) for more than 2 s.
   */
  test("bots from every spawn reach goals across the street without grinding on walls", () => {
    const goals = [
      { x: 0, z: 92 },
      { x: -6, z: 20 }, // past the works wall
      { x: -6, z: -64 }, // behind works-2 and kiosk-4
      { x: 0, z: -84 },
    ];
    for (const spawn of STREET_LEVEL.crsSpawns) {
      for (const goal of goals) {
        const bot = createCrsBot("crs", CrsKind.Crs, spawn.x, spawn.z);
        const ctx: CrsContext = { world, nav, vans: [], bots: [bot], now: 0, dt: TICK_DT };
        const limit = Math.hypot(goal.x - spawn.x, goal.z - spawn.z) / STATS.speed * 1.6 + 4;
        let stillFor = 0;
        let worstStill = 0;
        let reached = false;
        for (ctx.now = 0; ctx.now < limit; ctx.now += TICK_DT) {
          const x = bot.body.x;
          const z = bot.body.z;
          steerTo(bot, goal.x, goal.z, ctx);
          stepBody(world, bot.body, bot.input, STATS.speed, STATS.radius, TICK_DT);
          const step = Math.hypot(bot.body.x - x, bot.body.z - z);
          stillFor = step < STATS.speed * TICK_DT * 0.25 ? stillFor + TICK_DT : 0;
          worstStill = Math.max(worstStill, stillFor);
          if (Math.hypot(goal.x - bot.body.x, goal.z - bot.body.z) < 0.6) {
            reached = true;
            break;
          }
        }
        const label = `${spawn.x},${spawn.z} -> ${goal.x},${goal.z}`;
        expect({ label, reached }).toEqual({ label, reached: true });
        expect({ label, stuck: worstStill > 2 }).toEqual({ label, stuck: false });
      }
    }
  });

  test("spawn points are clear for a CRS, inside the street and outside the start zone", () => {
    const s = STREET_LEVEL.start;
    for (const p of STREET_LEVEL.crsSpawns) {
      expect(circleOverlaps(world, p.x, p.z, STATS.radius)).toBe(false);
      expect(p.x >= s.minX && p.x <= s.maxX && p.z >= s.minZ && p.z <= s.maxZ).toBe(false);
    }
  });

  test("van doors are reachable from the start zone", () => {
    for (const door of vanDoors(STREET_LEVEL)) {
      expect(circleOverlaps(world, door.x, door.z, STATS.radius)).toBe(false);
      expect(nav.findPath({ x: 0, z: 92 }, door)).not.toBeNull();
    }
  });
});

describe("tear gas (#7)", () => {
  /** A host that records canisters and accepts them while `accept` is true. */
  class GasHost extends FakeHost {
    readonly throws: { by: string; to: { x: number; z: number } }[] = [];
    accept = true;
    throwGas(by: string, _from: { x: number; z: number }, to: { x: number; z: number }) {
      if (!this.accept) return false;
      this.throws.push({ by, to: { x: to.x, z: to.z } });
      return true;
    }
  }

  function gasSetup() {
    const host = new GasHost();
    const nav = new NavGrid(OPEN, STATS.radius);
    const bots: CrsBot[] = [];
    const ctx: CrsContext = { world: OPEN, nav, vans: [VAN], bots, now: 0, dt: TICK_DT, rng: () => 0.5 };
    const run = (seconds: number) => {
      for (let t = 0; t < seconds; t += TICK_DT) {
        ctx.now += TICK_DT;
        host.now = ctx.now;
        for (const b of bots) stepCrs(b, ctx, host);
      }
    };
    return { host, ctx, bots, run };
  }

  test("a gassed protester still outruns a CRS", () => {
    expect(PLAYER_SPEED * GAS_SLOW).toBeGreaterThan(STATS.speed);
  });

  test("a fresh bot's first canister is ready after half a cooldown", () => {
    expect(createCrsBot("crs-1", CrsKind.Crs, 0, 0, 0, 7).gasReadyAt).toBe(7 + STATS.gasCooldown / 2);
  });

  test("a CRS throws at a bunch of protesters in range, then waits its cooldown", () => {
    const { host, bots, run } = gasSetup();
    const bot = createCrsBot("crs-1", CrsKind.Crs, 0, 0);
    bot.gasReadyAt = 0.1;
    bots.push(bot);
    host.add("a", 0, 12);
    host.add("b", 1, 12);
    run(0.3);
    expect(host.throws.length).toBe(1);
    const to = host.throws[0]!.to;
    // Aimed at the bunch, give or take the scatter.
    expect(Math.hypot(to.x - 0.5, to.z - 12)).toBeLessThanOrEqual(1.01);
    // Facing the throw.
    expect(Math.abs(bot.rotation - Math.atan2(to.x, to.z))).toBeLessThan(0.3);
    expect(bot.gasReadyAt).toBeCloseTo(0.1 + STATS.gasCooldown, 1);
  });

  test("no throw at a lone protester", () => {
    const { host, bots, run } = gasSetup();
    bots.push(createCrsBot("crs-1", CrsKind.Crs, 0, 0));
    host.add("a", 0, 10);
    run(STATS.gasCooldown);
    expect(host.throws.length).toBe(0);
  });

  test("a refused throw is retried later, not every tick, and is not a throw", () => {
    const { host, bots, run, ctx } = gasSetup();
    const bot = createCrsBot("crs-1", CrsKind.Crs, 0, 0);
    bots.push(bot);
    bot.gasReadyAt = 0.1;
    host.add("a", 0, 12);
    host.add("b", 1, 12);
    host.accept = false;
    run(0.2);
    expect(host.throws.length).toBe(0);
    expect(bot.gasReadyAt).toBeGreaterThan(ctx.now);
    expect(bot.gasReadyAt).toBeLessThanOrEqual(ctx.now + STATS.retargetInterval + 1e-9);
    host.accept = true;
    run(STATS.retargetInterval);
    expect(host.throws.length).toBe(1);
  });

  test("a grabbing or stunned bot throws nothing", () => {
    const { host, bots, run, ctx } = gasSetup();
    const bot = createCrsBot("crs-1", CrsKind.Crs, 0, 0);
    bots.push(bot);
    host.add("a", 0, 10);
    host.add("b", 1, 10);
    stunCrs(bot, ctx.now, 100);
    run(STATS.gasCooldown);
    expect(host.throws.length).toBe(0);
  });
});

describe("pompier (#17): knocked over, never hurt", () => {
  const pompier = () => createCrsBot("p", CrsKind.Pompier, 0, 0);

  test("a melee hit floors it every time, takes no HP and never takes it out", () => {
    const bot = pompier();
    const hp = bot.hp;
    for (let i = 0; i < 20; i++) {
      bot.body.downTime = 0;
      bot.body.immuneTime = 0;
      const res = hitCrs(bot, -1, 0, 5, i * 2);
      expect(res?.out).toBe(false);
      expect(res?.impulse.knockedDown).toBe(true);
      expect(bot.hp).toBe(hp);
      expect(bot.status).toBe(CrsStatus.Active);
    }
  });

  test("a pavé or a thrown teammate floors it, no damage and no stun", () => {
    const bot = pompier();
    const res = strikeCrs(bot, 1, 0, 50, 14, 3, 0);
    expect(res?.out).toBe(false);
    expect(res?.impulse.knockedDown).toBe(true);
    expect(bot.hp).toBe(CRS_STATS[CrsKind.Pompier].maxHp);
    expect(bot.status).toBe(CrsStatus.Active);
  });

  test("fireproof and never dazed", () => {
    const bot = pompier();
    expect(burnCrs(bot, 99, 0)).toBe(false);
    expect(stunCrs(bot, 0, 5)).toBe(false);
    expect(bot.hp).toBe(CRS_STATS[CrsKind.Pompier].maxHp);
    expect(bot.status).toBe(CrsStatus.Active);
  });

  test("the police take damage as before", () => {
    const bot = createCrsBot("c", CrsKind.Crs, 0, 0);
    hitCrs(bot, -1, 0, 1, 0);
    expect(bot.hp).toBe(STATS.maxHp - 1);
  });
});
