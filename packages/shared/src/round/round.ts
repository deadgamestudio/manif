/**
 * The march round (#12) as plain functions of (state, time): the phase
 * machine, progress, win and lose, and the reinforcement schedule. The room
 * owns one `Round` and applies what these return; nothing here touches Schema.
 */
import { PlayerStatus } from "../health/index.js";
import type { Level } from "../level/index.js";
import { inRect, progressAt, spawnPoint } from "../level/index.js";
import type { CollisionWorld, Vec2 } from "../physics/index.js";
import { circleOverlaps, resolveCircle } from "../physics/index.js";
import {
  Phase,
  ROUND_DURATION,
  ROUND_END_DURATION,
  RoundResult,
  UNIT_STAGES,
  WAVE_CHASER_AHEAD,
  WAVE_LINE_AHEAD,
  WIN_SHARE,
  WIPE_MIN_PLAYERS,
  type RoundWave,
  type UnitStage,
} from "./constants.js";

/** What the round rules need to know about one protester. */
export interface RoundProtester {
  x: number;
  z: number;
  /** A `PlayerStatus`. */
  status: number;
  /**
   * A bot protester (#59). Bots are crowd, not the team: the front, the win
   * and the wipe look at humans only (see `humansOf`).
   */
  bot?: boolean;
}

/** The human protesters (#59): what the front, the win threshold, the arrivals and the wipe count. */
export function humansOf<T extends RoundProtester>(protesters: Iterable<T>): T[] {
  const out: T[] = [];
  for (const p of protesters) if (!p.bot) out.push(p);
  return out;
}

/**
 * Where the cortège's front is: the progress of the free human protester
 * furthest down the street, 0..1. Bots (#59) don't count, so they can't drag
 * the waves forward on their own. Null when no human is free (the caller keeps the last value).
 */
export function frontProgress(level: Level, protesters: Iterable<RoundProtester>): number | null {
  let best: number | null = null;
  for (const p of protesters) {
    if (p.status !== PlayerStatus.Free || p.bot) continue;
    const t = progressAt(level, p.x, p.z);
    if (best === null || t > best) best = t;
  }
  return best;
}

/** How many protesters must stand in the Préfecture zone to win, from the players in the room right now. 0 with nobody. */
export function winThreshold(players: number): number {
  if (players <= 0) return 0;
  return Math.max(1, Math.ceil(players * WIN_SHARE));
}

/** Free protesters inside the Préfecture zone. Grabbed, KO'd and arrested ones don't count. */
export function arrivedCount(level: Level, protesters: Iterable<RoundProtester>): number {
  let n = 0;
  for (const p of protesters) if (p.status === PlayerStatus.Free && inRect(level.destination, p.x, p.z)) n++;
  return n;
}

/** True when there is at least one protester and every one of them is arrested. */
export function allArrested(protesters: Iterable<RoundProtester>): boolean {
  let any = false;
  for (const p of protesters) {
    if (p.status !== PlayerStatus.Arrested) return false;
    any = true;
  }
  return any;
}

/**
 * Has the round been decided? Checked in this order, so a tie goes to the
 * protesters: the win (enough of them in the zone), then the wipe (everyone
 * arrested, from WIPE_MIN_PLAYERS protesters up), then the timer. `None`
 * while the march goes on.
 *
 * Bots (#59) are left out of all of it: the threshold is half the humans,
 * only humans arriving count, and the wipe is every human arrested, whatever
 * the bots are doing.
 */
export function roundOutcome(level: Level, all: readonly RoundProtester[], timeLeft: number): RoundResult {
  const protesters = humansOf(all);
  const need = winThreshold(protesters.length);
  if (need > 0 && arrivedCount(level, protesters) >= need) return RoundResult.Won;
  if (protesters.length >= WIPE_MIN_PLAYERS && allArrested(protesters)) return RoundResult.LostArrested;
  if (timeLeft <= 0) return RoundResult.LostTime;
  return RoundResult.None;
}

/** The round's own state, server-side. Phase, whole seconds and result are mirrored into Schema. */
export interface Round {
  phase: Phase;
  /** Seconds left: of the march while `Marching`, of the end screen while `Ended`. 0 while `Waiting`. */
  timeLeft: number;
  result: RoundResult;
  /** Seconds the last (or current) march has lasted. */
  elapsed: number;
  /** One flag per wave in the schedule: fired this round. */
  fired: boolean[];
}

export function createRound(): Round {
  return { phase: Phase.Waiting, timeLeft: 0, result: RoundResult.None, elapsed: 0, fired: [] };
}

/** Waiting -> Marching: the timer starts, no wave has fired. False (no change) from any other phase. */
export function startRound(round: Round, duration = ROUND_DURATION): boolean {
  if (round.phase !== Phase.Waiting) return false;
  round.phase = Phase.Marching;
  round.timeLeft = duration;
  round.result = RoundResult.None;
  round.elapsed = 0;
  round.fired = [];
  return true;
}

/** What a step changed: the march just ended (show results), or the end screen is over (reset the street). */
export type RoundEvent = "ended" | "reset" | null;

/**
 * Advance the round by `dt` seconds. While marching, the timer runs and
 * `outcome` (given the time left) decides whether the round is over; it is
 * called every tick, after the timer moved. While ended, the end screen counts
 * down and then the round goes back to `Waiting`, keeping its result for the lobby.
 */
export function stepRound(
  round: Round,
  dt: number,
  outcome: (timeLeft: number) => RoundResult,
  endDuration = ROUND_END_DURATION,
): RoundEvent {
  if (round.phase === Phase.Marching) {
    round.timeLeft = Math.max(0, round.timeLeft - dt);
    round.elapsed += dt;
    const result = outcome(round.timeLeft);
    if (result === RoundResult.None) return null;
    round.phase = Phase.Ended;
    round.result = result;
    round.timeLeft = endDuration;
    return "ended";
  }
  if (round.phase === Phase.Ended) {
    round.timeLeft -= dt;
    if (round.timeLeft > 0) return null;
    round.phase = Phase.Waiting;
    round.timeLeft = 0;
    return "reset";
  }
  return null;
}

/**
 * The waves due at this progress, in schedule order, marked as fired so each
 * fires once per round. Several can be due on the same tick (a sprint, or the
 * opening wave at 0).
 */
export function wavesDue(waves: readonly RoundWave[], fired: boolean[], progress: number): RoundWave[] {
  const due: RoundWave[] = [];
  waves.forEach((wave, i) => {
    if (fired[i] || progress < wave.at) return;
    fired[i] = true;
    due.push(wave);
  });
  return due;
}

/**
 * Where a wave's `count` chasers appear: the level's CRS points at least
 * `ahead` past the front, nearest first, skipping those within `clearance` of a
 * protester. Past the last point ahead, any point clear of protesters will do
 * (side streets behind the front), and at worst the one furthest from them.
 * More bots than points: a second lap shifts each one sideways so they don't stack.
 */
export function waveChaserPoints(
  level: Level,
  front: number,
  count: number,
  protesters: readonly Vec2[],
  clearance: number,
  ahead = WAVE_CHASER_AHEAD,
): Vec2[] {
  if (count <= 0 || level.crsSpawns.length === 0) return [];
  const nearest = (pt: Vec2) => protesters.reduce((d, p) => Math.min(d, Math.hypot(p.x - pt.x, p.z - pt.z)), Infinity);
  const scored = level.crsSpawns.map((pt) => ({ pt, t: progressAt(level, pt.x, pt.z), d: nearest(pt) }));
  const clear = scored.filter((s) => s.d >= clearance);
  let pool = clear.filter((s) => s.t >= front + ahead).sort((a, b) => a.t - b.t);
  if (pool.length === 0) pool = clear.sort((a, b) => b.t - a.t);
  if (pool.length === 0) pool = [...scored].sort((a, b) => b.d - a.d).slice(0, 1);
  const out: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const p = pool[i % pool.length]!.pt;
    const lap = Math.floor(i / pool.length);
    out.push({ x: p.x - Math.sign(p.x || 1) * lap * 1.2, z: p.z });
  }
  return out;
}

/** Where a wave's shield line forms: the level's nearest line point at least `ahead` past the front. Null if none. */
export function waveLinePoint(level: Level, front: number, ahead = WAVE_LINE_AHEAD): Vec2 | null {
  let best: Vec2 | null = null;
  let bestT = Infinity;
  for (const pt of level.lineSpawns) {
    const t = progressAt(level, pt.x, pt.z);
    if (t >= front + ahead && t < bestT) {
      bestT = t;
      best = pt;
    }
  }
  return best;
}

/**
 * A spawn point in the start zone that is also clear of `world`, the room's
 * collision world with its props as they stand (a reset puts every prop back
 * whole, possibly where someone stood). `spawnPoint` alone knows only the
 * static level.
 */
export function clearSpawnPoint(level: Level, world: CollisionWorld, radius: number, random: () => number = Math.random): Vec2 {
  let p = spawnPoint(level, radius, random);
  for (let attempt = 0; attempt < 16; attempt++) {
    const res = resolveCircle(world, p.x, p.z, radius);
    if (!circleOverlaps(world, res.x, res.z, radius)) return { x: res.x, z: res.z };
    p = spawnPoint(level, radius, random);
  }
  const res = resolveCircle(world, p.x, p.z, radius);
  return { x: res.x, z: res.z };
}

/** The synced countdown: whole seconds, rounded up so it shows 1 until the very end. */
export function syncedSeconds(timeLeft: number): number {
  return Math.min(65535, Math.max(0, Math.ceil(timeLeft - 1e-9)));
}

/** The synced progress bar: 0..100. */
export function syncedProgress(progress: number): number {
  return Math.max(0, Math.min(100, Math.round(progress * 100)));
}

/** The unit stage (#13) for a wave firing at `progress`: the last row of `stages` whose `from` is at most it. */
export function unitStageAt(progress: number, stages: readonly UnitStage[] = UNIT_STAGES): UnitStage {
  let stage: UnitStage = { from: 0, bac: 0, bravm: 0, lbd: 0 };
  for (const s of stages) if (s.from <= progress && s.from >= stage.from) stage = s;
  return stage;
}
