/**
 * Rescuing a grabbed teammate (#10): hold interact next to them for
 * RESCUE_TIME and they are free.
 *
 * Rules:
 * - The server picks the target: the nearest grabbed protester within
 *   RESCUE_RANGE, never the rescuer themself. Once a rescue has a target it
 *   sticks to it while it stays valid, even if another grabbed teammate
 *   comes closer.
 * - Progress counts only while the rescuer holds interact, can act (free and
 *   not knocked down) and the target is still grabbed and in range. Anything
 *   else ends the rescue and its progress drops to 0. A rescuer who keeps
 *   holding starts again from 0 when a target is valid again.
 * - Each rescuer has their own progress; several rescuers on one teammate do
 *   not stack: the first to finish frees them, and the others' rescues end
 *   because the target is no longer grabbed.
 * - Order with the arrest: the room runs `stepRescues` at the top of its tick,
 *   before the health timers. A rescue finishing on the very tick the drag
 *   ends wins (see the tests).
 *
 * Pure: a `Rescuer` record per session, mutated in place like a `CrsBot`, and
 * lookups supplied by the caller. Nothing here knows about Schema or clocks.
 */
import { PlayerStatus } from "../health/index.js";
import type { Vec2 } from "../physics/index.js";
import { RESCUE_RANGE, RESCUE_TIME } from "./constants.js";

/** What a rescue needs to know about a protester. `ProtesterView` (crs) fits it. */
export interface RescueSubject extends Vec2 {
  readonly id: string;
  readonly status: number;
}

/** One protester's rescue state. Server-only. */
export interface Rescuer {
  /** Interact is held down (press sets it, release clears it). */
  holding: boolean;
  /** The grabbed teammate being pulled, or null. */
  targetId: string | null;
  /** Seconds held on that target, 0..RESCUE_TIME. */
  progress: number;
}

export function createRescuer(): Rescuer {
  return { holding: false, targetId: null, progress: 0 };
}

/** End the current rescue and drop its progress. Holding stays as it is. */
export function stopRescue(r: Rescuer): void {
  r.targetId = null;
  r.progress = 0;
}

/** Whether `rescuer` could pull `subject` right now: someone else, grabbed, and within `range`. */
export function canRescue(rescuer: RescueSubject, subject: RescueSubject, range = RESCUE_RANGE): boolean {
  if (subject.id === rescuer.id || subject.status !== PlayerStatus.Grabbed) return false;
  return (subject.x - rescuer.x) ** 2 + (subject.z - rescuer.z) ** 2 <= range * range;
}

/**
 * The teammate `rescuer` would pull: the nearest grabbed protester within
 * `range` other than themself. Ties go to the smaller id. Null if none.
 */
export function pickRescueTarget(rescuer: RescueSubject, subjects: Iterable<RescueSubject>, range = RESCUE_RANGE): string | null {
  let bestId: string | null = null;
  let bestD = Infinity;
  for (const s of subjects) {
    if (!canRescue(rescuer, s, range)) continue;
    const d = (s.x - rescuer.x) ** 2 + (s.z - rescuer.z) ** 2;
    if (d < bestD || (d === bestD && bestId !== null && s.id < bestId)) {
      bestD = d;
      bestId = s.id;
    }
  }
  return bestId;
}

/** Progress counts as complete within this of RESCUE_TIME, so float sums of dt don't cost a tick. */
const DONE_EPSILON = 1e-6;

/**
 * One tick of one rescuer (mutates `r`). `self` is the rescuer as seen this
 * tick (undefined if gone), `canAct` whether they are free and not knocked
 * down. Returns the id of the teammate freed this tick, or null; the caller
 * applies the release. A finished rescue ends (progress back to 0).
 */
export function stepRescuer(
  r: Rescuer,
  self: RescueSubject | undefined,
  canAct: boolean,
  lookup: (id: string) => RescueSubject | undefined,
  subjects: () => Iterable<RescueSubject>,
  dt: number,
  time = RESCUE_TIME,
  range = RESCUE_RANGE,
): string | null {
  if (!self || !r.holding || !canAct) {
    stopRescue(r);
    return null;
  }
  if (r.targetId !== null) {
    const target = lookup(r.targetId);
    if (!target || !canRescue(self, target, range)) stopRescue(r);
  }
  if (r.targetId === null) {
    r.targetId = pickRescueTarget(self, subjects(), range);
    if (r.targetId === null) return null;
  }
  r.progress = Math.min(time, r.progress + dt);
  if (r.progress < time - DONE_EPSILON) return null;
  const freed = r.targetId;
  stopRescue(r);
  return freed;
}

/**
 * One tick of every rescuer, in map order. `free(targetId, rescuerId)` applies
 * a finished rescue to the live state at once and returns whether it took, so
 * a later rescuer on the same teammate sees them free and stops (no stacking,
 * no double release). Returns the rescues that took, as [targetId, rescuerId].
 */
export function stepRescues(
  rescuers: ReadonlyMap<string, Rescuer>,
  lookup: (id: string) => RescueSubject | undefined,
  subjects: () => Iterable<RescueSubject>,
  canAct: (id: string) => boolean,
  dt: number,
  free: (targetId: string, rescuerId: string) => boolean,
): [string, string][] {
  const done: [string, string][] = [];
  for (const [id, r] of rescuers) {
    const freed = stepRescuer(r, lookup(id), canAct(id), lookup, subjects, dt);
    if (freed !== null && free(freed, id)) done.push([freed, id]);
  }
  return done;
}

/** The progress shown over a grabbed protester: the best of everyone pulling them, 0..1. */
export function rescueProgress(rescuers: Iterable<Rescuer>, targetId: string, time = RESCUE_TIME): number {
  let best = 0;
  for (const r of rescuers) if (r.targetId === targetId && r.progress > best) best = r.progress;
  return Math.min(1, best / time);
}
