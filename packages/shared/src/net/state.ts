/**
 * Plain shapes of the synced room state, as seen by the client.
 * The real Schema classes live in the server only.
 */

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
  /** Knocked down (#2): no control until it gets back up. */
  down: boolean;
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
