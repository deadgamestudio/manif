// How many lobbies can be created, by whom, and how fast.
//
// Every lobby costs memory and a 20 Hz simulation on the one game process, so
// creating them is budgeted:
// - per visitor (see visitor.ts), a small bucket of creations that refills
//   slowly: friends making a lobby or a few in a row never notice it;
// - per visitor, a few lobbies alive at once;
// - for the whole server, a cap on lobbies alive at once.
// Joining a lobby, by link or code, and the next round in the same lobby are
// never counted. Pure logic: the room calls it with the clock.

export interface CreateLimitConfig {
  /** Creations a visitor can make in a row before waiting. */
  burst: number;
  /** One more creation comes back every this many ms. */
  refillMs: number;
  /** Lobbies a single visitor can have alive at once. */
  maxLivePerVisitor: number;
  /** Lobbies alive at once on the whole server. */
  maxRooms: number;
}

export const DEFAULT_CREATE_LIMIT: CreateLimitConfig = {
  burst: 8,
  refillMs: 30_000,
  maxLivePerVisitor: 6,
  maxRooms: 100,
};

/** Why a creation was refused: this visitor made too many, or the server has too many lobbies. */
export type CreateRefusal = "visitor" | "server";
export type CreateCheck = { ok: true } | { ok: false; reason: CreateRefusal };

interface Visitor {
  /** Creations left, fractional while refilling. */
  tokens: number;
  /** When `tokens` was last brought up to date. */
  at: number;
  /** Lobbies this visitor created that are still alive. */
  live: number;
}

/** Past this many tracked visitors, the ones back to a full bucket and no live lobby are forgotten. */
const PRUNE_AT = 5_000;

export class CreateLimit {
  private visitors = new Map<string, Visitor>();
  private liveRooms = 0;

  constructor(private readonly config: CreateLimitConfig = DEFAULT_CREATE_LIMIT) {}

  /** Lobbies alive right now, as counted by `opened`/`closed`. */
  get live(): number {
    return this.liveRooms;
  }

  /** Tracked visitors (for tests and logs). */
  get tracked(): number {
    return this.visitors.size;
  }

  private refill(v: Visitor, now: number) {
    const { burst, refillMs } = this.config;
    if (now > v.at) {
      v.tokens = Math.min(burst, v.tokens + (now - v.at) / refillMs);
      v.at = now;
    }
  }

  /**
   * May `key` create a lobby now? On yes, it is counted at once (a creation
   * spent, one more live lobby for the visitor and the server): call `closed`
   * with the same key when that lobby is disposed.
   */
  tryOpen(key: string, now: number): CreateCheck {
    const { burst, maxLivePerVisitor, maxRooms } = this.config;
    if (this.visitors.size >= PRUNE_AT) this.prune(now);
    let v = this.visitors.get(key);
    if (v) this.refill(v, now);
    else v = { tokens: burst, at: now, live: 0 };
    if (v.tokens < 1 || v.live >= maxLivePerVisitor) {
      this.visitors.set(key, v);
      return { ok: false, reason: "visitor" };
    }
    if (this.liveRooms >= maxRooms) return { ok: false, reason: "server" };
    v.tokens -= 1;
    v.live += 1;
    this.visitors.set(key, v);
    this.liveRooms += 1;
    return { ok: true };
  }

  /** A lobby `key` created is gone. */
  closed(key: string) {
    this.liveRooms = Math.max(0, this.liveRooms - 1);
    const v = this.visitors.get(key);
    if (v) v.live = Math.max(0, v.live - 1);
  }

  /**
   * Forgets visitors whose bucket is full again and who have nothing alive:
   * they look new anyway. Still too many: the oldest with nothing alive go,
   * so the map stays bounded whatever the number of addresses.
   */
  prune(now: number) {
    for (const [key, v] of this.visitors) {
      this.refill(v, now);
      if (v.live === 0 && v.tokens >= this.config.burst) this.visitors.delete(key);
    }
    for (const [key, v] of this.visitors) {
      if (this.visitors.size < PRUNE_AT) break;
      if (v.live === 0) this.visitors.delete(key);
    }
  }
}

/** The server-wide room cap: MANIF_MAX_ROOMS when it is a positive integer, else the default. */
export function maxRoomsFromEnv(raw: string | undefined, fallback = DEFAULT_CREATE_LIMIT.maxRooms): number {
  const n = Number(raw);
  return raw && Number.isInteger(n) && n > 0 ? n : fallback;
}
