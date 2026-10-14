import { createBall, stepBall, type BallBody, type BallStep, type CollisionWorld, type LbdBall, type LbdStats, type Vec2 } from "@manif/shared";

/** A grab this soon after an LBD hit counts as "the hit led to a grab" (#73), for the log. */
export const GRAB_AFTER_HIT_WINDOW = 2;
/**
 * The grab immunity after a hit outlasts GRAB_AFTER_HIT_WINDOW, so that count
 * is 0 by design; grabs within this longer window (immunity included) are
 * logged too, to see whether the arrest only comes a moment later.
 */
export const GRAB_SOON_AFTER_HIT_WINDOW = 5;

/**
 * The LBD's balls in flight (#73). Server-only: clients get the shot and the
 * impact as events and fly their own copy, so nothing here is synced per
 * tick. The room says what stops a ball and whom it may hit, and applies the
 * hit.
 *
 * Also counts, per round, the shots, the hits, and the hits followed by a
 * grab within GRAB_AFTER_HIT_WINDOW and GRAB_SOON_AFTER_HIT_WINDOW (the grab
 * synergy the issue asks to measure), for the round's log line.
 */
export class LbdShots {
  private readonly balls: LbdBall[] = [];
  private counter = 0;
  /** Room time of each protester's last LBD hit, for the grab count. */
  private readonly hitAt = new Map<string, number>();
  shots = 0;
  hits = 0;
  grabsAfterHit = 0;
  grabsSoonAfterHit = 0;

  get flying(): number {
    return this.balls.length;
  }

  /** A ball fired by `by` from `from` along (dirX, dirZ), with the unit's numbers. */
  fire(by: string, from: Vec2, dirX: number, dirZ: number, s: LbdStats): LbdBall {
    const ball = createBall(`lbd-${++this.counter}`, by, from, dirX, dirZ, s);
    this.balls.push(ball);
    this.shots++;
    return ball;
  }

  /** Move every ball one tick; `onStop` for each that stopped (hit, blocked or dropped), then it is gone. */
  step(dt: number, world: CollisionWorld, blockers: readonly BallBody[], targets: readonly BallBody[], onStop: (ball: LbdBall, res: Exclude<BallStep, { type: "flying" }>) => void): void {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i]!;
      const res = stepBall(ball, dt, world, blockers, targets);
      if (res.type === "flying") continue;
      this.balls.splice(i, 1);
      if (res.type === "hit") this.hits++;
      onStop(ball, res);
    }
  }

  /** Protester `id` was knocked down by a ball at `now`. */
  noteHit(id: string, now: number): void {
    this.hitAt.set(id, now);
  }

  /**
   * Protester `id` was just grabbed: counted when an LBD hit them in the last
   * GRAB_SOON_AFTER_HIT_WINDOW, and in the stricter count too within
   * GRAB_AFTER_HIT_WINDOW. True when it counted at all; one grab per hit.
   */
  noteGrab(id: string, now: number): boolean {
    const at = this.hitAt.get(id);
    if (at === undefined || now - at > GRAB_SOON_AFTER_HIT_WINDOW) return false;
    this.hitAt.delete(id);
    this.grabsSoonAfterHit++;
    if (now - at <= GRAB_AFTER_HIT_WINDOW) this.grabsAfterHit++;
    return true;
  }

  /** "3 shots, 2 hits, 0 grabbed within 2 s of a hit (1 within 5 s)", or null when nothing was fired. */
  summary(): string | null {
    if (this.shots === 0) return null;
    return (
      `${this.shots} shots, ${this.hits} hits, ${this.grabsAfterHit} grabbed within ${GRAB_AFTER_HIT_WINDOW} s of a hit ` +
      `(${this.grabsSoonAfterHit} within ${GRAB_SOON_AFTER_HIT_WINDOW} s)`
    );
  }

  /** A new round: no balls, counts back to 0. */
  clear(): void {
    this.balls.length = 0;
    this.hitAt.clear();
    this.shots = 0;
    this.hits = 0;
    this.grabsAfterHit = 0;
    this.grabsSoonAfterHit = 0;
  }
}
