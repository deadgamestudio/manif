import { createStruggle, isStruggleFree, stepStruggle, strugglePercent, strugglePress, type Struggle } from "@manif/shared";

/**
 * Struggle meters per grabbed protester (#70), keyed by session id.
 * Server-only; the room mirrors the meter onto the player (`Player.struggle`)
 * and frees them when it fills. The rules are the pure functions in
 * @manif/shared (`strugglePress`, `stepStruggle`): presses past STRUGGLE_RATE
 * a second are ignored, an idle meter drains.
 *
 * A meter only lives while its protester is grabbed: the room calls `end`
 * as soon as they are not, so the next grab starts from 0.
 */
export class Struggles {
  private readonly meters = new Map<string, Struggle>();

  /** One press of the mash by `id` at room time `now`. Returns true when the meter is now full (break free). */
  press(id: string, now: number): boolean {
    let s = this.meters.get(id);
    if (!s) {
      s = createStruggle();
      this.meters.set(id, s);
    }
    strugglePress(s, now);
    return isStruggleFree(s);
  }

  /** Drain the idle meters (once a tick). */
  step(now: number, dt: number): void {
    for (const s of this.meters.values()) stepStruggle(s, now, dt);
  }

  /** The meter of `id`, 0..100 (0 without one), for the synced `Player.struggle`. */
  percent(id: string): number {
    const s = this.meters.get(id);
    return s ? strugglePercent(s) : 0;
  }

  /** `id` is no longer grabbed (freed, arrested, gone): their meter goes. */
  end(id: string): void {
    this.meters.delete(id);
  }

  clear(): void {
    this.meters.clear();
  }
}
