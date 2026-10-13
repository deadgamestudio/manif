/**
 * The fire brigade (#17): the decisions, as plain functions over plain data
 * so they are unit tested; the server's pompier feature runs them every tick
 * and applies the effects.
 *
 *   a prop burns ──arriveDelay──> a truck drives in from the nearest side street
 *     and parks behind its barrier; its crew (2 pompiers) get off at the barrier
 *   each pompier: claim the nearest *reachable* fire nobody else claimed ──> walk there
 *     ──fire's edge within sprayFrom and in sight──> spray it until it is out ──> next fire
 *   no fire left ──> back to the truck, get on ──> the truck drives off
 *   fires burning for extraTruckAfter ──> a second truck (maxTrucks at once)
 *
 * The truck never enters the street: it parks in a side street, out of the
 * cortège's way, so it never runs anyone over or gets stuck in the crowd.
 */
import type { BoxObstacle, Level } from "../level/index.js";
import type { Vec2 } from "../physics/index.js";
import type { BrigadeStats } from "../crs/index.js";
import { boundingRadius, distanceToShape } from "../fire/index.js";
import type { PropShape } from "../prop/index.js";

/**
 * Who works on which fire. A pompier holds at most one claim and a fire has
 * at most one pompier, so two pompiers never wait on the same fire. A claim
 * is released when the fire goes out (`keep`), or when its pompier gives up,
 * leaves or stays down too long (`release`).
 */
export class FireClaims {
  private readonly byFire = new Map<string, string>();
  private readonly byPompier = new Map<string, string>();

  /** The pompier working on fire `fireId`, if any. */
  holder(fireId: string): string | undefined {
    return this.byFire.get(fireId);
  }

  /** The fire pompier `pompierId` works on, if any. */
  claimOf(pompierId: string): string | undefined {
    return this.byPompier.get(pompierId);
  }

  /** Pompier `pompierId` takes fire `fireId`, dropping any other claim of its own. False if someone else holds it. */
  claim(fireId: string, pompierId: string): boolean {
    const holder = this.byFire.get(fireId);
    if (holder !== undefined && holder !== pompierId) return false;
    this.release(pompierId);
    this.byFire.set(fireId, pompierId);
    this.byPompier.set(pompierId, fireId);
    return true;
  }

  /** Pompier `pompierId` lets go of its fire. Returns the fire, if it had one. */
  release(pompierId: string): string | undefined {
    const fireId = this.byPompier.get(pompierId);
    if (fireId === undefined) return undefined;
    this.byPompier.delete(pompierId);
    this.byFire.delete(fireId);
    return fireId;
  }

  /** Drop every claim on a fire that is no longer `burning`. Returns the pompiers set free. */
  keep(burning: (fireId: string) => boolean): string[] {
    const freed: string[] = [];
    for (const [fireId, pompierId] of this.byFire) {
      if (burning(fireId)) continue;
      this.byFire.delete(fireId);
      this.byPompier.delete(pompierId);
      freed.push(pompierId);
    }
    return freed;
  }

  get size(): number {
    return this.byFire.size;
  }

  clear(): void {
    this.byFire.clear();
    this.byPompier.clear();
  }
}

/**
 * The fire pompier `selfId` should go for: the one with the shortest walk
 * (`cost`, a path length; null when it can't be reached, e.g. behind another
 * fire), among the fires no other pompier claimed and not `ignored` (given
 * up on). Its own claim stays a candidate. Ties go to the smaller id. Null
 * when there is none. A straight-line distance is never used: the nearest
 * fire may be the one you can't get to.
 */
export function pickFire<F extends { readonly id: string }>(
  selfId: string,
  fires: Iterable<F>,
  claims: FireClaims,
  cost: (fire: F) => number | null,
  ignored: (fireId: string) => boolean = () => false,
): F | null {
  let best: F | null = null;
  let bestCost = Infinity;
  for (const f of fires) {
    const holder = claims.holder(f.id);
    if ((holder !== undefined && holder !== selfId) || ignored(f.id)) continue;
    const c = cost(f);
    if (c === null || !Number.isFinite(c)) continue;
    if (c < bestCost || (c === bestCost && best !== null && f.id < best.id)) {
      bestCost = c;
      best = f;
    }
  }
  return best;
}

/** How far outside a fire's zone (its bounding circle) a pompier walks to: past a bot's path clearance. */
export const APPROACH_MARGIN = 0.8;

/**
 * Where a pompier coming from `from` walks to put out the fire on `shape`:
 * just outside the fire zone, on its own side of the fire. Not the fire's
 * centre: the walkable spot nearest the centre may well be on the far side,
 * behind the fire, which is exactly where a pompier gets stuck.
 */
export function approachPoint(shape: PropShape, from: Vec2, margin = APPROACH_MARGIN): Vec2 {
  const dx = from.x - shape.x;
  const dz = from.z - shape.z;
  const d = Math.hypot(dx, dz);
  const r = boundingRadius(shape) + margin;
  if (d < 1e-6) return { x: shape.x, z: shape.z + r };
  return { x: shape.x + (dx / d) * r, z: shape.z + (dz / d) * r };
}

/** What `shouldDispatchTruck` looks at. */
export interface DispatchView {
  /** Props burning now. */
  burning: number;
  /** Seconds since the street last had no fire at all. */
  burningFor: number;
  /** Fire trucks on the street now (arriving, parked or leaving). */
  trucks: number;
  /** Seconds since the last truck was sent (Infinity if none yet). */
  sinceLastTruck: number;
}

/**
 * Whether to send a fire truck now: something burns, there is room under
 * `maxTrucks`, and either no truck is out and the fire has burned for
 * `arriveDelay`, or the fires have kept burning for `extraTruckAfter` and the
 * last truck was sent at least that long ago.
 */
export function shouldDispatchTruck(v: DispatchView, stats: BrigadeStats): boolean {
  if (v.burning <= 0 || v.trucks >= stats.maxTrucks) return false;
  if (v.trucks === 0) return v.burningFor >= stats.arriveDelay - 1e-9;
  return v.burningFor >= stats.extraTruckAfter - 1e-9 && v.sinceLastTruck >= stats.extraTruckAfter - 1e-9;
}

/**
 * Whether a parked truck drives off: none of its crew is left on the street.
 * Pompiers only get back on once nothing burns (`crewGoesBack`), so this is
 * "the fires are out and everyone is aboard"; it also covers a crew that
 * could not get off (the bot cap, or nothing burning by the time it parked)
 * or was removed.
 */
export function truckMayLeave(crewOnStreet: number): boolean {
  return crewOnStreet <= 0;
}

/** Whether a pompier heads back to its truck: no fire left anywhere. With fires left but all claimed, it waits by the truck instead. */
export function crewGoesBack(burning: number): boolean {
  return burning <= 0;
}

/** A pompier knocked over for `downFor` seconds in total since it last sprayed gives up its fire. */
export function downTooLong(downFor: number, stats: BrigadeStats): boolean {
  return downFor > stats.downTooLong + 1e-9;
}

/**
 * The "accidental" spray (#17): whether, over a tick of `dt` seconds of
 * spraying, the pompier swings its hose over a CRS. `chance` is per second
 * (`HoseStats.accidentalSprayChance`); 0 (or less) never does. `random` is
 * in [0, 1).
 */
export function rollAccidentalSpray(chance: number, dt: number, random: () => number = Math.random): boolean {
  if (!(chance > 0) || !(dt > 0)) return false;
  return random() < 1 - Math.exp(-chance * dt);
}

/**
 * Who gets the "accidental" spray: the police bot nearest to the fire being
 * sprayed, among those within `range` of the fire's edge and within `reach`
 * of the pompier (the hose's range). Null when nobody qualifies: the joke
 * only ever lands on a CRS standing by the pompier's own fire.
 */
export function pickAccidentalTarget<B extends Vec2 & { readonly id: string }>(
  fire: PropShape,
  pompier: Vec2,
  police: Iterable<B>,
  range: number,
  reach: number,
): B | null {
  let best: B | null = null;
  let bestD = Infinity;
  for (const b of police) {
    const d = distanceToShape(fire, b.x, b.z);
    if (d > range + 1e-9 || Math.hypot(b.x - pompier.x, b.z - pompier.z) > reach + 1e-9) continue;
    if (d < bestD || (d === bestD && best !== null && b.id < best.id)) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/** Where a fire truck comes in (#17): one per side street, found from the level's barriers. */
export interface TruckBay {
  /** The barrier's id, to tell bays apart. */
  readonly id: string;
  /** Where the truck parks, behind the barrier, outside the street. */
  readonly park: Vec2;
  /** Where it comes from and drives back to, down the side street. */
  readonly out: Vec2;
  /** Where its pompiers get off and on: inside the street, just in front of the barrier. */
  readonly door: Vec2;
  /** The truck's facing while parked (nose towards the street). */
  readonly rotation: number;
}

/** The truck's length (along the side street) and width, for the bays and the client's placeholder. */
export const TRUCK_LENGTH = 5.2;
export const TRUCK_WIDTH = 2.4;
/** How far down its side street a truck comes from and goes back to, beyond the parking spot. */
const TRUCK_RUN = 22;
/** A pompier gets off this far in front of the barrier's street face (plus its radius). */
const DOOR_GAP = 0.25;

/**
 * Every side street a truck can use: one bay per barrier of the level (the
 * barriers close the side streets at the street's edge). The truck parks
 * just behind the barrier, its crew get off just in front of it.
 */
export function truckBays(level: Level, pompierRadius: number): TruckBay[] {
  const b = level.bounds;
  const midX = (b.minX + b.maxX) / 2;
  const out: TruckBay[] = [];
  for (const box of level.boxes) {
    if (box.kind !== "barrier") continue;
    out.push(bayFor(box, midX, pompierRadius));
  }
  return out;
}

function bayFor(box: BoxObstacle, midX: number, r: number): TruckBay {
  // +1: a barrier on the right (+X) side; -1: on the left.
  const side = box.x >= midX ? 1 : -1;
  const outer = box.x + side * box.halfX;
  const inner = box.x - side * box.halfX;
  const parkX = outer + side * (TRUCK_LENGTH / 2 + 0.3);
  return {
    id: box.id,
    park: { x: parkX, z: box.z },
    out: { x: parkX + side * TRUCK_RUN, z: box.z },
    door: { x: inner - side * (r + DOOR_GAP), z: box.z },
    // Nose towards the street (-side along X).
    rotation: Math.atan2(-side, 0),
  };
}

/** The bay nearest to `at` (along the street), preferring one no other truck uses. Null when there are none. */
export function pickBay(bays: readonly TruckBay[], at: Vec2, taken: (bayId: string) => boolean = () => false): TruckBay | null {
  let best: TruckBay | null = null;
  let bestD = Infinity;
  for (const pass of [false, true]) {
    for (const bay of bays) {
      if (!pass && taken(bay.id)) continue;
      const d = Math.hypot(bay.door.x - at.x, bay.door.z - at.z);
      if (d < bestD) {
        bestD = d;
        best = bay;
      }
    }
    if (best) return best;
  }
  return best;
}
