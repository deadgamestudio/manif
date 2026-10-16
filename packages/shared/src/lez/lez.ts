/**
 * Le Z (#133), the pure rules (when he shows up is `cameo/`, #132): where he
 * stands, what his ring does to the CRS, whom the CRS go for while he is
 * here, and what he says. The server runs the event
 * (`apps/server/src/features/lez/`); clients draw him and his ring from his
 * synced state.
 *
 *   each minute of march ──rolled (chance, see `cameoArrives`, #132)──> he comes, once a round
 *   ──> Holding (behind the CRS: ring on, profiling on)
 *     ├─ hit `hp` times ──> Chased (a line, runs to a side street) ──> gone
 *     └─ duration ──> Leaving (walks to a side street) ──> gone
 *
 * He is no CRS: never in the squad, never a target of theirs, never in
 * `state.players`. He fights nobody; the protesters can hit him (Bénanas's
 * hit counter, `freshHelmet` / `hitHelmet`).
 */
import { Archetype } from "../archetype/index.js";
import type { CrsRally } from "../crs/index.js";
import { progressAt, type Level } from "../level/index.js";
import type { Vec2 } from "../physics/index.js";
import { LEZ, LEZ_LINES, LeZPhase, type LeZLineKind } from "./constants.js";

/** Whether his ring is on in `phase` (only while he holds forth). */
export function leZAuraOn(phase: LeZPhase | null): boolean {
  return phase === LeZPhase.Holding;
}

/** Whether the CRS profile while he is in `phase` (null: not on the street): holding forth or walking off, not once chased. */
export function leZProfilingOn(phase: LeZPhase | null): boolean {
  return phase === LeZPhase.Holding || phase === LeZPhase.Leaving;
}

/** His ring as the CRS brain reads it (`CrsContext.rally`), centred on `at`. Writes into `out` (reused), returns it. */
export function leZRally(at: Vec2, out: CrsRally = { x: 0, z: 0, radius: 0, speedFactor: 1, grabFactor: 1 }): CrsRally {
  out.x = at.x;
  out.z = at.z;
  out.radius = LEZ.auraRadius;
  out.speedFactor = LEZ.speedFactor;
  out.grabFactor = LEZ.grabFactor;
  return out;
}

/**
 * The factor on a protester's CRS target priority (#14's `targetWeight`)
 * while he is around: LEZ.profiling for a "Mec de cité", human or bot, 1 for
 * everyone else and whenever `active` is false. It multiplies the rest (the
 * archetype's weight, a bot's).
 */
export function leZProfiling(archetype: number, active: boolean): number {
  return active && archetype === Archetype.Cite ? LEZ.profiling : 1;
}

/** The point on the street's axis at progress `t`. */
function along(level: Level, t: number): Vec2 {
  const { from, to } = level.progress;
  return { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
}

/**
 * Where he stands: LEZ.behindCrs behind the CRS facing the cortège (down the
 * street, away from it), behind the middle of those CRS within LEZ.crsBand
 * ahead of the `front` (or just behind it). With none there, on the street's
 * axis LEZ.aheadOfFront ahead of the front. Never on the cortège's side of
 * the front. The room clears it of walls.
 */
export function leZPost(level: Level, crs: readonly Vec2[], front: number): Vec2 {
  let sx = 0;
  let sz = 0;
  let n = 0;
  for (const c of crs) {
    const t = progressAt(level, c.x, c.z);
    if (t < front - 0.02 || t > front + LEZ.crsBand) continue;
    sx += c.x;
    sz += c.z;
    n++;
  }
  const { from, to } = level.progress;
  const len = Math.hypot(to.x - from.x, to.z - from.z) || 1;
  const ax = (to.x - from.x) / len;
  const az = (to.z - from.z) / len;
  if (n === 0) return along(level, Math.min(1, front + LEZ.aheadOfFront));
  const p = { x: sx / n + ax * LEZ.behindCrs, z: sz / n + az * LEZ.behindCrs };
  const t = progressAt(level, p.x, p.z);
  if (t >= front) return p;
  // Pulled forward along the axis, same side of the street.
  const a = along(level, t);
  const b = along(level, front);
  return { x: p.x - a.x + b.x, z: p.z - a.z + b.z };
}

/**
 * A line of `kind` for his bubble, as an index into LEZ_LINES, avoiding
 * `previous` when the kind has another. -1 when the kind has none.
 */
export function pickLeZLine(kind: LeZLineKind, previous: number, random: () => number = Math.random): number {
  const pool: number[] = [];
  LEZ_LINES.forEach((l, i) => {
    if (l.kind === kind && i !== previous) pool.push(i);
  });
  if (pool.length === 0) return LEZ_LINES[previous]?.kind === kind ? previous : -1;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? -1;
}

/** The text of a synced line index, "" when out of range. */
export function leZLineText(index: number): string {
  return LEZ_LINES[index]?.text ?? "";
}
