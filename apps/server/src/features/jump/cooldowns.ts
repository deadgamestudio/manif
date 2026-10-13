import { JUMP_COOLDOWN, jumpReady } from "@manif/shared";

/**
 * Last accepted hop per session (#45), in room time. Server-only: the
 * cooldown is a game rule, so presses faster than it are dropped here.
 */
export class JumpCooldowns {
  private readonly lastAt = new Map<string, number>();

  /** True if `id` may hop at `now`. */
  ready(id: string, now: number, cooldown = JUMP_COOLDOWN): boolean {
    return jumpReady(this.lastAt.get(id), now, cooldown);
  }

  /** Record a hop that started at `now`. */
  start(id: string, now: number): void {
    this.lastAt.set(id, now);
  }

  remove(id: string): void {
    this.lastAt.delete(id);
  }

  clear(): void {
    this.lastAt.clear();
  }
}
