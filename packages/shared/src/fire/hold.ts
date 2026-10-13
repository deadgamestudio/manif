/**
 * The two fire actions on the interact key (#16), both a hold:
 * - pat out a burning teammate: PUT_OUT_TIME next to them;
 * - light a flammable prop: LIGHT_TIME next to it.
 *
 * Interact priority (one press or hold, the server picks): rescue a grabbed
 * teammate (#10), then pat out a burning one, then pick up an item (#8, on
 * the press), then light a prop. Lighting is a hold, so a tap to pick up a
 * pavé never lights anything; holding on after the pick-up still lights.
 *
 * The holder's action is re-picked every tick: walking out of range, the
 * target changing (the teammate is out, the prop already burns), losing
 * control or being hit (`interruptHold`) all start it again from 0.
 *
 * Pure: one `FireHold` per protester, mutated in place.
 */
import type { Vec2 } from "../physics/index.js";
import type { PropShape } from "../prop/index.js";
import { LIGHT_REACH, LIGHT_TIME, PUT_OUT_RANGE, PUT_OUT_TIME } from "./constants.js";
import { distanceToShape } from "./fire.js";

export type FireAction = { kind: "putOut"; target: string } | { kind: "light"; target: string };

/** A protester as the fire actions see them. */
export interface FireHolderView extends Vec2 {
  readonly id: string;
}

/** A teammate who might be patted out. */
export interface BurningView extends Vec2 {
  readonly id: string;
  readonly onFire: boolean;
}

/** A prop that could be lit now (the caller filters with `FireField.canIgnite`). */
export interface LightableView {
  readonly id: string;
  readonly shape: PropShape;
}

/**
 * What holding interact does for `self` right now: pat out the nearest
 * burning teammate within PUT_OUT_RANGE, else light the nearest lightable
 * prop whose edge is within `radius` + LIGHT_REACH. Ties go to the smaller id.
 * Null when neither is in reach. (A rescue, which comes first, is checked by
 * the caller.)
 */
export function pickFireAction(
  self: FireHolderView,
  radius: number,
  teammates: Iterable<BurningView>,
  props: Iterable<LightableView>,
): FireAction | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const t of teammates) {
    if (t.id === self.id || !t.onFire) continue;
    const d = Math.hypot(t.x - self.x, t.z - self.z);
    if (d > PUT_OUT_RANGE) continue;
    if (d < bestD || (d === bestD && best !== null && t.id < best)) {
      bestD = d;
      best = t.id;
    }
  }
  if (best !== null) return { kind: "putOut", target: best };
  bestD = Infinity;
  for (const p of props) {
    const d = distanceToShape(p.shape, self.x, self.z);
    if (d > radius + LIGHT_REACH) continue;
    if (d < bestD || (d === bestD && best !== null && p.id < best)) {
      bestD = d;
      best = p.id;
    }
  }
  return best === null ? null : { kind: "light", target: best };
}

export interface FireHold {
  /** Interact is held down. */
  holding: boolean;
  action: FireAction | null;
  /** Seconds held on `action`. */
  progress: number;
}

export function createFireHold(): FireHold {
  return { holding: false, action: null, progress: 0 };
}

/** Back to 0 (hit, released). Holding stays as it is. */
export function interruptHold(h: FireHold): void {
  h.action = null;
  h.progress = 0;
}

/** How long `action` must be held. */
export function holdTime(action: FireAction): number {
  return action.kind === "light" ? LIGHT_TIME : PUT_OUT_TIME;
}

/** 0..1 of the current hold, for the bar over the holder. */
export function holdRatio(h: FireHold): number {
  return h.action ? Math.min(1, h.progress / holdTime(h.action)) : 0;
}

const DONE_EPSILON = 1e-6;

/**
 * One tick of one holder (mutates `h`). `action` is what holding does right
 * now (from `pickFireAction`, or null when they can't act, a rescue comes
 * first, or nothing is in reach). A different action than last tick starts
 * from 0. Returns the action finished this tick, or null; the caller applies
 * it. A finished hold starts again from 0.
 */
export function stepFireHold(h: FireHold, action: FireAction | null, dt: number): FireAction | null {
  if (!h.holding || action === null) {
    interruptHold(h);
    return null;
  }
  if (!h.action || h.action.kind !== action.kind || h.action.target !== action.target) {
    h.action = action;
    h.progress = 0;
  }
  h.progress = Math.min(holdTime(action), h.progress + dt);
  if (h.progress < holdTime(action) - DONE_EPSILON) return null;
  interruptHold(h);
  return action;
}
