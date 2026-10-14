/**
 * Protester health and arrest state machine (#3).
 *
 *   free ──grab──> grabbed ──drag ends──> arrested ──delay──> free (respawn)
 *     │              └──rescue (#10)──> free
 *     └──HP hits 0──> ko ──KO_DURATION──> arrested
 *
 * Everything here is pure: functions take the current `Health` and the room
 * time `now` (seconds) and return the next `Health`, never mutating the input.
 * A refused transition returns the same object, so callers can compare with
 * `===`. The server applies them; nothing here knows about Schema or clocks.
 */
import { GRAB_DURATION, GRAB_IMMUNITY, KO_DURATION, MAX_HP, RESCUE_MIN_HP, RESPAWN_DELAY, RESPAWN_INVULNERABILITY } from "./constants.js";

/** Synced as a uint8 (`Player.status`). */
export const PlayerStatus = {
  /** Walks and acts. */
  Free: 0,
  /** Held by a CRS and dragged to the van (#5). Can be rescued (#10). */
  Grabbed: 1,
  /** Knocked out at 0 HP: a short floppy collapse, always followed by arrest. */
  Ko: 2,
  /** In the van, out of the game until the respawn delay ends. */
  Arrested: 3,
} as const;
export type PlayerStatus = (typeof PlayerStatus)[keyof typeof PlayerStatus];

export interface Health {
  hp: number;
  status: PlayerStatus;
  /** Room time when the current non-free state ends (drag, KO, respawn). Unused while free. */
  until: number;
  /** Room time until which hits and grabs are ignored (after a respawn). */
  invulnerableUntil: number;
  /** Room time until which grabs only are ignored (after a rescue, #10). */
  grabImmuneUntil: number;
  /** HP on a respawn and the heal cap: MAX_HP, or the archetype's own (#14). */
  maxHp: number;
}

/** Which status changes the machine allows. Anything else is refused. */
const ALLOWED: Readonly<Record<PlayerStatus, readonly PlayerStatus[]>> = {
  [PlayerStatus.Free]: [PlayerStatus.Grabbed, PlayerStatus.Ko],
  [PlayerStatus.Grabbed]: [PlayerStatus.Free, PlayerStatus.Arrested],
  [PlayerStatus.Ko]: [PlayerStatus.Arrested],
  [PlayerStatus.Arrested]: [PlayerStatus.Free],
};

export function canTransition(from: PlayerStatus, to: PlayerStatus): boolean {
  return ALLOWED[from].includes(to);
}

/** A fresh protester: free, full HP (`maxHp`, an archetype's #14), no invulnerability. */
export function createHealth(maxHp = MAX_HP): Health {
  const max = validMaxHp(maxHp);
  return { hp: max, status: PlayerStatus.Free, until: 0, invulnerableUntil: 0, grabImmuneUntil: 0, maxHp: max };
}

/** A max HP that fits the synced uint8: a whole number in 1..255, MAX_HP if not a number. */
function validMaxHp(maxHp: number): number {
  return Number.isFinite(maxHp) ? Math.min(255, Math.max(1, Math.round(maxHp))) : MAX_HP;
}

/** Only free protesters walk. Their move input is ignored otherwise. */
export function canMove(h: Health): boolean {
  return h.status === PlayerStatus.Free;
}

/** Only free protesters act (attack #4, throw #8, dodge #9, rescue #10). */
export function canAct(h: Health): boolean {
  return h.status === PlayerStatus.Free;
}

export function isInvulnerable(h: Health, now: number): boolean {
  return now < h.invulnerableUntil;
}

/** Whether a grab would be refused for immunity: just respawned, or just rescued (#10). */
export function isGrabImmune(h: Health, now: number): boolean {
  return isInvulnerable(h, now) || now < h.grabImmuneUntil;
}

/** Whether hits can hurt this protester right now. */
export function canBeHurt(h: Health, now: number): boolean {
  return (h.status === PlayerStatus.Free || h.status === PlayerStatus.Grabbed) && !isInvulnerable(h, now);
}

/**
 * Take `amount` HP off. HP never goes below 0.
 * - free: at 0 HP it goes `ko` for KO_DURATION.
 * - grabbed: HP drops but it stays grabbed until the drag ends; the outcome
 *   (arrest) is the same, and the CRS already has them.
 * - ko / arrested: ignored, timers untouched.
 * Also ignored during respawn invulnerability, or for a non-positive or
 * non-finite amount.
 */
export function damage(h: Health, amount: number, now: number): Health {
  if (!Number.isFinite(amount) || amount <= 0 || !canBeHurt(h, now)) return h;
  const hp = Math.max(0, h.hp - amount);
  if (hp === h.hp) return h;
  if (hp === 0 && h.status === PlayerStatus.Free) {
    return { ...h, hp, status: PlayerStatus.Ko, until: now + KO_DURATION };
  }
  return { ...h, hp };
}

/**
 * A CRS grabs a free protester (#5): it is dragged to a van (#70) and
 * arrested on arrival (`deliver`), or when `duration` (the fallback) runs out,
 * unless rescued or struggling free first. Refused unless free, during respawn
 * invulnerability, and during the grab immunity after a rescue.
 */
export function grab(h: Health, now: number, duration = GRAB_DURATION): Health {
  if (!canTransition(h.status, PlayerStatus.Grabbed) || isGrabImmune(h, now)) return h;
  return { ...h, status: PlayerStatus.Grabbed, until: now + Math.max(0, duration) };
}

/**
 * The drag reached a police van (#70): the protester goes into it on the next
 * `tickHealth`, through the same arrest as a drag that ran out of time.
 * Ignored unless grabbed.
 */
export function deliver(h: Health, now: number): Health {
  if (h.status !== PlayerStatus.Grabbed || h.until <= now) return h;
  return { ...h, until: now };
}

/**
 * Freed from a grab (#10): pulled out by a teammate, or let go by a CRS that
 * was stunned or floored. Keeps its HP, but at least RESCUE_MIN_HP so a
 * protester grabbed at 0 HP does not come back "free and dead", and cannot be
 * grabbed again for GRAB_IMMUNITY.
 */
export function rescue(h: Health, now: number): Health {
  if (h.status !== PlayerStatus.Grabbed) return h;
  return { ...h, status: PlayerStatus.Free, until: 0, hp: Math.max(h.hp, RESCUE_MIN_HP), grabImmuneUntil: now + GRAB_IMMUNITY };
}

/** Back in the street: free, full HP (`maxHp`), briefly invulnerable. */
export function respawn(now: number, maxHp = MAX_HP): Health {
  const max = validMaxHp(maxHp);
  return { hp: max, status: PlayerStatus.Free, until: 0, invulnerableUntil: now + RESPAWN_INVULNERABILITY, grabImmuneUntil: 0, maxHp: max };
}

/**
 * Give `amount` HP back (#14, a CGT's heal aura), up to `maxHp`. Free
 * protesters only: a grabbed, KO'd or arrested one is past a merguez.
 * Ignored for a non-positive or non-finite amount, or at full HP.
 */
export function heal(h: Health, amount: number): Health {
  if (!Number.isFinite(amount) || amount <= 0 || h.status !== PlayerStatus.Free || h.hp >= h.maxHp) return h;
  return { ...h, hp: Math.min(h.maxHp, h.hp + amount) };
}

/** What a tick changed, so the room can react (place the body on respawn, announce arrests...). */
export type HealthEvent = "arrested" | "respawned" | null;

/**
 * Advance timers to `now`: a drag or a KO that has ended becomes an arrest,
 * and an arrest that has ended becomes a respawn. At most one transition per
 * call; the next starts its own timer from `now`.
 */
export function tickHealth(h: Health, now: number): { health: Health; event: HealthEvent } {
  if (h.status === PlayerStatus.Free || now < h.until) return { health: h, event: null };
  if (h.status === PlayerStatus.Arrested) return { health: respawn(now, h.maxHp), event: "respawned" };
  // Grabbed (drag over) or KO (collapse over).
  return { health: { ...h, status: PlayerStatus.Arrested, until: now + RESPAWN_DELAY }, event: "arrested" };
}

/** Whole seconds left in the current state, for the HUD countdown (0 while free). Fits a uint8. */
export function secondsLeft(h: Health, now: number): number {
  if (h.status === PlayerStatus.Free) return 0;
  return Math.min(255, Math.max(0, Math.ceil(h.until - now - 1e-9)));
}
