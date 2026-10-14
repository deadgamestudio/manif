// How many messages a client may send, per message type.
//
// Every client message runs on the one event loop that also steps every
// room, so each client gets a token bucket per message type. Moves are
// frequent (a touch stick sends one per frame while it moves), so they get a
// big budget; every other message is a key press and gets a smaller one. Way
// above anything a person can do, far below a flood. A message over budget is
// dropped; a client that keeps going over is disconnected.
// Pure logic: the room calls it with the clock.

export interface Rate {
  /** Messages a second, sustained. */
  perSecond: number;
  /** Messages in a row before the sustained rate applies. */
  burst: number;
}

export interface BudgetConfig {
  /** The budget for each message type listed here. */
  byType: Record<string, Rate>;
  /** The budget for every other message type (each type has its own bucket). */
  other: Rate;
  /** Dropped messages, within `strikeWindowMs`, that get a client disconnected. */
  maxDrops: number;
  strikeWindowMs: number;
}

export const DEFAULT_BUDGET: BudgetConfig = {
  byType: { move: { perSecond: 120, burst: 240 } },
  other: { perSecond: 30, burst: 60 },
  maxDrops: 300,
  strikeWindowMs: 10_000,
};

/** What to do with a message: handle it, drop it, or drop it and disconnect the sender. */
export type Verdict = "ok" | "drop" | "kick";

interface Bucket {
  tokens: number;
  at: number;
}

interface ClientBudget {
  buckets: Map<string, Bucket>;
  /** Drops counted since `windowStart`. */
  drops: number;
  windowStart: number;
}

export class MessageBudget {
  private clients = new Map<string, ClientBudget>();

  constructor(private readonly config: BudgetConfig = DEFAULT_BUDGET) {}

  /** Clients tracked (for tests). */
  get tracked(): number {
    return this.clients.size;
  }

  /** Charge one `type` message from client `id` at `now` (ms). */
  take(id: string, type: string, now: number): Verdict {
    let c = this.clients.get(id);
    if (!c) {
      c = { buckets: new Map(), drops: 0, windowStart: now };
      this.clients.set(id, c);
    }
    const rate = this.config.byType[type] ?? this.config.other;
    let b = c.buckets.get(type);
    if (!b) {
      b = { tokens: rate.burst, at: now };
      c.buckets.set(type, b);
    } else if (now > b.at) {
      b.tokens = Math.min(rate.burst, b.tokens + ((now - b.at) / 1000) * rate.perSecond);
      b.at = now;
    }
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return "ok";
    }
    if (now - c.windowStart > this.config.strikeWindowMs) {
      c.windowStart = now;
      c.drops = 0;
    }
    c.drops += 1;
    return c.drops >= this.config.maxDrops ? "kick" : "drop";
  }

  /** Forget a client that left. */
  remove(id: string) {
    this.clients.delete(id);
  }
}
