import {
  canAct,
  canBeHurt,
  canMove,
  createHealth,
  damage,
  grab,
  rescue,
  secondsLeft,
  tickHealth,
  type Health,
  type HealthEvent,
} from "@manif/shared";

/** The synced fields health writes. `Player` fits it. */
export interface HealthView {
  hp: number;
  status: number;
  stateLeft: number;
}

/**
 * Server-side health per protester (#3), keyed by session id. Holds what is
 * never synced (state end time, invulnerability) and applies the pure state
 * machine from @manif/shared, mirroring hp, status and the countdown into the
 * Schema view. Time is room time in seconds, passed in by the room, never
 * Date.now(), so this stays testable with a fake clock.
 *
 * Every method takes an id that may have just left (onLeave deletes it): an
 * unknown id is a no-op returning false/null, so callers (a CRS grab, a
 * rescue) can simply drop their target when that happens.
 */
export class Healths {
  private readonly records = new Map<string, Health>();

  /** Create or reset a protester: free, full HP. */
  reset(id: string, view: HealthView): void {
    this.set(id, view, createHealth(), 0);
  }

  remove(id: string): void {
    this.records.delete(id);
  }

  get(id: string): Readonly<Health> | undefined {
    return this.records.get(id);
  }

  /** May walk. False for an unknown id. */
  canMove(id: string): boolean {
    const h = this.records.get(id);
    return h ? canMove(h) : false;
  }

  /** May act (attack, throw, dodge, rescue). False for an unknown id. */
  canAct(id: string): boolean {
    const h = this.records.get(id);
    return h ? canAct(h) : false;
  }

  /** Whether a hit right now would do anything. Lets hitters (#4, #5, #7) skip KO'd, arrested or invulnerable targets. */
  canBeHurt(id: string, now: number): boolean {
    const h = this.records.get(id);
    return h ? canBeHurt(h, now) : false;
  }

  /** Take HP off. Returns true if anything changed (HP or status). */
  damage(id: string, view: HealthView, amount: number, now: number): boolean {
    return this.apply(id, view, now, (h) => damage(h, amount, now));
  }

  /** Free -> grabbed (#5). Returns true if the grab took. */
  grab(id: string, view: HealthView, now: number, duration?: number): boolean {
    return this.apply(id, view, now, (h) => grab(h, now, duration));
  }

  /** Grabbed -> free, with a short grab immunity (#10). Returns true if the rescue took. */
  rescue(id: string, view: HealthView, now: number): boolean {
    return this.apply(id, view, now, (h) => rescue(h, now));
  }

  /** Advance timers. Returns what happened, so the room can place a respawned body. */
  tick(id: string, view: HealthView, now: number): HealthEvent {
    const h = this.records.get(id);
    if (!h) return null;
    const { health, event } = tickHealth(h, now);
    this.set(id, view, health, now);
    return event;
  }

  private apply(id: string, view: HealthView, now: number, fn: (h: Health) => Health): boolean {
    const h = this.records.get(id);
    if (!h) return false;
    const next = fn(h);
    if (next === h) return false;
    this.set(id, view, next, now);
    return true;
  }

  private set(id: string, view: HealthView, h: Health, now: number): void {
    this.records.set(id, h);
    // Assign only on change, so a steady protester costs nothing in the patch.
    if (view.hp !== h.hp) view.hp = h.hp;
    if (view.status !== h.status) view.status = h.status;
    const left = secondsLeft(h, now);
    if (view.stateLeft !== left) view.stateLeft = left;
  }
}
