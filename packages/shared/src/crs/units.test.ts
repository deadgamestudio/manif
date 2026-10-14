/**
 * Unit types (#13): the BAC's disguise and the BRAV-M's bike, each type's
 * decision step on a fake room, plus the shared table they read.
 */
import { describe, expect, test } from "bun:test";
import { PlayerStatus } from "../health/index.js";
import { DEFAULT_NAMES } from "../lobby/index.js";
import { TICK_DT } from "../net/index.js";
import { applyImpulse, circleOverlaps, createBody, isDown, stepBody, type Body, type CollisionWorld } from "../physics/index.js";
import { PLAYER_RADIUS, PLAYER_SPEED } from "../player/index.js";
import { BAC_BEHAVIOUR, bacOrders, bacStalkAt, disguiseName, revealBac } from "./bac.js";
import { createCrsBot, stepCrs, type CrsBehaviour, type CrsBot, type CrsContext, type CrsHost } from "./brain.js";
import {
  BRAVM_BEHAVIOUR,
  bikeOf,
  canRemount,
  isRiding,
  leaveBike,
  mountBike,
  remount,
  stepBike,
  stepWreck,
  sweepProtesters,
  type BikeEvent,
} from "./bravm.js";
import { CRS_STATS, CrsKind, CrsMount, CrsStatus, crsMaxHp, crsRadius } from "./constants.js";
import { NavGrid } from "./nav.js";
import type { ProtesterView } from "./targeting.js";

const BAC = CRS_STATS[CrsKind.Bac];
const BRAVM = CRS_STATS[CrsKind.BravM];
const BIKE = BRAVM.bike!;
const DISGUISE = BAC.disguise!;

interface Person {
  view: ProtesterView;
  body: Body;
  /** Walking direction each tick (unit or zero). */
  walk: { x: number; z: number };
}

/** The room as the bots see it: bodies stepped each tick, grabs and shoves recorded. */
class FakeHost implements CrsHost {
  readonly people = new Map<string, Person>();
  readonly grabs: { id: string; at: number }[] = [];
  readonly shoves: { by: string; id: string; strength: number; floor: boolean }[] = [];
  readonly batonHits: string[] = [];
  now = 0;

  add(id: string, x: number, z: number): Person {
    const p = { view: { id, x, z, status: PlayerStatus.Free, down: false }, body: createBody(x, z), walk: { x: 0, z: 0 } };
    this.people.set(id, p);
    return p;
  }
  private sync(p: Person) {
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
    return this.people.get(id)?.view.status === PlayerStatus.Free;
  }
  batonHit(_by: string, id: string, dirX: number, dirZ: number, _damage: number, impulse: number) {
    const p = this.people.get(id);
    if (!p) return;
    this.batonHits.push(id);
    applyImpulse(p.body, dirX, dirZ, impulse);
    this.sync(p);
  }
  grab(id: string) {
    const p = this.people.get(id);
    if (!p || p.view.status !== PlayerStatus.Free) return false;
    p.view.status = PlayerStatus.Grabbed;
    this.grabs.push({ id, at: this.now });
    return true;
  }
  release(id: string) {
    const p = this.people.get(id);
    if (p) p.view.status = PlayerStatus.Free;
  }
  arrest(id: string) {
    const p = this.people.get(id);
    if (p) p.view.status = PlayerStatus.Arrested;
  }
  drag(id: string, x: number, z: number) {
    const p = this.people.get(id);
    if (!p) return;
    p.body.x = x;
    p.body.z = z;
    this.sync(p);
  }
  shove(by: string, id: string, dirX: number, dirZ: number, strength: number, floor: boolean) {
    const p = this.people.get(id);
    if (!p) return;
    this.shoves.push({ by, id, strength, floor });
    applyImpulse(p.body, dirX, dirZ, strength, floor ? "always" : "never");
    this.sync(p);
  }
  /** Protesters move first each tick, like in the room. */
  tickPeople(world: CollisionWorld) {
    for (const p of this.people.values()) {
      if (p.view.status === PlayerStatus.Grabbed) continue;
      stepBody(world, p.body, p.walk, PLAYER_SPEED, PLAYER_RADIUS, TICK_DT);
      this.sync(p);
    }
  }
}

const bounds = { minX: -30, maxX: 30, minZ: -60, maxZ: 60 };
const OPEN: CollisionWorld = { bounds, boxes: [], circles: [] };

function setup(world: CollisionWorld = OPEN) {
  const host = new FakeHost();
  const bots: CrsBot[] = [];
  const ctx: CrsContext = { world, nav: new NavGrid(world, BRAVM.radius), vans: [{ x: 0, z: -50 }], bots, now: 0, dt: TICK_DT };
  const bikeCtx: CrsContext = { ...ctx, nav: new NavGrid(world, BIKE.radius) };
  const events: BikeEvent[] = [];
  const behaviours = new Map<string, CrsBehaviour>();
  const tick = () => {
    ctx.now += TICK_DT;
    bikeCtx.now = ctx.now;
    host.now = ctx.now;
    host.tickPeople(world);
    for (const b of bots) {
      if (b.mount === CrsMount.Wreck) stepWreck(world, b, TICK_DT);
      else if (isRiding(b)) {
        const e = stepBike(b, bikeCtx, host);
        if (e) events.push(e);
      } else stepCrs(b, ctx, host, behaviours.get(b.id));
    }
  };
  const run = (seconds: number, until?: () => boolean, each?: () => void) => {
    for (let t = 0; t < seconds; t += TICK_DT) {
      tick();
      each?.();
      if (until?.()) return true;
    }
    return false;
  };
  const addBac = (id: string, x: number, z: number, blend: number) => {
    const b = createCrsBot(id, CrsKind.Bac, x, z, 0, ctx.now);
    b.stalkAt = ctx.now + blend;
    bots.push(b);
    behaviours.set(id, BAC_BEHAVIOUR);
    return b;
  };
  const addBike = (id: string, x: number, z: number) => {
    const b = createCrsBot(id, CrsKind.BravM, x, z, 0, ctx.now);
    mountBike(b, ctx.now);
    bots.push(b);
    behaviours.set(id, BRAVM_BEHAVIOUR);
    return b;
  };
  const addRider = (id: string, x: number, z: number) => {
    const b = createCrsBot(id, CrsKind.BravM, x, z, 0, ctx.now);
    bots.push(b);
    behaviours.set(id, BRAVM_BEHAVIOUR);
    return b;
  };
  return { host, ctx, bikeCtx, bots, events, tick, run, addBac, addBike, addRider };
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe("the unit table (#13)", () => {
  test("a BAC is a protester's size and walking speed, so the disguise holds", () => {
    expect(BAC.radius).toBe(PLAYER_RADIUS);
    expect(BAC.speed).toBe(PLAYER_SPEED);
    // It reaches out (its grab wind-up, #70) on the tick it reveals itself.
    expect(DISGUISE.revealRange).toBeLessThanOrEqual(BAC.grabReach);
    expect(DISGUISE.blendMin).toBeLessThanOrEqual(DISGUISE.blendMax);
    // Weak once revealed: fewer HP than a CRS, never gases.
    expect(BAC.maxHp).toBeLessThan(CRS_STATS[CrsKind.Crs].maxHp);
    expect(BAC.gasCooldown).toBe(0);
  });

  test("the bike outruns a protester and its ram floors", () => {
    expect(BIKE.speed).toBeGreaterThan(PLAYER_SPEED);
    expect(BIKE.ramImpulse).toBeGreaterThanOrEqual(10);
    expect(crsRadius(CrsKind.BravM, CrsMount.Duo)).toBe(BIKE.radius);
    expect(crsRadius(CrsKind.BravM, CrsMount.Wreck)).toBe(BIKE.radius);
    expect(crsRadius(CrsKind.BravM, CrsMount.Foot)).toBe(BRAVM.radius);
    expect(crsRadius(CrsKind.Crs)).toBe(CRS_STATS[CrsKind.Crs].radius);
    expect(crsMaxHp(CrsKind.BravM, CrsMount.Solo)).toBe(BIKE.hp);
    expect(crsMaxHp(CrsKind.BravM, CrsMount.Foot)).toBe(BRAVM.maxHp);
  });

  test("only the BAC starts disguised", () => {
    expect(createCrsBot("a", CrsKind.Crs, 0, 0).revealed).toBe(true);
    expect(createCrsBot("b", CrsKind.BravM, 0, 0).revealed).toBe(true);
    expect(createCrsBot("c", CrsKind.Bac, 0, 0).revealed).toBe(false);
    expect(createCrsBot("d", CrsKind.Bac, 0, 0).mount).toBe(CrsMount.Foot);
  });
});

describe("BAC (#13)", () => {
  test("blends in: keeps near the cortège and walks along with it, without touching or grabbing anyone", () => {
    const { host, run, addBac, bots } = setup();
    const bac = addBac("bac", 0, 6, 8);
    const p = host.add("p", 0, 0);
    // The cortège walks down the street (-z), then stops.
    p.walk = { x: 0, z: -1 };
    let minGap = Infinity;
    run(3, undefined, () => {
      minGap = Math.min(minGap, dist(bac.body, p.body) - 2 * PLAYER_RADIUS);
    });
    p.walk = { x: 0, z: 0 };
    run(2, undefined, () => {
      minGap = Math.min(minGap, dist(bac.body, p.body) - 2 * PLAYER_RADIUS);
    });
    expect(bots[0]!.revealed).toBe(false);
    expect(host.grabs).toHaveLength(0);
    expect(host.batonHits).toHaveLength(0);
    // It kept up (18 m walked) and stayed about followGap away, never on top of them.
    expect(dist(bac.body, p.body) - 2 * PLAYER_RADIUS).toBeLessThan(DISGUISE.followGap + 0.6);
    expect(minGap).toBeGreaterThan(DISGUISE.followGap - 0.5);
  });

  test("after blending, sidles up to someone and reveals itself only once close, then grabs after its short wind-up", () => {
    const { host, run, addBac } = setup();
    const bac = addBac("bac", 0, 6, 1);
    host.add("p", 0, 0);
    let revealedGap = Infinity;
    let revealedAt = -1;
    run(6, () => bac.revealed, () => {
      if (bac.revealed && revealedAt < 0) {
        revealedAt = host.now;
        revealedGap = dist(bac.body, host.people.get("p")!.body) - 2 * PLAYER_RADIUS;
      }
    });
    expect(bac.revealed).toBe(true);
    expect(revealedAt).toBeGreaterThanOrEqual(1);
    expect(revealedGap).toBeLessThanOrEqual(DISGUISE.revealRange + 1e-6);
    // Reveal and reach out at once (#70: a short wind-up, the only warning), then the grab: the big comedic beat.
    expect(bac.windupId).toBe("p");
    expect(host.grabs).toEqual([]);
    run(CRS_STATS[CrsKind.Bac].grabWindup + 3 * TICK_DT, () => host.grabs.length > 0);
    expect(host.grabs.map((g) => g.id)).toEqual(["p"]);
    expect(host.grabs[0]!.at - revealedAt).toBeCloseTo(CRS_STATS[CrsKind.Bac].grabWindup, 1);
    expect(bac.status).toBe(CrsStatus.Grabbing);
  });

  test("never reveals while a protester stays out of reach, until stalkMax runs out", () => {
    // A long street, so the protester never reaches its end.
    const { host, run, addBac, ctx } = setup({ bounds: { minX: -30, maxX: 30, minZ: -300, maxZ: 60 }, boxes: [], circles: [] });
    const bac = addBac("bac", 0, 10, 0.5);
    const p = host.add("p", 0, 0);
    // The protester keeps running away at the same speed.
    p.walk = { x: 0, z: -1 };
    const start = ctx.now;
    run(DISGUISE.stalkMax - 1);
    expect(bac.revealed).toBe(false);
    run(3);
    expect(bac.revealed).toBe(true);
    expect(ctx.now - start).toBeGreaterThanOrEqual(0.5 + DISGUISE.stalkMax - 0.1);
    expect(host.grabs).toHaveLength(0);
  });

  test("a hit reveals it at once (revealBac), and its first move then is a grab, not the baton", () => {
    const { host, run, addBac, ctx } = setup();
    const bac = addBac("bac", 0, 0.8, 30);
    host.add("p", 0, 0);
    expect(revealBac(bac, ctx.now)).toBe(true);
    expect(revealBac(bac, ctx.now)).toBe(false);
    expect(bac.batonReadyAt).toBeGreaterThan(ctx.now);
    run(1, () => host.grabs.length > 0);
    expect(host.grabs.map((g) => g.id)).toEqual(["p"]);
    expect(host.batonHits).toHaveLength(0);
  });

  test("its decision step leaves revealed BAC to the base bot", () => {
    const { host, ctx, addBac } = setup();
    const bac = addBac("bac", 0, 5, 0);
    host.add("p", 0, 0);
    bac.revealed = true;
    expect(bacOrders(bac, ctx, host)).toBe(false);
  });

  test("blend time is drawn in [blendMin, blendMax]", () => {
    expect(bacStalkAt(DISGUISE, 10, () => 0)).toBe(10 + DISGUISE.blendMin);
    expect(bacStalkAt(DISGUISE, 10, () => 0.999999)).toBeCloseTo(10 + DISGUISE.blendMax, 3);
  });

  test("goes by a default protester name nobody else uses", () => {
    const used = new Set(DEFAULT_NAMES.slice(1));
    expect(disguiseName(used, () => 0.7)).toBe(DEFAULT_NAMES[0]!);
    // Everyone took one: any default name will do.
    expect(DEFAULT_NAMES).toContain(disguiseName(new Set(DEFAULT_NAMES), () => 0.3));
  });
});

describe("BRAV-M (#13)", () => {
  test("charges a protester fast, brakes within dropRange and drops the passenger for that target", () => {
    const { host, run, addBike, events } = setup();
    const bike = addBike("bike", 0, 30);
    host.add("near", 0, 0);
    host.add("far", 25, 50);
    const t0 = host.now;
    expect(run(5, () => events.length > 0)).toBe(true);
    expect(events[0]).toEqual({ type: "drop", targetId: "near" });
    // About 26 m at 11 m/s: well under what a CRS needs.
    expect(host.now - t0).toBeLessThan(30 / BIKE.speed + 0.5);
    const gap = dist(bike.body, host.people.get("near")!.body) - BIKE.radius - PLAYER_RADIUS;
    expect(gap).toBeLessThanOrEqual(BIKE.dropRange + 1e-6);
    expect(gap).toBeGreaterThan(0);
    expect(bike.ride!.phase).toBe("wait");
    // Nobody was rammed on the way.
    expect(host.shoves).toHaveLength(0);
  });

  test("a protester in its way is knocked over, never ridden through", () => {
    const { host, run, addBike } = setup();
    // Riding off to its exit, down the street, with a protester standing in the way.
    const bike = addBike("bike", 0, 30);
    bike.ride!.phase = "leave";
    bike.ride!.phaseAt = 0;
    bike.ride!.exit.z = -40;
    const bystander = host.add("bystander", 0, 10);
    let closest = Infinity;
    run(2.5, undefined, () => {
      closest = Math.min(closest, dist(bike.body, bystander.body));
      // Never past them while they stand in the street (z decreasing towards the target).
      if (!isDown(bystander.body)) expect(bike.body.z).toBeGreaterThan(bystander.body.z);
    });
    expect(closest).toBeGreaterThanOrEqual(BIKE.radius + PLAYER_RADIUS - 0.02);
    expect(host.shoves.some((s) => s.id === "bystander" && s.floor && s.strength === BIKE.ramImpulse)).toBe(true);
    // A ram, not an arrest.
    expect(bystander.view.status).toBe(PlayerStatus.Free);
    expect(host.grabs).toHaveLength(0);
  });

  test("the swept test catches a protester crossed between two ticks", () => {
    const p = { id: "p", x: 0, z: 5, status: PlayerStatus.Free, down: false };
    const hit = sweepProtesters({ x: 0, z: 0 }, { x: 0, z: 10 }, 0.6, [p]);
    expect(hit?.protester.id).toBe("p");
    expect(hit!.t).toBeCloseTo((5 - 1) / 10, 6);
    // Grabbed (dragged) or arrested protesters have no body in the way.
    expect(sweepProtesters({ x: 0, z: 0 }, { x: 0, z: 10 }, 0.6, [{ ...p, status: PlayerStatus.Grabbed }])).toBeNull();
    // Touching but riding away: no contact.
    expect(sweepProtesters({ x: 0, z: 4.5 }, { x: 0, z: 0 }, 0.6, [p])).toBeNull();
  });

  test("at full speed it never passes through a wall: blocked, the duo gets off", () => {
    // A thin wall across the whole street between the bike and the protester.
    const wall: CollisionWorld = { bounds, boxes: [{ x: 0, z: 10, halfX: 40, halfZ: 0.5 }], circles: [] };
    const { host, run, addBike, events } = setup(wall);
    const bike = addBike("bike", 0, 30);
    host.add("p", 0, 0);
    let crossed = false;
    run(6, () => events.some((e) => e.type === "dismount"), () => {
      if (bike.body.z < 10 + 0.5 + BIKE.radius - 1e-3) crossed = true;
      expect(circleOverlaps(wall, bike.body.x, bike.body.z, BIKE.radius - 1e-3)).toBe(false);
    });
    expect(crossed).toBe(false);
    expect(events.map((e) => e.type)).toContain("dismount");
    // Blocked about blockedTime after reaching the wall.
    expect(events.filter((e) => e.type === "drop")).toHaveLength(0);
  });

  test("a passenger hunts until it swings, then walks back and gets on; the bike rides off and is gone at its exit", () => {
    const { host, run, ctx, bots, addBike, addRider, events } = setup();
    const bike = addBike("bike", 0, 30);
    host.add("p", 0, 0);
    expect(run(5, () => events.length > 0)).toBe(true);
    bike.mount = CrsMount.Solo;
    const passenger = addRider("pass", bike.body.x, bike.body.z - 1.2);
    passenger.bikeId = bike.id;
    passenger.missionUntil = ctx.now + BIKE.dropTime;
    passenger.targetId = "p";
    bike.ride!.passengerId = passenger.id;
    // Never grabs here: the job ends on the first swing.
    passenger.grabReadyAt = Infinity;
    expect(run(BIKE.dropTime, () => host.batonHits.length > 0)).toBe(true);
    expect(canRemount(passenger, bike, ctx.now)).toBe(false);
    expect(run(6, () => canRemount(passenger, bike, ctx.now))).toBe(true);
    remount(bike, ctx.now);
    bots.splice(bots.indexOf(passenger), 1);
    expect(bike.mount as CrsMount).toBe(CrsMount.Duo);
    expect(bike.ride!.phase).toBe("leave");
    expect(run(BIKE.leaveTimeout, () => events.some((e) => e.type === "gone"))).toBe(true);
    expect(bike.gone).toBe(true);
    expect(dist(bike.body, bike.ride!.exit)).toBeLessThanOrEqual(BIKE.exitReach);
  });

  test("the driver leaves alone when the passenger drags someone away", () => {
    const { host, run, ctx, addBike, addRider, events } = setup();
    const bike = addBike("bike", 0, 30);
    host.add("p", 0, 0);
    run(5, () => events.length > 0);
    bike.mount = CrsMount.Solo;
    const passenger = addRider("pass", 0, 0.5);
    passenger.bikeId = bike.id;
    passenger.missionUntil = ctx.now + BIKE.dropTime;
    bike.ride!.passengerId = passenger.id;
    passenger.status = CrsStatus.Grabbing;
    passenger.grabbedId = "p";
    stepBike(bike, ctx, host);
    expect(bike.ride!.phase).toBe("leave");
    expect(passenger.bikeId).toBeNull();
    expect(bike.mount).toBe(CrsMount.Solo);
  });

  test("knocked off: the driver tumbles down with its rider HP, the bike row is gone", () => {
    const { addBike, ctx } = setup();
    const bike = addBike("bike", 0, 0);
    expect(bike.hp).toBe(BIKE.hp);
    bike.hp = 0;
    bike.status = CrsStatus.Out;
    applyImpulse(bike.body, 1, 0, 14, "always");
    expect(leaveBike(bike, ctx.now, true)).toBe(true);
    expect(bike.mount).toBe(CrsMount.Foot);
    expect(bike.ride).toBeNull();
    expect(bike.status as CrsStatus).toBe(CrsStatus.Active);
    expect(bike.hp).toBe(BRAVM.maxHp);
    expect(isDown(bike.body)).toBe(true);
    // Stepping off when blocked: standing, no passenger left on a solo bike.
    const solo = addBike("solo", 5, 0);
    solo.mount = CrsMount.Solo;
    expect(leaveBike(solo, ctx.now, false)).toBe(false);
    expect(isDown(solo.body)).toBe(false);
  });

  test("a wreck slides with its knockback and stops, inside the street", () => {
    const { addRider, ctx } = setup();
    const w = addRider("w", 0, 0);
    w.mount = CrsMount.Wreck;
    w.status = CrsStatus.Out;
    applyImpulse(w.body, 0, 1, BIKE.wreckSkid, "never");
    for (let i = 0; i < 90; i++) stepWreck(ctx.world, w, TICK_DT);
    expect(w.body.z).toBeGreaterThan(1);
    expect(Math.hypot(w.body.vx, w.body.vz)).toBeLessThan(0.1);
  });

  test("bikeOf refuses a unit without a bike", () => {
    expect(() => bikeOf(createCrsBot("c", CrsKind.Crs, 0, 0))).toThrow();
  });
});
