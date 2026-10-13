import type { RoundPlayerRow } from "@manif/shared";

/** At most one live board message (#63) per this many seconds of room time. */
export const BOARD_INTERVAL = 1;

/** What the board throttle remembers: when it last sent, and what. */
export interface BoardThrottle {
  /** Room time (s) of the last send, or null if nothing was sent this march. */
  sentAt: number | null;
  /** The last rows sent, as a comparable key, or null. */
  sentKey: string | null;
}

export const IDLE_BOARD: BoardThrottle = { sentAt: null, sentKey: null };

/** The rows as a string that changes exactly when a row is added, removed or a count moves. */
export function boardKey(rows: readonly RoundPlayerRow[]): string {
  return JSON.stringify(rows);
}

/**
 * Should the live board go out now (#63)? Pure: returns whether to send and
 * what to remember. Only while marching (outside the march it forgets, so the
 * next march opens with a fresh board); never sooner than `BOARD_INTERVAL`
 * after the last send; and only when the rows differ from the last ones sent.
 */
export function stepBoard(prev: BoardThrottle, marching: boolean, now: number, key: string): { send: boolean; next: BoardThrottle } {
  if (!marching) return { send: false, next: IDLE_BOARD };
  if (prev.sentAt !== null && now - prev.sentAt < BOARD_INTERVAL) return { send: false, next: prev };
  if (key === prev.sentKey) return { send: false, next: prev };
  return { send: true, next: { sentAt: now, sentKey: key } };
}
