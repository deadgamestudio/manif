import { createRescuer, rescueProgress, stepRescues, stopRescue, type RescueSubject, type Rescuer } from "@manif/shared";

/**
 * Rescue state per session (#10): whether interact is held, the grabbed
 * teammate being pulled and the time held on them. Server-only; the room
 * mirrors the progress onto the grabbed player (`Player.rescue`). The rules
 * are the pure `stepRescues` from @manif/shared.
 */
export class Rescues {
  private readonly rescuers = new Map<string, Rescuer>();

  /** Interact pressed (true) or released (false). A release ends the rescue at once. */
  hold(id: string, held: boolean): void {
    let r = this.rescuers.get(id);
    if (!r) {
      if (!held) return;
      r = createRescuer();
      this.rescuers.set(id, r);
    }
    r.holding = held;
    if (!held) stopRescue(r);
  }

  remove(id: string): void {
    this.rescuers.delete(id);
  }

  clear(): void {
    this.rescuers.clear();
  }

  /** One tick of every rescue; `free` applies a finished one. See `stepRescues`. */
  step(
    dt: number,
    lookup: (id: string) => RescueSubject | undefined,
    subjects: () => Iterable<RescueSubject>,
    canAct: (id: string) => boolean,
    free: (targetId: string, rescuerId: string) => boolean,
  ): [string, string][] {
    if (this.rescuers.size === 0) return [];
    return stepRescues(this.rescuers, lookup, subjects, canAct, dt, free);
  }

  /** Progress shown over `targetId`, 0..100 (the best of everyone pulling them). */
  percent(targetId: string): number {
    return Math.round(rescueProgress(this.rescuers.values(), targetId) * 100);
  }
}
