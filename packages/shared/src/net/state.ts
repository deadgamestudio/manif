/**
 * Plain shapes of the synced room state, as seen by the client.
 * The real Schema classes live in the server only.
 */
import type { PlayerStatus } from "../health/index.js";
import type { CrsKind, CrsStatus } from "../crs/index.js";

/**
 * Room phase, synced as a uint8.
 * #12 turns this into the full round lifecycle (waiting, marching, ended).
 */
export const Phase = {
  /** Players gather on the lobby screen; the host can start. */
  Lobby: 0,
  /** Everyone is in the street. */
  Playing: 1,
} as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

export interface PlayerShape {
  x: number;
  z: number;
  /** Facing angle around the Y axis, in radians. */
  rotation: number;
  /** Display name, already sanitised by the server. */
  name: string;
  /** Knocked down (#2): no control until it gets back up. Not a health state. */
  down: boolean;
  /** Health points, 0..MAX_HP (#3). */
  hp: number;
  /** Free, grabbed, KO or arrested (#3). See `PlayerStatus`. */
  status: PlayerStatus;
  /** Whole seconds left in the current non-free state, for countdowns (0 while free). */
  stateLeft: number;
}

/** Minimal read-only view of a Colyseus MapSchema. */
export interface SyncedMap<V> {
  readonly size: number;
  get(key: string): V | undefined;
  forEach(callback: (value: V, key: string) => void): void;
  entries(): IterableIterator<[string, V]>;
  [Symbol.iterator](): IterableIterator<[string, V]>;
}

/**
 * Runtime state of a breakable prop (#4), keyed by its id in the level data.
 * Position, type and size are not synced: read them from the shared level.
 */
export interface PropShapeState {
  /** 0..PROP_TYPES[kind].maxHp. */
  hp: number;
  broken: boolean;
}

/**
 * A police bot (#5), keyed by a server-made id. Target, path and timers stay
 * on the server; stats are in `CRS_STATS[kind]`.
 */
export interface CrsShape {
  x: number;
  z: number;
  /** Facing angle around the Y axis, in radians. */
  rotation: number;
  hp: number;
  /** Active, stunned, grabbing or out. See `CrsStatus`. */
  status: CrsStatus;
  /** Knocked down (#2). */
  down: boolean;
  /** Unit type (#13). See `CrsKind`. */
  kind: CrsKind;
}

export interface StreetStateShape {
  players: SyncedMap<PlayerShape>;
  /** Breakable props by level prop id (#4). */
  props: SyncedMap<PropShapeState>;
  /** Police bots by id (#5). */
  crs: SyncedMap<CrsShape>;
  phase: Phase;
  /** Session id of the host (who may start), or "" when the room is empty. */
  hostId: string;
}
