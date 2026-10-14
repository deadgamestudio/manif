/**
 * DIAGNOSTICS (#59): with MANIF_DIAG=1 in the server's environment, the room
 * logs how long its ticks take (to check 7 bots and a full CRS wave stay
 * inside the 30 Hz budget) and the size of every per-player map (to check
 * nothing is left behind when bots leave). Off by default: nothing measured,
 * nothing logged.
 */
export const DIAG_ENABLED = process.env.MANIF_DIAG === "1";

export class TickStats {
  private count = 0;
  private total = 0;
  private max = 0;
  private since = 0;

  constructor(
    private readonly log: (message: string) => void,
    /** Seconds of room time between two log lines. */
    private readonly every = 5,
  ) {}

  /** One tick took `ms`; `now` is the room time. Logs and starts again every `every` seconds. */
  add(ms: number, now: number, what: () => string): void {
    this.count++;
    this.total += ms;
    if (ms > this.max) this.max = ms;
    if (now - this.since < this.every) return;
    this.log(`tick ${(this.total / this.count).toFixed(2)} ms avg, ${this.max.toFixed(2)} ms max over ${this.count} ticks (${what()})`);
    this.reset(now);
  }

  reset(now: number): void {
    this.count = 0;
    this.total = 0;
    this.max = 0;
    this.since = now;
  }
}
