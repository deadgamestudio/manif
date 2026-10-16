/**
 * Alexandre Bénanas (#123), the pure rules: whether and when he shows up,
 * where he comes in, whom he picks on, when he backs off, and his helmet
 * coming off under the protesters' hits. The server runs the event
 * (`apps/server/src/features/benanas/`) and lands his hits through the
 * room's usual knockdown path; clients draw him from his synced state.
 *
 *   round starts ──rolled (chance)──> arrival point picked in [earliest, latest]
 *   front passes it ──> Prowling (picks on lone protesters, backs off from groups)
 *     ├─ hit `hp` times ──> Unmasked (helmet off, a line, runs to a side street) ──> gone
 *     └─ duration ──> Leaving (walks to a side street) ──> gone
 *
 * He is no CRS: never in the squad, never seen by the bots in blue, never in
 * `state.players`. He arrests and grabs nobody, and counts for no CRS rule.
 */
import { progressAt, type Level } from "../level/index.js";
import type { Vec2 } from "../physics/index.js";
import { BENANAS, BENANAS_LINES, type BenanasLineKind } from "./constants.js";

/**
 * The start-of-round roll: the front progress at which he arrives this round,
 * or null when he doesn't come. One roll per round, so at most one visit.
 */
export function rollBenanas(random: () => number = Math.random, chance: number = BENANAS.chance): number | null {
  if (!(random() < chance)) return null;
  return BENANAS.earliest + (BENANAS.latest - BENANAS.earliest) * random();
}

/** Whether he arrives now: the front reached the rolled point `at`, and is not past BENANAS.latest. */
export function benanasDue(at: number | null, front: number): boolean {
  return at !== null && front >= at && front <= BENANAS.latest;
}

/** A protester as he sees them. */
export interface BenanasSeen extends Vec2 {
  readonly id: string;
  /** Free, on their feet, not held or flying: someone he may hit. The others still count as company. */
  readonly target: boolean;
}

/** How many of `people` (but `self`'s own id) stand within `radius` of `at`, centre to centre. */
export function countNear(at: Vec2, people: Iterable<BenanasSeen>, radius: number, skipId: string | null = null): number {
  let n = 0;
  const r2 = radius * radius;
  for (const p of people) {
    if (p.id === skipId) continue;
    const dx = p.x - at.x;
    const dz = p.z - at.z;
    if (dx * dx + dz * dz <= r2) n++;
  }
  return n;
}

/**
 * Whom he goes for: a protester he may hit, with at most BENANAS.loneMax
 * others within BENANAS.loneRadius, within BENANAS.sight, and not spared
 * (`spared(id)`: hit lately). The loneliest wins, then the closest (each
 * neighbour counts as BENANAS.crowdPenalty metres further). Null with nobody
 * fit: he waits for a chance.
 */
export function pickBenanasTarget(self: Vec2, people: readonly BenanasSeen[], spared: (id: string) => boolean = () => false): BenanasSeen | null {
  let best: BenanasSeen | null = null;
  let bestScore = Infinity;
  for (const p of people) {
    if (!p.target || spared(p.id)) continue;
    const d = Math.hypot(p.x - self.x, p.z - self.z);
    if (d > BENANAS.sight) continue;
    const company = countNear(p, people, BENANAS.loneRadius, p.id);
    if (company > BENANAS.loneMax) continue;
    const score = d + company * BENANAS.crowdPenalty;
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

/** Whether the cortège closes in on him: BENANAS.crowdCount protesters or more within BENANAS.crowdRadius. */
export function crowdedOut(self: Vec2, people: Iterable<BenanasSeen>): boolean {
  return countNear(self, people, BENANAS.crowdRadius) >= BENANAS.crowdCount;
}

/**
 * Where he backs off to: `distance` away from the middle of the protesters
 * around him (within BENANAS.crowdRadius * 2). With nobody around, or them
 * right on him, along `fallback` (a unit direction, e.g. towards the CRS line).
 */
export function backOffGoal(self: Vec2, people: Iterable<BenanasSeen>, distance: number, fallback: Vec2): Vec2 {
  let sx = 0;
  let sz = 0;
  let n = 0;
  const r = BENANAS.crowdRadius * 2;
  for (const p of people) {
    if (Math.hypot(p.x - self.x, p.z - self.z) > r) continue;
    sx += p.x;
    sz += p.z;
    n++;
  }
  let dx = fallback.x;
  let dz = fallback.z;
  if (n > 0) {
    const ax = self.x - sx / n;
    const az = self.z - sz / n;
    const d = Math.hypot(ax, az);
    if (d > 1e-3) {
      dx = ax / d;
      dz = az / d;
    }
  }
  return { x: self.x + dx * distance, z: self.z + dz * distance };
}

/** Whether `target` (radius `targetRadius`) is in reach of his punch. */
export function inPunchReach(self: Vec2, target: Vec2, targetRadius: number): boolean {
  return Math.hypot(target.x - self.x, target.z - self.z) - BENANAS.radius - targetRadius <= BENANAS.hitReach;
}

/** His helmet under the protesters' hits: hits left, and who landed one (they share the unmasking bonus). */
export interface Helmet {
  hp: number;
  readonly hitters: Set<string>;
}

export function freshHelmet(hp: number = BENANAS.hp): Helmet {
  return { hp, hitters: new Set() };
}

/**
 * Protester `by` lands a hit (a swing or a throw, one each). Mutates
 * `helmet`; true when this hit takes it off (only the once). Hits on a
 * helmet already off do nothing and credit nobody.
 */
export function hitHelmet(helmet: Helmet, by: string): boolean {
  if (helmet.hp <= 0) return false;
  helmet.hp -= 1;
  helmet.hitters.add(by);
  return helmet.hp <= 0;
}

/**
 * His way in: a side street door (see `truckBays`) ahead of the front,
 * behind the CRS line from the cortège's side: the closest one between
 * BENANAS.entryAheadMin and BENANAS.entryAheadMax ahead. With none, the
 * closest door behind the front; with none at all, `rear`.
 */
export function benanasEntry(level: Level, doors: readonly Vec2[], front: number, rear: Vec2): Vec2 {
  let ahead: Vec2 | null = null;
  let aheadT = Infinity;
  let behind: Vec2 | null = null;
  let behindT = -Infinity;
  for (const d of doors) {
    const t = progressAt(level, d.x, d.z);
    if (t >= front + BENANAS.entryAheadMin && t <= front + BENANAS.entryAheadMax) {
      if (t < aheadT) {
        aheadT = t;
        ahead = d;
      }
    } else if (t < front && t > behindT) {
      behindT = t;
      behind = d;
    }
  }
  const best = ahead ?? behind;
  return best ? { x: best.x, z: best.z } : { x: rear.x, z: rear.z };
}

/**
 * A line of `kind` for his bubble, as an index into BENANAS_LINES, avoiding
 * `previous` when the kind has another. -1 when the kind has none.
 */
export function pickBenanasLine(kind: BenanasLineKind, previous: number, random: () => number = Math.random): number {
  const pool: number[] = [];
  BENANAS_LINES.forEach((l, i) => {
    if (l.kind === kind && i !== previous) pool.push(i);
  });
  if (pool.length === 0) return BENANAS_LINES[previous]?.kind === kind ? previous : -1;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? -1;
}

/** The text of a synced line index, "" when out of range. */
export function benanasLineText(index: number): string {
  return BENANAS_LINES[index]?.text ?? "";
}
