/**
 * Archetype rules (#14) as plain functions: the stats an id stands for (with
 * the fallback), when a pick is allowed, and what the modifiers and auras do
 * to the numbers the systems use. The server applies them; nothing here knows
 * about Schema or the room.
 */
import { Phase } from "../round/constants.js";
import type { Vec2 } from "../physics/collision.js";
import { ARCHETYPE_IDS, ARCHETYPES, AURA_RADIUS, DEFAULT_ARCHETYPE, type Archetype, type ArchetypeStats } from "./constants.js";

/** A valid archetype id, or DEFAULT_ARCHETYPE for anything else (unknown number, string, NaN, missing). */
export function archetypeOf(id: unknown): Archetype {
  return (ARCHETYPE_IDS as readonly unknown[]).includes(id) ? (id as Archetype) : DEFAULT_ARCHETYPE;
}

/** The modifiers of archetype `id` (the default's for an unknown id). */
export function archetypeStats(id: unknown): ArchetypeStats {
  return ARCHETYPES[archetypeOf(id)].stats;
}

/** A pick is taken only in the lobby (`waiting`); during a march and on the end screen it is locked. */
export function canPickArchetype(phase: number): boolean {
  return phase === Phase.Waiting;
}

/** Damage to a prop from a hit worth `amount`, by a protester with `factor` (`propDamage`): rounded, at least 1. */
export function propDamageOf(amount: number, factor: number): number {
  return Math.max(1, Math.round(amount * factor));
}

/**
 * The aim actually thrown (#8): `dir` (a unit vector) turned by up to
 * `spread` radians either side. `random` is in [0, 1); 0.5 throws straight.
 * Zero spread returns `dir` itself.
 */
export function spreadAim(dir: Vec2, spread: number, random: number): Vec2 {
  if (!(spread > 0)) return dir;
  const a = (random * 2 - 1) * spread;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: dir.x * c + dir.z * s, z: -dir.x * s + dir.z * c };
}

/** A protester as the auras see it. */
export interface AuraSubject extends Vec2 {
  id: string;
  /** Its archetype's stats. */
  stats: ArchetypeStats;
}

function inAura(a: Vec2, b: Vec2): boolean {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2 <= AURA_RADIUS * AURA_RADIUS;
}

/**
 * HP per second healed into `target` by the heal auras around it (the CGT's
 * merguez and sound system). Auras do not stack: two CGT side by side heal
 * like one, at the best rate in reach. A healer never heals itself. The
 * caller passes only healers that are free (the target's own state is its call).
 */
export function healRate(target: AuraSubject, healers: Iterable<AuraSubject>): number {
  let best = 0;
  for (const h of healers) {
    if (h.id === target.id || h.stats.healAura <= best) continue;
    if (inAura(h, target)) best = h.stats.healAura;
  }
  return best;
}

/**
 * The factor on the drag time of a protester grabbed at `target`: the
 * strongest filming aura in reach (the bobo's phone), the grabbed protester's
 * own included. Auras do not stack. 1 with none.
 */
export function filmFactor(target: Vec2, filmers: Iterable<AuraSubject>): number {
  let best = 1;
  for (const f of filmers) {
    if (f.stats.filmAura > best && inAura(f, target)) best = f.stats.filmAura;
  }
  return best;
}

/** Whole HP to heal this tick from `rate` HP/s over `dt`, carrying the fraction in `carry`. */
export function stepHeal(carry: number, rate: number, dt: number): { heal: number; carry: number } {
  if (!(rate > 0) || !(dt > 0)) return { heal: 0, carry: 0 };
  const total = carry + rate * dt;
  // A hair of slack so float sums of dt don't cost a tick.
  const heal = Math.floor(total + 1e-9);
  return { heal, carry: Math.max(0, total - heal) };
}
