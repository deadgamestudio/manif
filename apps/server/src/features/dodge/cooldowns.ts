import { DODGE_COOLDOWN, dodgeReady } from "@manif/shared";

/**
 * Last accepted dodge per session (#9), in room time. Server-only: the
 * cooldown is a game rule, so presses faster than it are dropped here,
 * whatever the client shows.
 */
export class DodgeCooldowns {
  private readonly lastAt = new Map<string, number>();

  /** True if `id` may dodge at `now`. `cooldown` lets an archetype (#14) use its own. */
  ready(id: string, now: number, cooldown = DODGE_COOLDOWN): boolean {
    return dodgeReady(this.lastAt.get(id), now, cooldown);
  }

  /** Record a dodge that started at `now`. */
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
