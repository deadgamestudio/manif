/**
 * The squad's bookkeeping for the unit types (#13): the bot cap across every
 * type, the BAC's reveal on a hit, the bike's passenger, crash and wreck.
 */
import { describe, expect, test } from "bun:test";
import { MapSchema } from "@colyseus/schema";
import {
  CRS_STATS,
  CrsKind,
  CrsMount,
  CrsStatus,
  HEAVY_IMPULSE,
  LINE_REGROUP_AHEAD,
  MAX_CRS,
  PlayerStatus,
  STREET_LEVEL,
  TICK_DT,
  levelVans,
  progressAt,
  propCollisionWorld,
  type CrsHost,
  type ProtesterView,
} from "@manif/shared";
import { Crs } from "./schema.js";
import { CrsSquad } from "./squad.js";

const LEVEL = STREET_LEVEL;
const BIKE = CRS_STATS[CrsKind.BravM].bike!;

/** A street in the middle of the level, away from the start zone. */
const MID = { x: 0, z: 40 };

function setup() {
  const views = new MapSchema<Crs>();
  const world = propCollisionWorld(LEVEL, () => false);
  const impulses: string[] = [];
  const hits: string[] = [];
  const squad = new CrsSquad(LEVEL, world, views, undefined, (id) => impulses.push(id));
  const people = new Map<string, ProtesterView>();
  const host: CrsHost = {
    protesters: () => people.values(),
    protester: (id) => people.get(id),
    canBeHurt: () => true,
    batonHit: (_by, id) => {
      hits.push(id);
    },
    grab: (id) => {
      const p = people.get(id);
      if (!p || p.status !== PlayerStatus.Free) return false;
      p.status = PlayerStatus.Grabbed;
      return true;
    },
    release: (id) => {
      const p = people.get(id);
      if (p) p.status = PlayerStatus.Free;
    },
    arrest: (id) => {
      const p = people.get(id);
      if (p) p.status = PlayerStatus.Arrested;
    },
    drag: () => {},
    shove: () => {},
  };
  let now = 0;
  const step = (seconds: number, each?: () => void) => {
    for (let t = 0; t < seconds; t += TICK_DT) {
      now += TICK_DT;
      squad.step(now, TICK_DT, host, () => Array.from(people.values()));
      each?.();
    }
  };
  return { squad, views, people, host, step, impulses, hits, now: () => now };
}

describe("CrsSquad unit types (#13)", () => {
  test("the cap holds across every type: riders, passengers and wrecks included", () => {
    const { squad, views, people, step } = setup();
    people.set("p", { id: "p", x: MID.x, z: MID.z, status: PlayerStatus.Free, down: false });
    let i = 0;
    while (squad.size < MAX_CRS) {
      const kind = i % 3;
      const x = -6 + (i % 6) * 2;
      const z = MID.z + 20 + Math.floor(i / 6) * 2;
      if (kind === 0) squad.spawn(x, z);
      else if (kind === 1) squad.spawnBac(x, z, "Dédé", 0);
      else squad.spawnBravm(x, z);
      i++;
    }
    expect(squad.size).toBe(MAX_CRS);
    expect(squad.spawn(0, MID.z)).toBeNull();
    expect(squad.spawnBac(0, MID.z, "x")).toBeNull();
    expect(squad.spawnBravm(0, MID.z)).toBeNull();
    // Bikes reach the protester and try to drop passengers, others crash: never over the cap.
    let max = 0;
    step(4, () => {
      max = Math.max(max, squad.size, views.size);
    });
    for (const bot of squad.all) if (bot.mount !== CrsMount.Foot) squad.strike(bot.id, 1, 0, 0, HEAVY_IMPULSE, 0, 4);
    step(4, () => {
      max = Math.max(max, squad.size, views.size);
    });
    expect(max).toBeLessThanOrEqual(MAX_CRS);
  });

  test("a disguised BAC is a bot with a protester's name, revealed by the first hit", () => {
    const { squad, views } = setup();
    const bac = squad.spawnBac(MID.x, MID.z, "Gérard du 93", 30)!;
    const view = views.get(bac.id)!;
    expect(view.kind).toBe(CrsKind.Bac);
    expect(view.revealed).toBe(false);
    expect(view.name).toBe("Gérard du 93");
    const res = squad.hit(bac.id, MID.x + 1, MID.z, 1, 0.1);
    expect(res).not.toBeNull();
    expect(view.revealed).toBe(true);
    expect(squad.get(bac.id)!.revealed).toBe(true);
    // The other units are never disguised.
    const crs = squad.spawn(MID.x + 3, MID.z)!;
    expect(views.get(crs.id)!.revealed).toBe(true);
  });

  test("a splat, a stun, a push or a burn reveals it too", () => {
    const { squad, views } = setup();
    const a = squad.spawnBac(MID.x, MID.z, "a", 30)!;
    const b = squad.spawnBac(MID.x + 2, MID.z, "b", 30)!;
    const c = squad.spawnBac(MID.x + 4, MID.z, "c", 30)!;
    const d = squad.spawnBac(MID.x + 6, MID.z, "d", 30)!;
    squad.affect(a.id, "splat", 2, 0.1);
    squad.stun(b.id, 0.1, 1);
    squad.push(c.id, 1, 0, 3);
    squad.burn(d.id, 1, 0.1);
    for (const bot of [a, b, c, d]) expect(views.get(bot.id)!.revealed).toBe(true);
  });

  test("a heavy hit knocks both riders off: the driver and the passenger tumble, the empty bike skids away", () => {
    const { squad, views, impulses } = setup();
    const bike = squad.spawnBravm(MID.x, MID.z)!;
    expect(views.get(bike.id)!.mount).toBe(CrsMount.Duo);
    expect(squad.size).toBe(1);
    const res = squad.strike(bike.id, 1, 0, 2, HEAVY_IMPULSE, 1.5, 0.1);
    expect(res).not.toBeNull();
    expect(res!.out).toBe(false);
    expect(views.get(bike.id)!.mount).toBe(CrsMount.Foot);
    expect(views.get(bike.id)!.down).toBe(true);
    expect(squad.size).toBe(3);
    const others = squad.all.filter((b) => b.id !== bike.id);
    const passenger = others.find((b) => b.mount === CrsMount.Foot)!;
    const wreck = others.find((b) => b.mount === CrsMount.Wreck)!;
    expect(passenger.kind).toBe(CrsKind.BravM);
    expect(views.get(passenger.id)!.down).toBe(true);
    expect(wreck.status).toBe(CrsStatus.Out);
    expect(Math.hypot(wreck.body.vx, wreck.body.vz)).toBeGreaterThan(0);
    expect(impulses).toContain(passenger.id);
    expect(impulses).toContain(wreck.id);
  });

  test("a light hit does not: three quick ones in a row do", () => {
    const { squad, views } = setup();
    const bike = squad.spawnBravm(MID.x, MID.z)!;
    squad.hit(bike.id, MID.x + 1, MID.z, 1, 0.1);
    expect(views.get(bike.id)!.mount).toBe(CrsMount.Duo);
    squad.hit(bike.id, MID.x + 1, MID.z, 1, 0.4);
    squad.hit(bike.id, MID.x + 1, MID.z, 1, 0.7);
    expect(views.get(bike.id)!.mount).toBe(CrsMount.Foot);
  });

  test("riding, a BRAV-M shrugs off the stink; on foot it does not", () => {
    const { squad } = setup();
    const bike = squad.spawnBravm(MID.x, MID.z)!;
    expect(squad.affect(bike.id, "stink", 3, 0.1)).toBe(false);
    expect(squad.affect(bike.id, "splat", 3, 0.1)).toBe(true);
    squad.strike(bike.id, 1, 0, 0, HEAVY_IMPULSE, 0, 0.2);
    expect(squad.affect(bike.id, "stink", 3, 0.3)).toBe(true);
  });

  test("the bike drops its passenger by the protester; the passenger hits them and they ride off together", () => {
    const { squad, views, people, step, hits } = setup();
    people.set("p", { id: "p", x: MID.x, z: MID.z, status: PlayerStatus.Free, down: false });
    const bike = squad.spawnBravm(MID.x, MID.z + 25)!;
    let droppedAt: { x: number; z: number } | null = null;
    let remounted = false;
    step(10, () => {
      const mount = views.get(bike.id)?.mount;
      if (!droppedAt && mount === CrsMount.Solo) droppedAt = { x: bike.body.x, z: bike.body.z };
      if (droppedAt && mount === CrsMount.Duo && squad.size === 1) remounted = true;
    });
    expect(droppedAt).not.toBeNull();
    const at = droppedAt!;
    expect(Math.hypot(at.x - MID.x, at.z - MID.z)).toBeLessThan(BIKE.radius + 0.4 + BIKE.dropRange + 0.05);
    // Hit and run: one baton swing, no grab (the fake host never floors them), back on the bike...
    expect(hits).toContain("p");
    expect(people.get("p")!.status).toBe(PlayerStatus.Free);
    expect(remounted).toBe(true);
    // ...then it rode back to where it came from and left the street.
    expect(squad.size).toBe(0);
    expect(views.size).toBe(0);
  });
});

describe("CrsSquad grabs (#70)", () => {
  test("the wind-up is synced as the tell, then the drag's van is known for the protester", () => {
    const { squad, views, people, step } = setup();
    const bot = squad.spawn(MID.x, MID.z)!;
    const stats = CRS_STATS[CrsKind.Crs];
    // A weakened protester leaning on the bot.
    people.set("p", { id: "p", x: MID.x, z: MID.z + stats.radius + 0.4 + 0.1, status: PlayerStatus.Free, down: false, hp: 30 });
    let sawTell = false;
    step(stats.grabWindup + 0.3, () => {
      if (views.get(bot.id)?.windup) sawTell = true;
    });
    expect(sawTell).toBe(true);
    expect(views.get(bot.id)!.windup).toBe(false);
    expect(views.get(bot.id)!.status).toBe(CrsStatus.Grabbing);
    // The nearest van to the middle of the street (z 40) is van-4 (z 48 to 53).
    const van = squad.dragVanOf("p");
    expect(van).toBeGreaterThanOrEqual(0);
    expect(levelVans(LEVEL)[van]!.id).toBe("van-4");
    expect(squad.dragVanOf("nobody")).toBe(-1);
  });

  test("a protester leaving mid wind-up: the bot just stops", () => {
    const { squad, views, people, step } = setup();
    const bot = squad.spawn(MID.x, MID.z)!;
    const stats = CRS_STATS[CrsKind.Crs];
    people.set("p", { id: "p", x: MID.x, z: MID.z + stats.radius + 0.5, status: PlayerStatus.Free, down: false, hp: 10 });
    step(2 * TICK_DT);
    expect(views.get(bot.id)!.windup).toBe(true);
    people.delete("p");
    squad.forget("p");
    step(TICK_DT);
    expect(views.get(bot.id)!.windup).toBe(false);
    expect(squad.get(bot.id)!.status).toBe(CrsStatus.Active);
  });
});

describe("CrsSquad and #131", () => {
  test("throwOff: the CRS a protester struggled free from is floored on the wire and dazed", () => {
    const { squad, views, now } = setup();
    const bot = squad.spawn(MID.x, MID.z)!;
    const res = squad.throwOff(bot.id, 1, 0, now());
    expect(res?.knockedDown).toBe(true);
    expect(views.get(bot.id)?.down).toBe(true);
    expect(views.get(bot.id)?.status).toBe(CrsStatus.Stunned);
    expect(squad.throwOff("nobody", 1, 0, now())).toBeNull();
  });

  test("a line broken on the street regroups ahead of the front and forms again, synced as a formation", () => {
    const { squad, views, people, step } = setup();
    people.set("p", { id: "p", x: 0, z: 74, status: PlayerStatus.Free, down: false });
    const line = squad.spawnLine(0, 54)!;
    // The front where the protester stands, as the room computes it.
    squad.setFront(progressAt(LEVEL, 0, 74));
    expect(squad.breakLines(0)).toBe(1);
    step(0.1);
    expect(views.get(line.members[0]!.id)?.formation).toBe(false);
    let formedAt = -1;
    let formedZ = Infinity;
    let t = 0;
    step(45, () => {
      t += TICK_DT;
      if (formedAt < 0 && line.formed) {
        formedAt = t;
        formedZ = line.centre.z;
      }
    });
    expect(formedAt).toBeGreaterThan(0);
    // Formed ahead of the front; it may then advance towards the protester like any line.
    expect(formedZ).toBeLessThanOrEqual(74 - LINE_REGROUP_AHEAD + 1e-6);
    expect(views.get(line.members[0]!.id)?.formation).toBe(true);
  });
});
