/**
 * The CRS LBD on the server (#73): the unit cap, what stops a ball on the
 * real street, and the "hit then grabbed" count the issue asks to measure.
 */
import { describe, expect, test } from "bun:test";
import { MapSchema } from "@colyseus/schema";
import { CRS_STATS, CrsKind, MAX_CRS, MAX_LBD, STREET_LEVEL, TICK_DT, propCollisionWorld, type BallBody } from "@manif/shared";
import { GRAB_AFTER_HIT_WINDOW, GRAB_SOON_AFTER_HIT_WINDOW, LbdShots } from "./lbd.js";
import { Crs } from "./schema.js";
import { CrsSquad } from "./squad.js";

const LBD = CRS_STATS[CrsKind.Lbd].lbd!;
const MID = { x: 0, z: 40 };

function squad() {
  const views = new MapSchema<Crs>();
  const world = propCollisionWorld(STREET_LEVEL, () => false);
  return { squad: new CrsSquad(STREET_LEVEL, world, views), views, world };
}

describe("CRS LBD in the squad (#73)", () => {
  test("at most MAX_LBD on the street at once, and they count towards MAX_CRS", () => {
    const { squad: s, views } = squad();
    const spawned = [];
    for (let i = 0; i < MAX_LBD + 2; i++) spawned.push(s.spawnLbd(-4 + i * 2, MID.z));
    expect(spawned.filter((b) => b !== null)).toHaveLength(MAX_LBD);
    expect(views.get(spawned[0]!.id)?.kind).toBe(CrsKind.Lbd);
    while (s.size < MAX_CRS) s.spawn(-6 + (s.size % 6) * 2, MID.z + 10 + Math.floor(s.size / 6) * 2);
    expect(s.size).toBe(MAX_CRS);
  });

  test("shotBlockers: a formed shield line is as wide as its shields; the aim is synced as the protester's id", () => {
    const { squad: s, views } = squad();
    const line = s.spawnLine(0, MID.z + 10, 3);
    expect(line).not.toBeNull();
    const lone = s.spawn(5, MID.z);
    line!.formed = true;
    const blockers = s.shotBlockers([] as BallBody[]);
    const member = blockers.find((b) => b.id === line!.members[0]!.id);
    expect(member?.r).toBeGreaterThan(CRS_STATS[CrsKind.Crs].radius);
    expect(blockers.find((b) => b.id === lone!.id)?.r).toBe(CRS_STATS[CrsKind.Crs].radius);
    const lbd = s.spawnLbd(0, MID.z - 10)!;
    (s.get(lbd.id) as { aimId: string | null }).aimId = "p1";
    s.syncViews();
    expect(views.get(lbd.id)?.aim).toBe("p1");
    s.forget("p1");
    s.syncViews();
    expect(views.get(lbd.id)?.aim).toBe("");
  });
});

describe("LbdShots (#73)", () => {
  test("a ball flies, hits the first protester in line, and is gone", () => {
    const { world } = squad();
    const shots = new LbdShots();
    shots.fire("crs-1", { x: 0, z: MID.z }, 0, 1, LBD);
    const stops: string[] = [];
    for (let i = 0; i < 60 && shots.flying > 0; i++) {
      shots.step(TICK_DT, world, [], [{ id: "p", x: 0, z: MID.z + 12, r: 0.4 }], (_b, res) => stops.push(res.type === "hit" ? res.id : res.type));
    }
    expect(stops).toEqual(["p"]);
    expect(shots.shots).toBe(1);
    expect(shots.hits).toBe(1);
  });

  test("counts a grab after a hit in its window, once per hit", () => {
    const shots = new LbdShots();
    shots.noteHit("a", 10);
    shots.noteHit("b", 10);
    shots.noteHit("c", 10);
    expect(shots.noteGrab("a", 10 + GRAB_AFTER_HIT_WINDOW - 0.1)).toBe(true);
    expect(shots.noteGrab("a", 10 + GRAB_AFTER_HIT_WINDOW - 0.05)).toBe(false);
    expect(shots.noteGrab("b", 10 + GRAB_AFTER_HIT_WINDOW + 0.1)).toBe(true);
    expect(shots.noteGrab("c", 10 + GRAB_SOON_AFTER_HIT_WINDOW + 0.1)).toBe(false);
    expect(shots.noteGrab("d", 10)).toBe(false);
    expect(shots.grabsAfterHit).toBe(1);
    expect(shots.grabsSoonAfterHit).toBe(2);
    shots.clear();
    expect(shots.summary()).toBeNull();
  });
});
