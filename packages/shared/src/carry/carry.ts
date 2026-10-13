/**
 * Grabbing and throwing teammates (#11). Pure rules over plain data; the
 * server owns the pairs and the flights, and syncs `carriedBy` on the carried
 * player so clients draw the pose.
 *
 * - Pick up: interact next to a free teammate (no consent step: a game among
 *   friends). Both must be free, standing, and in no other carry; the carrier
 *   empty-handed (a pavé in hand: no pick-up). A grabbed teammate is a rescue
 *   (#10), a burning one is patted out (#16): never a pick-up.
 * - Interact priority, one rule for the server and the client hints
 *   (`pickInteract`): rescue, pat out, pick up an item, pick up a teammate,
 *   light a prop. An item comes before a teammate: a pavé is a small spot you
 *   walk onto on purpose, while a teammate is nearly always within reach in a
 *   cortège, so reaching for a pavé never lifts a friend by mistake.
 * - Messages are handled one at a time: two players picking each other up on
 *   the same tick, the first wins and the second finds a carried teammate
 *   (who can no longer act) and gets nothing. Never A carries B carries A.
 * - Drop (`carryDropReason`): after CARRY_DURATION, or as soon as the carrier
 *   is hit, grabbed, knocked down, KO'd or gone, or the carried player is no
 *   longer free. The dropped teammate stumbles off with a small push.
 * - Throw: the carrier's throw input (#8 aim) launches the teammate as a
 *   knocked-down body in the air (`launchBody`); it hits CRS and props it
 *   flies into (`flightContacts`).
 */
import { PlayerStatus } from "../health/index.js";
import { segmentEntry } from "../melee/index.js";
import type { Vec2 } from "../physics/index.js";
import type { PropShape } from "../prop/index.js";
import { ThrowableKind, aimDirection, type ProjectileTarget } from "../throwable/index.js";
import type { FireAction } from "../fire/index.js";
import {
  CARRY_DURATION,
  CARRY_RANGE,
  TEAMMATE_FLIGHT_TIME,
  TEAMMATE_HIT_MARGIN,
  TEAMMATE_LAND_DOWN,
  TEAMMATE_THROW_SPEED,
} from "./constants.js";

/** A protester as the carry rules see them. */
export interface CarrySubject extends Vec2 {
  readonly id: string;
  readonly status: number;
  /** Knocked down (#2), a throw's flight included. */
  readonly down: boolean;
  readonly onFire: boolean;
  /** The item in hand (#8), `ThrowableKind.None` when empty-handed. */
  readonly item: number;
  /** Carried by someone right now. */
  readonly carried: boolean;
  /** Carrying someone right now. */
  readonly carrying: boolean;
}

/** In no carry, free and standing. */
function available(p: CarrySubject): boolean {
  return p.status === PlayerStatus.Free && !p.down && !p.carried && !p.carrying;
}

/** Whether `self` may pick a teammate up at all: free, standing, empty-handed and in no carry. */
export function canCarry(self: CarrySubject): boolean {
  return available(self) && self.item === ThrowableKind.None;
}

/**
 * Whether `self` could pick up `other` right now: someone else, free,
 * standing, not burning, in no carry, and within `range`; `self` must be able
 * to carry (`canCarry`).
 */
export function canPickUpTeammate(self: CarrySubject, other: CarrySubject, range = CARRY_RANGE): boolean {
  if (other.id === self.id || !canCarry(self) || !available(other) || other.onFire) return false;
  return (other.x - self.x) ** 2 + (other.z - self.z) ** 2 <= range * range;
}

/** The teammate `self` would pick up: the nearest one `canPickUpTeammate` allows. Ties go to the smaller id. Null if none. */
export function pickCarryTarget(self: CarrySubject, others: Iterable<CarrySubject>, range = CARRY_RANGE): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const o of others) {
    if (!canPickUpTeammate(self, o, range)) continue;
    const d = (o.x - self.x) ** 2 + (o.z - self.z) ** 2;
    if (d < bestD || (d === bestD && best !== null && o.id < best)) {
      bestD = d;
      best = o.id;
    }
  }
  return best;
}

/** What each interact meaning would target right now (computed by the caller with each feature's own rule). */
export interface InteractCandidates {
  /** Already carrying a teammate: interact puts them down, nothing else. */
  carryingTeammate: boolean;
  /** `pickRescueTarget` (#10). */
  rescue: string | null;
  /** `pickFireAction` (#16): pat out a burning teammate or light a prop. */
  fire: FireAction | null;
  /** `pickCarryTarget`. */
  teammate: string | null;
  /** The nearest item in reach (#8), empty-handed only. */
  item: string | null;
}

export type InteractChoice =
  | { kind: "putDown" }
  | { kind: "rescue"; target: string }
  | { kind: "putOut"; target: string }
  | { kind: "carry"; target: string }
  | { kind: "pickUp"; target: string }
  | { kind: "light"; target: string };

/**
 * What interact does, by priority: a carrier puts their teammate down; else
 * rescue a grabbed teammate (a hold), pat out a burning one (a hold), pick up
 * an item (the press), pick up a free teammate (the press), light a prop
 * (a hold). Null when nothing is in reach.
 */
export function pickInteract(c: InteractCandidates): InteractChoice | null {
  if (c.carryingTeammate) return { kind: "putDown" };
  if (c.rescue !== null) return { kind: "rescue", target: c.rescue };
  if (c.fire?.kind === "putOut") return { kind: "putOut", target: c.fire.target };
  if (c.item !== null) return { kind: "pickUp", target: c.item };
  if (c.teammate !== null) return { kind: "carry", target: c.teammate };
  if (c.fire?.kind === "light") return { kind: "light", target: c.fire.target };
  return null;
}

/** What `carryDropReason` needs of each side. `undefined` means gone (disconnected). */
export interface CarrySide {
  readonly status: number;
  readonly down: boolean;
}

export type CarryDropReason = "gone" | "carrier" | "carried" | "timeout";

/**
 * Whether a carry ends now, and why: either player gone; the carrier no longer
 * free or knocked down (hit, grabbed, KO); the carried player no longer free
 * (KO from gas or fire); or held for CARRY_DURATION. Null: it goes on. A hit
 * that does not floor still drops: the room checks that when it pushes a body.
 */
export function carryDropReason(
  carrier: CarrySide | undefined,
  carried: CarrySide | undefined,
  elapsed: number,
  duration = CARRY_DURATION,
): CarryDropReason | null {
  if (!carrier || !carried) return "gone";
  if (carrier.status !== PlayerStatus.Free || carrier.down) return "carrier";
  if (carried.status !== PlayerStatus.Free) return "carried";
  if (elapsed >= duration - 1e-9) return "timeout";
  return null;
}

/** A unit direction from a random number in [0, 1): where a dropped teammate stumbles off to. */
export function dropDirection(random: number): Vec2 {
  const a = (Number.isFinite(random) ? random : 0) * Math.PI * 2;
  return { x: Math.sin(a), z: Math.cos(a) };
}

/** How a teammate is thrown: along a unit direction, how fast, how long in the air, how long down after. */
export interface TeammateLaunch {
  dirX: number;
  dirZ: number;
  speed: number;
  flight: number;
  down: number;
}

/**
 * The throw from the client's aim (the same `{x, z}` as a pavé, #8):
 * re-normalized, along the carrier's facing when the aim is zero or invalid,
 * at TEAMMATE_THROW_SPEED with TEAMMATE_FLIGHT_TIME in the air.
 */
export function teammateLaunch(aimX: number, aimZ: number, rotation: number): TeammateLaunch {
  const dir = aimDirection(aimX, aimZ, rotation);
  return { dirX: dir.x, dirZ: dir.z, speed: TEAMMATE_THROW_SPEED, flight: TEAMMATE_FLIGHT_TIME, down: TEAMMATE_LAND_DOWN };
}

/**
 * What a flying teammate of radius `radius` touched moving from `a` to `b`
 * this tick: every target whose shape, grown by `radius` + `margin`, the
 * segment enters (or starts in), nearest first. The body itself is collided
 * by the step (it bounces off walls and solid props); this only says what it hit.
 */
export function flightContacts<K extends string>(
  a: Vec2,
  b: Vec2,
  radius: number,
  targets: Iterable<ProjectileTarget<K>>,
  margin = TEAMMATE_HIT_MARGIN,
): ProjectileTarget<K>[] {
  const r = radius + margin;
  const hits: { t: number; target: ProjectileTarget<K> }[] = [];
  for (const target of targets) {
    const s = target.shape;
    const grown: PropShape =
      s.type === "box"
        ? { type: "box", x: s.x, z: s.z, halfX: s.halfX + r, halfZ: s.halfZ + r }
        : { type: "circle", x: s.x, z: s.z, r: s.r + r };
    const t = segmentEntry(a, b, grown);
    if (t !== null) hits.push({ t, target });
  }
  hits.sort((p, q) => p.t - q.t);
  return hits.map((h) => h.target);
}
