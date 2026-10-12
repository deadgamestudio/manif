import { describe, expect, test } from "bun:test";
import { PlayerStatus, createHealth, damage, grab, rescue, tickHealth, type Health } from "../health/index.js";
import { STREET_LEVEL, levelWorld } from "../level/index.js";
import { TICK_DT } from "../net/index.js";
import { KNOCKDOWN_THRESHOLD, applyImpulse, circleOverlaps, createBody, isDown, stepBody, type Body, type CollisionWorld } from "../physics/index.js";
import { PLAYER_RADIUS } from "../player/index.js";
import { createCrsBot, hitCrs, stepCrs, steerTo, stunCrs, type CrsBot, type CrsContext, type CrsHost } from "./brain.js";
import { CRS_STATS, CrsKind, CrsStatus } from "./constants.js";
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
    applyImpulse(p.body, dirX, dirZ, impulse);
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
  release(id: string) {
    const p = this.people.get(id);
    if (!p) return;
    this.releases.push(id);
    p.health = rescue(p.health);
    this.sync(p);
  }
  drag(id: string, x: number, z: number) {
    const p = this.people.get(id);
    if (!p) return;
    p.body.x = x;
    p.body.z = z;
    this.sync(p);
  }
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
  return { host, ctx, bots, tick, run, addBot };
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
  test("a free protester who is down when touched gets grabbed", () => {
    const { host, tick, addBot, bots } = setup();
    addBot("crs-1", 0, 0);
    const p = host.add("p", 0, touching);
    p.body.downTime = 1;
    tick();
    expect(p.health.status).toBe(PlayerStatus.Grabbed);
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
    const { host, tick, addBot, bots } = setup();
    addBot("crs-1", 0, 0);
    addBot("crs-2", 0, 2 * touching);
    const p = host.add("p", 0, touching);
    p.body.downTime = 1;
    tick();
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

  test("drags towards the van, and the protester is arrested after the drag time", () => {
    const { host, run, addBot, bots } = setup();
    addBot("crs-1", 0, 0);
    const p = host.add("p", 0, touching);
    p.body.downTime = 1;
    const startDist = Math.hypot(VAN.x - 0, VAN.z - touching);
    run(STATS.grabDuration - 0.2);
    expect(p.health.status).toBe(PlayerStatus.Grabbed);
    // Dragged closer to the van, at reduced speed, right behind the bot.
    const dist = Math.hypot(VAN.x - p.body.x, VAN.z - p.body.z);
    expect(dist).toBeLessThan(startDist - 3);
    expect(Math.hypot(p.body.x - bots[0]!.body.x, p.body.z - bots[0]!.body.z)).toBeLessThan(STATS.radius + PLAYER_RADIUS + 0.2);
    run(0.3);
    expect(p.health.status).toBe(PlayerStatus.Arrested);
    expect(bots[0]!.status).toBe(CrsStatus.Active);
    expect(bots[0]!.grabbedId).toBeNull();
  });

  test("a stunned CRS lets go and the protester is free again", () => {
    const { host, tick, run, addBot, bots, ctx } = setup();
    const bot = addBot("crs-1", 0, 0);
    const p = host.add("p", 0, touching);
    p.body.downTime = 1;
    tick();
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
    const { host, tick, addBot } = setup();
    const bot = addBot("crs-1", 0, 0);
    const p = host.add("p", 0, touching);
    p.body.downTime = 1;
    tick();
    expect(bot.status).toBe(CrsStatus.Grabbing);
    applyImpulse(bot.body, 1, 0, KNOCKDOWN_THRESHOLD + 1);
    tick();
    expect(p.health.status).toBe(PlayerStatus.Free);
    expect(bot.status).toBe(CrsStatus.Active);
  });

  test("the grabbed protester disconnects: the CRS is free next tick, no error", () => {
    const { host, tick, addBot } = setup();
    const bot = addBot("crs-1", 0, 0);
    const p = host.add("p", 0, touching);
    p.body.downTime = 1;
    tick();
    expect(bot.status).toBe(CrsStatus.Grabbing);
    host.people.delete("p");
    expect(() => tick()).not.toThrow();
    expect(bot.status).toBe(CrsStatus.Active);
    expect(bot.grabbedId).toBeNull();
    expect(host.releases).toEqual([]);
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
