/**
 * The water jet (#17): a cone of water from a nozzle. Built for the
 * pompiers' hose and meant to be reused as is by the CRS water cannon (#13):
 * a bigger `WaterJetStats`, the same functions.
 *
 * What a jet does each tick (the room applies it, see the pompier feature):
 * - a burning prop it reaches gets `soakRate * dt` water (`JetSoak`), and
 *   goes out at FIRE_SOAK;
 * - a burning body in it is put out at once;
 * - every other body in it (protester or CRS) is pushed along the jet, once
 *   per `pushInterval` (`JetPushes`). The push goes through the normal
 *   knockback (#2), so a body pushed into a wall slides along it and never
 *   ends up inside it.
 *
 * Water does not go through walls: callers check line of sight from the
 * nozzle (see `hasLineOfSight`). Pure functions over plain data.
 */
import type { Vec2 } from "../physics/index.js";
import { closestPoint, segmentEntry } from "../melee/index.js";
import type { PropShape } from "../prop/index.js";
import { FIRE_SOAK, type WaterJetStats } from "./constants.js";

const EPS = 1e-6;

/** A jet this tick: where the water leaves the nozzle, and its unit direction. */
export interface WaterJet extends Vec2 {
  dirX: number;
  dirZ: number;
}

/**
 * The jet from `from` aimed at `to`. When the two points are the same, it
 * keeps the facing `rotation` (0 faces +Z, like every body's rotation).
 */
export function aimJet(from: Vec2, to: Vec2, rotation = 0): WaterJet {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d < EPS) return { x: from.x, z: from.z, dirX: Math.sin(rotation), dirZ: Math.cos(rotation) };
  return { x: from.x, z: from.z, dirX: dx / d, dirZ: dz / d };
}

/**
 * Whether a circle of radius `r` at (x, z) is in the jet: some of it is
 * within `range` of the nozzle and inside the cone (its centre's angle off
 * the jet's axis, minus the angle the circle covers, is at most `halfAngle`).
 * A circle around the nozzle itself counts.
 */
export function inJet(jet: WaterJet, stats: WaterJetStats, x: number, z: number, r: number): boolean {
  const dx = x - jet.x;
  const dz = z - jet.z;
  const d = Math.hypot(dx, dz);
  if (!Number.isFinite(d) || d - r > stats.range + EPS) return false;
  if (d <= r + EPS) return true;
  const cos = (dx * jet.dirX + dz * jet.dirZ) / d;
  const off = Math.acos(Math.max(-1, Math.min(1, cos)));
  return off <= stats.halfAngle + Math.asin(Math.min(1, r / d)) + EPS;
}

/**
 * Where the jet first touches a prop's shape (a burning bin or car), or null
 * if it misses: the shape's nearest point when that is in the cone, else
 * where the jet's axis enters the shape within range (a long car seen at an
 * angle). Check line of sight to the returned point.
 */
export function jetContact(jet: WaterJet, stats: WaterJetStats, shape: PropShape): Vec2 | null {
  const near = closestPoint(shape, jet);
  if (inJet(jet, stats, near.x, near.z, 0)) return near;
  const end = { x: jet.x + jet.dirX * stats.range, z: jet.z + jet.dirZ * stats.range };
  const t = segmentEntry(jet, end, shape);
  if (t === null) return null;
  return { x: jet.x + (end.x - jet.x) * t, z: jet.z + (end.z - jet.z) * t };
}

/** Which way the jet pushes a body at (x, z): away from the nozzle, or along the jet for a body right on it. */
export function jetPush(jet: WaterJet, x: number, z: number): Vec2 {
  const dx = x - jet.x;
  const dz = z - jet.z;
  const d = Math.hypot(dx, dz);
  if (d < EPS) return { x: jet.dirX, z: jet.dirZ };
  return { x: dx / d, z: dz / d };
}

/** Water poured on each burning prop so far, by prop id. Forgotten when the fire goes out. */
export class JetSoak {
  private readonly soak = new Map<string, number>();

  /** Pour `amount` on fire `id`. True when it has had FIRE_SOAK (put it out then; this forgets it). */
  pour(id: string, amount: number, needed = FIRE_SOAK): boolean {
    const total = (this.soak.get(id) ?? 0) + Math.max(0, amount);
    if (total + EPS >= needed) {
      this.soak.delete(id);
      return true;
    }
    this.soak.set(id, total);
    return false;
  }

  /** Water fire `id` has had so far. */
  get(id: string): number {
    return this.soak.get(id) ?? 0;
  }

  /** Fire `id` went out some other way (burnt out, another jet). */
  forget(id: string): void {
    this.soak.delete(id);
  }

  /** Keep only the fires in `burning`. */
  keep(burning: (id: string) => boolean): void {
    for (const id of this.soak.keys()) if (!burning(id)) this.soak.delete(id);
  }

  clear(): void {
    this.soak.clear();
  }
}

/**
 * When each body was last pushed by a jet, so one standing in the water is
 * pushed once per `pushInterval`, not every tick. Shared by every jet of a
 * room: two hoses on one body do not push it twice as often.
 */
export class JetPushes {
  private readonly last = new Map<string, number>();

  /** True (and remembers `now`) when body `id` may be pushed again. */
  tryPush(id: string, now: number, interval: number): boolean {
    const at = this.last.get(id);
    if (at !== undefined && now - at < interval - EPS) return false;
    this.last.set(id, now);
    return true;
  }

  remove(id: string): void {
    this.last.delete(id);
  }

  clear(): void {
    this.last.clear();
  }
}
