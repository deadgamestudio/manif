/**
 * Plain shapes of the synced room state, as seen by the client.
 * The real Schema classes live in the server only.
 */
import type { PlayerStatus } from "../health/index.js";

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

export interface StreetStateShape {
  players: SyncedMap<PlayerShape>;
  phase: Phase;
  /** Session id of the host (who may start), or "" when the room is empty. */
  hostId: string;
}
