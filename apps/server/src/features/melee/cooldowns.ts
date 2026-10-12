import { MELEE_COOLDOWN, cooldownReady } from "@manif/shared";

/**
 * Last accepted swing per session (#4), in room time. Server-only, like
 * `moveInputs`: the cooldown is a game rule, so clicks faster than it are
 * simply dropped here, whatever the client does.
 */
export class MeleeCooldowns {
  private readonly lastAt = new Map<string, number>();

  constructor(private readonly cooldown = MELEE_COOLDOWN) {}

  /** Starts a swing if the cooldown allows it. Returns false (and changes nothing) otherwise. */
  tryStart(id: string, now: number): boolean {
    if (!cooldownReady(this.lastAt.get(id), now, this.cooldown)) return false;
    this.lastAt.set(id, now);
    return true;
  }

  remove(id: string): void {
    this.lastAt.delete(id);
  }

  clear(): void {
    this.lastAt.clear();
  }
}
