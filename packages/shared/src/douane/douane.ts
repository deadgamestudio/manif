/**
 * La Douane (#120), the pure rules (when he shows up is `cameo/`, #132): who he
 * soaks, where he stands, when the water gun fires and what he says. The
 * server runs the event (`apps/server/src/features/douane/`) and applies the
 * jet with the shared `water/` functions; clients draw him and his jet from
 * his synced state.
 *
 *   each minute of march ──rolled (chance, see `cameoArrives`, #132)──> he comes, once a round
 *   ──> Soaking (bursts and pauses, duration) ──> Leaving (to a side street) ──> gone
 *
 * Nobody can touch him: he is not a player (never in `state.players`) and
 * not a CRS target, so no baton, grab, punch or throw ever reaches him. He
 * counts for neither the win, the wipe, the bot fill nor the scores.
 */
import { progressAt, type Level } from "../level/index.js";
import type { Vec2 } from "../physics/index.js";
import { DOUANE, DOUANE_LINES, type DouaneLineKind } from "./constants.js";

/** Someone he might soak: a free protester or a CRS on their feet. The caller filters out the rest. */
export interface DouaneSeen extends Vec2 {
  readonly id: string;
}

/**
 * Who he soaks: the closest of `bodies`, protester or CRS alike. He keeps
 * `currentId` while it is still there, unless another is DOUANE.switchMargin
 * closer (no flicking between two). Null with nobody.
 */
export function pickDouaneTarget(self: Vec2, bodies: Iterable<DouaneSeen>, currentId: string | null, margin: number = DOUANE.switchMargin): DouaneSeen | null {
  let best: DouaneSeen | null = null;
  let bestD = Infinity;
  let current: DouaneSeen | null = null;
  let currentD = Infinity;
  for (const b of bodies) {
    const d = Math.hypot(b.x - self.x, b.z - self.z);
    if (b.id === currentId) {
      current = b;
      currentD = d;
    }
    if (d < bestD) {
      best = b;
      bestD = d;
    }
  }
  if (current && currentD <= bestD + margin) return current;
  return best;
}

/**
 * Where he walks to soak `target`: DOUANE.standOff short of it on the line
 * from him, so the water reaches and he doesn't stand on anyone. Already
 * closer than that: where he is.
 */
export function douaneGoal(self: Vec2, target: Vec2, standOff: number = DOUANE.standOff): Vec2 {
  const dx = self.x - target.x;
  const dz = self.z - target.z;
  const d = Math.hypot(dx, dz);
  if (d <= standOff) return { x: self.x, z: self.z };
  return { x: target.x + (dx / d) * standOff, z: target.z + (dz / d) * standOff };
}

/** The water gun's rhythm: firing until `until`, or resting until `until`. */
export interface SprayClock {
  on: boolean;
  until: number;
}

/** A gun that has not fired yet: ready at once. */
export function freshSprayClock(now = 0): SprayClock {
  return { on: false, until: now };
}

/**
 * The water gun, once a tick. `ready`: a target in reach and in sight. A
 * burst lasts DOUANE.burst, then a pause of DOUANE.pause, then the next burst
 * as soon as he is ready. Losing the target mid-burst ends the burst there
 * (the pause follows all the same). Mutates and returns `clock`; true in
 * `.on` means water this tick.
 */
export function stepSprayClock(clock: SprayClock, now: number, ready: boolean, burst: number = DOUANE.burst, pause: number = DOUANE.pause): SprayClock {
  if (clock.on) {
    if (now >= clock.until || !ready) {
      clock.on = false;
      clock.until = now + pause;
    }
  } else if (ready && now >= clock.until) {
    clock.on = true;
    clock.until = now + burst;
  }
  return clock;
}

/**
 * His way in: the side street door (see `truckBays`) closest behind the
 * front, no further back than DOUANE.entryBehindMax; with none, `rear`.
 */
export function douaneEntry(level: Level, doors: readonly Vec2[], front: number, rear: Vec2): Vec2 {
  let best: Vec2 | null = null;
  let bestT = -Infinity;
  for (const d of doors) {
    const t = progressAt(level, d.x, d.z);
    if (t > front - DOUANE.behindFront || t < front - DOUANE.entryBehindMax) continue;
    if (t > bestT) {
      bestT = t;
      best = d;
    }
  }
  return best ? { x: best.x, z: best.z } : { x: rear.x, z: rear.z };
}

/** His way out: the nearest side street door, or `fallback` with none. */
export function douaneExit(doors: readonly Vec2[], at: Vec2, fallback: Vec2): Vec2 {
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (const d of doors) {
    const dist = Math.hypot(d.x - at.x, d.z - at.z);
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best ? { x: best.x, z: best.z } : { x: fallback.x, z: fallback.z };
}

/**
 * A line of `kind` for his bubble, as an index into DOUANE_LINES, avoiding
 * `previous` when the kind has another. -1 when the kind has none.
 */
export function pickDouaneLine(kind: DouaneLineKind, previous: number, random: () => number = Math.random): number {
  const pool: number[] = [];
  DOUANE_LINES.forEach((l, i) => {
    if (l.kind === kind && i !== previous) pool.push(i);
  });
  if (pool.length === 0) return DOUANE_LINES[previous]?.kind === kind ? previous : -1;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? -1;
}

/** The text of a synced line index, "" when out of range. */
export function douaneLineText(index: number): string {
  return DOUANE_LINES[index]?.text ?? "";
}
