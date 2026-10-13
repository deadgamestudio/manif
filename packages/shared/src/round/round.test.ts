import { describe, expect, test } from "bun:test";
import { PlayerStatus } from "../health/index.js";
import { STREET_LEVEL as L, inRect, progressAt, type Level } from "../level/index.js";
import { circleOverlaps, type CollisionWorld } from "../physics/index.js";
import { PLAYER_RADIUS } from "../player/index.js";
import { CRS_SPAWN_CLEARANCE, MAX_CRS } from "../crs/index.js";
import { propCollisionWorld } from "../prop/index.js";
import { TICK_DT } from "../net/index.js";
import { Phase, ROUND_DURATION, ROUND_END_DURATION, ROUND_WAVES, RoundResult, WAVE_LINE_AHEAD } from "./constants.js";
import {
  allArrested,
  arrivedCount,
  clearSpawnPoint,
  createRound,
  frontProgress,
  roundOutcome,
  startRound,
  stepRound,
  syncedProgress,
  syncedSeconds,
  waveChaserPoints,
  waveLinePoint,
  wavesDue,
  winThreshold,
  type RoundProtester,
} from "./round.js";

/** Small seeded generator so spawn tests are repeatable. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A point in the middle of the street at progress t. */
function at(t: number, status: PlayerStatus = PlayerStatus.Free): RoundProtester {
  const { from, to } = L.progress;
  return { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t, status };
}
const inZone = (status: PlayerStatus = PlayerStatus.Free): RoundProtester => ({
  x: (L.destination.minX + L.destination.maxX) / 2,
  z: (L.destination.minZ + L.destination.maxZ) / 2,
  status,
});

describe("progress", () => {
  test("is the free protester furthest down the street", () => {
    expect(frontProgress(L, [at(0.1), at(0.4), at(0.25)])).toBeCloseTo(0.4, 5);
  });

  test("ignores grabbed, KO'd and arrested protesters", () => {
    const p = frontProgress(L, [at(0.1), at(0.9, PlayerStatus.Grabbed), at(0.8, PlayerStatus.Ko), at(0.7, PlayerStatus.Arrested)]);
    expect(p).toBeCloseTo(0.1, 5);
  });

  test("is null when nobody is free", () => {
    expect(frontProgress(L, [at(0.5, PlayerStatus.Arrested)])).toBeNull();
    expect(frontProgress(L, [])).toBeNull();
  });

  test("the synced bar is 0..100", () => {
    expect(syncedProgress(0)).toBe(0);
    expect(syncedProgress(0.456)).toBe(46);
    expect(syncedProgress(1.2)).toBe(100);
  });
});

describe("win threshold", () => {
  test("half of the players in the room, rounded up", () => {
    expect([0, 1, 2, 3, 4, 5, 8].map(winThreshold)).toEqual([0, 1, 1, 2, 2, 3, 4]);
  });

  test("is recomputed from the players present: a join raises it, a leave lowers it", () => {
    const players = [inZone(), at(0.5)];
    expect(roundOutcome(L, players, 100)).toBe(RoundResult.Won); // 1 of 2
    players.push(at(0.3)); // a late joiner at the rear
    expect(roundOutcome(L, players, 100)).toBe(RoundResult.None); // 1 of 3 is not enough
    players.push(inZone());
    expect(roundOutcome(L, players, 100)).toBe(RoundResult.Won); // 2 of 4
    players.splice(3, 1); // the second one in the zone leaves
    expect(roundOutcome(L, players, 100)).toBe(RoundResult.None); // 1 of 3
    players.splice(2, 1); // the late joiner leaves
    expect(roundOutcome(L, players, 100)).toBe(RoundResult.Won); // 1 of 2
  });

  test("only free protesters in the zone count", () => {
    expect(arrivedCount(L, [inZone(), inZone(PlayerStatus.Grabbed), inZone(PlayerStatus.Ko), at(0.99)])).toBe(1);
    expect(inRect(L.destination, at(0.99).x, at(0.99).z)).toBe(false);
  });
});

describe("round outcome", () => {
  test("nothing decided mid-march", () => {
    expect(roundOutcome(L, [at(0.2), at(0.3, PlayerStatus.Arrested)], 200)).toBe(RoundResult.None);
  });

  test("the timer running out loses", () => {
    expect(roundOutcome(L, [at(0.2)], 0)).toBe(RoundResult.LostTime);
  });

  test("everyone arrested at once loses; one still free (or only grabbed) does not", () => {
    expect(roundOutcome(L, [at(0.2, PlayerStatus.Arrested), at(0.5, PlayerStatus.Arrested)], 100)).toBe(RoundResult.LostArrested);
    expect(roundOutcome(L, [at(0.2, PlayerStatus.Arrested), at(0.5, PlayerStatus.Grabbed)], 100)).toBe(RoundResult.None);
    expect(allArrested([])).toBe(false);
  });

  test("alone, an arrest does not end the round: only the timer does", () => {
    expect(roundOutcome(L, [at(0.5, PlayerStatus.Arrested)], 100)).toBe(RoundResult.None);
    expect(roundOutcome(L, [at(0.5, PlayerStatus.Arrested)], 0)).toBe(RoundResult.LostTime);
  });

  test("win and lose on the same tick: the win comes first", () => {
    // Time is up as the deciding protester enters the zone.
    expect(roundOutcome(L, [inZone(), at(0.9)], 0)).toBe(RoundResult.Won);
    // Wipe and timeout on the same tick: the wipe is reported.
    expect(roundOutcome(L, [at(0.5, PlayerStatus.Arrested), at(0.4, PlayerStatus.Arrested)], 0)).toBe(RoundResult.LostArrested);
  });

  test("an empty room is never won", () => {
    expect(roundOutcome(L, [], 100)).toBe(RoundResult.None);
  });
});

describe("phase machine (fake clock)", () => {
  const run = (round: ReturnType<typeof createRound>, seconds: number, outcome: (t: number) => RoundResult) => {
    const events: string[] = [];
    for (let t = 0; t < seconds - 1e-9; t += TICK_DT) {
      const e = stepRound(round, TICK_DT, outcome);
      if (e) events.push(e);
    }
    return events;
  };

  test("starts in waiting; nothing moves until the start", () => {
    const r = createRound();
    expect(r.phase).toBe(Phase.Waiting);
    expect(run(r, 5, () => RoundResult.Won)).toEqual([]);
    expect(r.phase).toBe(Phase.Waiting);
  });

  test("start only from waiting", () => {
    const r = createRound();
    expect(startRound(r)).toBe(true);
    expect(r.phase).toBe(Phase.Marching);
    expect(r.timeLeft).toBe(ROUND_DURATION);
    expect(startRound(r)).toBe(false);
  });

  test("marching -> ended -> waiting on a timeout, with the result kept for the lobby", () => {
    const r = createRound();
    startRound(r, 3);
    const events = run(r, 3 + ROUND_END_DURATION + 0.5, (t) => (t <= 0 ? RoundResult.LostTime : RoundResult.None));
    expect(events).toEqual(["ended", "reset"]);
    expect(r.phase).toBe(Phase.Waiting);
    expect(r.result).toBe(RoundResult.LostTime);
    expect(r.elapsed).toBeCloseTo(3, 1);
  });

  test("the end screen lasts ROUND_END_DURATION", () => {
    const r = createRound();
    startRound(r);
    expect(stepRound(r, TICK_DT, () => RoundResult.Won)).toBe("ended");
    expect(r.phase).toBe(Phase.Ended);
    expect(run(r, ROUND_END_DURATION - 0.1, () => RoundResult.None)).toEqual([]);
    expect(r.phase).toBe(Phase.Ended);
    expect(run(r, 0.2, () => RoundResult.None)).toEqual(["reset"]);
  });

  test("the outcome is not asked once ended, and a second round starts clean", () => {
    const r = createRound();
    startRound(r);
    wavesDue(ROUND_WAVES, r.fired, 1);
    stepRound(r, TICK_DT, () => RoundResult.Won);
    let asked = 0;
    run(r, ROUND_END_DURATION + 0.5, () => {
      asked++;
      return RoundResult.LostTime;
    });
    expect(asked).toBe(0);
    expect(startRound(r)).toBe(true);
    expect(r).toEqual({ phase: Phase.Marching, timeLeft: ROUND_DURATION, result: RoundResult.None, elapsed: 0, fired: [] });
  });

  test("the synced countdown is whole seconds, rounded up", () => {
    expect(syncedSeconds(480)).toBe(480);
    expect(syncedSeconds(479.01)).toBe(480);
    expect(syncedSeconds(0.01)).toBe(1);
    expect(syncedSeconds(0)).toBe(0);
    expect(syncedSeconds(-3)).toBe(0);
  });
});

describe("reinforcement schedule", () => {
  test("is sorted, starts with the opening force at 0, and stays under the cap", () => {
    expect(ROUND_WAVES[0]!.at).toBe(0);
    for (let i = 1; i < ROUND_WAVES.length; i++) expect(ROUND_WAVES[i]!.at).toBeGreaterThan(ROUND_WAVES[i - 1]!.at);
    for (const w of ROUND_WAVES) {
      expect(w.at).toBeLessThan(1);
      expect((w.chasers ?? 0) + (w.line ?? 0)).toBeLessThanOrEqual(MAX_CRS);
    }
  });

  test("each wave fires once, when its threshold is crossed", () => {
    const fired: boolean[] = [];
    expect(wavesDue(ROUND_WAVES, fired, 0)).toEqual([ROUND_WAVES[0]!]);
    expect(wavesDue(ROUND_WAVES, fired, 0)).toEqual([]);
    const second = ROUND_WAVES[1]!.at;
    expect(wavesDue(ROUND_WAVES, fired, second - 0.01)).toEqual([]);
    expect(wavesDue(ROUND_WAVES, fired, second)).toEqual([ROUND_WAVES[1]!]);
    // Pushed back down the street, then forward again: no repeat.
    expect(wavesDue(ROUND_WAVES, fired, second / 2)).toEqual([]);
    expect(wavesDue(ROUND_WAVES, fired, second + 0.01)).toEqual([]);
  });

  test("a sprint past several thresholds fires them all on one tick, in order", () => {
    const fired: boolean[] = [];
    wavesDue(ROUND_WAVES, fired, 0);
    const due = wavesDue(ROUND_WAVES, fired, 0.6);
    expect(due.map((w) => w.at)).toEqual(ROUND_WAVES.filter((w) => w.at > 0 && w.at <= 0.6).map((w) => w.at));
    expect(wavesDue(ROUND_WAVES, fired, 1)).toHaveLength(ROUND_WAVES.filter((w) => w.at > 0.6).length);
    expect(wavesDue(ROUND_WAVES, fired, 1)).toEqual([]);
  });

  test("chasers appear ahead of the front, clear of protesters", () => {
    const front = 0.3;
    const people = [at(front)];
    const pts = waveChaserPoints(L, front, 4, people, CRS_SPAWN_CLEARANCE);
    expect(pts).toHaveLength(4);
    for (const p of pts) {
      expect(progressAt(L, p.x, p.z)).toBeGreaterThan(front);
      expect(Math.hypot(p.x - people[0]!.x, p.z - people[0]!.z)).toBeGreaterThanOrEqual(CRS_SPAWN_CLEARANCE);
    }
    // Nearest ahead first.
    const ts = pts.map((p) => progressAt(L, p.x, p.z));
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
  });

  test("the opening wave's chasers are spread over distinct points near the start", () => {
    const n = ROUND_WAVES[0]!.chasers ?? 0;
    const pts = waveChaserPoints(L, 0, n, [], CRS_SPAWN_CLEARANCE);
    expect(new Set(pts.map((p) => `${p.x},${p.z}`)).size).toBe(n);
    for (const p of pts) expect(inRect(L.start, p.x, p.z)).toBe(false);
  });

  test("past the last point ahead, chasers still spawn somewhere clear", () => {
    const pts = waveChaserPoints(L, 0.97, 3, [at(0.97)], CRS_SPAWN_CLEARANCE);
    expect(pts).toHaveLength(3);
  });

  test("more chasers than points: a second lap does not stack them", () => {
    const tiny: Level = { ...L, crsSpawns: [{ x: 5, z: 0 }] };
    const pts = waveChaserPoints(tiny, 0, 2, [], CRS_SPAWN_CLEARANCE);
    expect(pts[0]).not.toEqual(pts[1]);
  });

  test("a wave's line forms on the nearest line point far enough ahead, or nowhere", () => {
    const first = waveLinePoint(L, 0);
    expect(first).toEqual(L.lineSpawns[0]!);
    const later = waveLinePoint(L, 0.4);
    expect(later).not.toBeNull();
    expect(progressAt(L, later!.x, later!.z)).toBeGreaterThanOrEqual(0.4 + WAVE_LINE_AHEAD);
    expect(waveLinePoint(L, 0.95)).toBeNull();
  });
});

describe("reset puts nobody inside a prop", () => {
  const radius = PLAYER_RADIUS;

  test("start spots are clear of every prop standing whole", () => {
    const world = propCollisionWorld(L, () => false);
    const rand = mulberry32(12);
    for (let i = 0; i < 500; i++) {
      const p = clearSpawnPoint(L, world, radius, rand);
      expect(circleOverlaps(world, p.x, p.z, radius)).toBe(false);
      expect(inRect(L.start, p.x, p.z)).toBe(true);
    }
  });

  test("a prop put back in the start zone pushes the spot out of it", () => {
    // A level with a car parked right in the start zone: spawnPoint alone would put people in it.
    const s = L.start;
    const car = { id: "test-car", kind: "car" as const, x: (s.minX + s.maxX) / 2, z: (s.minZ + s.maxZ) / 2, rotation: 0 };
    const level: Level = { ...L, propSlots: [...L.propSlots, car] };
    const world: CollisionWorld = propCollisionWorld(level, () => false);
    const rand = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const p = clearSpawnPoint(level, world, radius, rand);
      expect(circleOverlaps(world, p.x, p.z, radius)).toBe(false);
    }
  });
});
