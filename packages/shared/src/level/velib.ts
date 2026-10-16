/**
 * Vélib stations (#121): where the docks stand, where a docked bike lies, and
 * which docks get a bike this round. Pure: the server deals the bikes as
 * ordinary ground items at each round reset, the client draws the docks from
 * the level data and lines a bike that sits in a dock up with it.
 */
import { THROWABLE_TYPES, ThrowableKind } from "../throwable/index.js";
import type { Vec2 } from "../physics/index.js";
import type { Level, LevelItem, VelibStation } from "./level.js";

export const VELIB_STATION = {
  /** Docks are this far apart along the street (a bike is 0.64 wide at the handlebar). */
  dockGap: 0.9,
  /** A docked bike's centre is this far from its dock, towards the road (its front wheel is in the dock). */
  bikeOffset: 0.98,
  /** A bike's half length and half width on the ground, for the layout tests. */
  bikeHalfLength: 0.88,
  bikeHalfWidth: 0.32,
} as const;

/** How the bikes are dealt each round. */
export const VELIB_DEAL = {
  /** Stations that get bikes; the others stand empty. */
  stations: 3,
  /** Bikes in a station that gets some (fewer than its docks: there is always a gap). */
  minBikes: 2,
  maxBikes: 3,
} as const;

/** One dock of a station: the post, the spot of the bike in it, and the turn (around Y) both are drawn with. */
export interface VelibDock {
  dock: Vec2;
  bike: Vec2;
  /** Radians around Y: the bike's front (+Z in the model) points at the station's side of the street. */
  yaw: number;
}

/** The docks of a station, along the street, centred on its `z`. */
export function velibDocks(s: VelibStation): VelibDock[] {
  const out: VelibDock[] = [];
  const { dockGap, bikeOffset } = VELIB_STATION;
  for (let i = 0; i < s.docks; i++) {
    const z = s.z + (i - (s.docks - 1) / 2) * dockGap;
    out.push({ dock: { x: s.x, z }, bike: { x: s.x - s.side * bikeOffset, z }, yaw: (s.side * Math.PI) / 2 });
  }
  return out;
}

/** Every dock of the level, all stations together. */
export function allVelibDocks(level: Level): VelibDock[] {
  return level.velibStations.flatMap(velibDocks);
}

/**
 * The dock a bike lying at (x, z) is parked in, or null if it lies anywhere
 * else (thrown, dropped). The synced position is a float32: a small margin.
 */
export function dockAt(docks: readonly VelibDock[], x: number, z: number): VelibDock | null {
  for (const d of docks) if (Math.abs(d.bike.x - x) < 0.05 && Math.abs(d.bike.z - z) < 0.05) return d;
  return null;
}

/**
 * The Vélibs of a fresh round: `VELIB_DEAL.stations` stations picked at
 * random, each with a random number of bikes in random docks. Never more
 * than the kind's ground cap, so none is evicted at the start.
 */
export function dealVelibs(level: Level, random: () => number = Math.random): LevelItem[] {
  const stations = shuffled(level.velibStations, random).slice(0, VELIB_DEAL.stations);
  const out: LevelItem[] = [];
  const cap = THROWABLE_TYPES[ThrowableKind.Velib].groundCap;
  for (const s of stations) {
    const span = VELIB_DEAL.maxBikes - VELIB_DEAL.minBikes + 1;
    const n = Math.min(s.docks, VELIB_DEAL.minBikes + Math.min(span - 1, Math.floor(random() * span)));
    for (const d of shuffled(velibDocks(s), random).slice(0, n)) {
      if (out.length >= cap) return out;
      out.push({ kind: ThrowableKind.Velib, x: d.bike.x, z: d.bike.z });
    }
  }
  return out;
}

/** A shuffled copy (Fisher-Yates). */
function shuffled<T>(list: readonly T[], random: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
