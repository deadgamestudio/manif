/*
 * Which clip a protester's body plays (#28), pure. The clips come from
 * Jordan's protester libraries (animations-manifestants-v03 and -v04), which
 * every body shares; PlayerAvatar feeds this the state it draws each frame and
 * plays what comes back. No three.js here, so it is unit-tested on its own.
 *
 * Two kinds of clips:
 * - a state clip (`chooseStateClip`): what the body does for as long as a
 *   state lasts, a loop (walk, gas-cough...) or a pose held on its last frame
 *   (ko-collapse, knockdown);
 * - an action (`actionClip`): a one-shot started by an event (a swing, a
 *   dodge, getting up), which plays through unless a stronger state cuts it
 *   (`cutsAction`).
 */
import { ThrowableKind } from "@manif/shared";

/** How fast (m/s) the walk and the panic-run were authored: the feet's stride over one cycle, measured on the clips. */
export const WALK_AUTHORED_SPEED = 0.8;
export const RUN_AUTHORED_SPEED = 1.9;
/** Below this (m/s) the body stands still; above RUN_FROM it runs. Players move at 6 m/s, slowed in gas. */
export const MOVE_FROM = 0.35;
export const RUN_FROM = 3;
/** Playback speed limits, so a slow shuffle or a dodge burst never looks broken. */
const WALK_SCALE: readonly [number, number] = [0.6, 1.8];
const RUN_SCALE: readonly [number, number] = [0.8, 2.2];

export interface BodyState {
  /** Measured ground speed, m/s (no velocity is synced: the position delta between frames). */
  speed: number;
  /** KO (#3), standing (not ragdolling). */
  ko: boolean;
  /** Lying with no ragdoll slot free (#26): the knockdown clip stands in for the ragdoll. */
  lyingFallback: boolean;
  /** Carried overhead by a teammate (#11). */
  carried: boolean;
  /** Grabbed by a CRS (#5). */
  grabbed: boolean;
  /** Bum on fire (#16). */
  onFire: boolean;
  /** Holding a teammate overhead (#11). */
  carryingPlayer: boolean;
  /** Lighting a prop or patting someone out (#16). */
  fireHold: boolean;
  /** In tear gas (#7). */
  gassed: boolean;
  /** The item in hand (#8), a ThrowableKind. */
  carrying: number;
  /** The round is over (#12): the street cheers. */
  celebrating: boolean;
}

export interface ClipChoice {
  /** Bare clip name. */
  name: string;
  /** Play once and stay on the last frame (a pose held for the whole state), instead of looping. */
  hold: boolean;
  timeScale: number;
}

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

function loop(name: string, timeScale = 1): ClipChoice {
  return { name, hold: false, timeScale };
}

/** Walk or panic-run at the measured speed, `walk` standing in for the walk (carry-light...). */
function locomotion(speed: number, walk = "walk", run = "panic-run"): ClipChoice {
  if (speed >= RUN_FROM) return loop(run, clamp(speed / RUN_AUTHORED_SPEED, RUN_SCALE));
  return loop(walk, clamp(speed / WALK_AUTHORED_SPEED, WALK_SCALE));
}

/** The clip for the body's current state, strongest state first. */
export function chooseStateClip(s: BodyState): ClipChoice {
  const moving = s.speed >= MOVE_FROM;
  if (s.ko) return { name: "ko-collapse", hold: true, timeScale: 1 };
  if (s.lyingFallback) return { name: "knockdown", hold: true, timeScale: 1.4 };
  if (s.carried) return loop("carried-overhead");
  // Grabbed: flailing, as the capsule did (the paired grab clips come later, through the pose owner).
  if (s.grabbed) return loop("air-flail");
  if (s.onFire) return loop("on-fire-run", clamp(Math.max(s.speed, RUN_AUTHORED_SPEED) / RUN_AUTHORED_SPEED, RUN_SCALE));
  if (s.carryingPlayer) return moving ? locomotion(s.speed, "carry-overhead", "carry-overhead") : loop("carry-overhead", 0.5);
  if (s.fireHold) return loop("light-fire");
  if (s.gassed) return moving ? loop("gas-stagger", clamp(s.speed / WALK_AUTHORED_SPEED, WALK_SCALE)) : loop("gas-cough");
  if (s.carrying !== ThrowableKind.None && moving) {
    const carry = s.carrying === ThrowableKind.Trottinette || s.carrying === ThrowableKind.Velib ? "carry-heavy" : "carry-light";
    return locomotion(s.speed, carry, carry);
  }
  if (moving) return locomotion(s.speed);
  return loop(s.celebrating ? "celebrate" : "idle");
}

export type ActionEvent = "swing" | "dodge" | "getUp";

/**
 * How long after the item left the hand (ms) a swing still counts as its
 * throw: the swing event and the `carrying` patch arrive in either order.
 */
export const THROW_GRACE_MS = 400;

/**
 * The one-shot for an event. A swing with an item in hand (or one that has
 * just left it) is a throw. Sped up so the smash lands about when the server
 * resolves the hit (the game's swing is a quarter of a second).
 */
export function actionClip(event: ActionEvent, msSinceCarrying: number): ClipChoice {
  switch (event) {
    case "swing":
      return msSinceCarrying <= THROW_GRACE_MS ? { name: "throw", hold: false, timeScale: 2 } : { name: "melee-swing", hold: false, timeScale: 2.5 };
    case "dodge":
      return { name: "clumsy-dive", hold: false, timeScale: 1.8 };
    case "getUp":
      return { name: "get-up", hold: false, timeScale: 1.6 };
  }
}

/** States strong enough to cut an action short (being floored, grabbed, lifted). */
const CUTTING = new Set(["ko-collapse", "knockdown", "carried-overhead", "air-flail", "on-fire-run"]);

/** Whether `state` should replace the action `action` still playing. Getting up also gives way to running off. */
export function cutsAction(state: ClipChoice, action: string, speed: number): boolean {
  if (CUTTING.has(state.name)) return state.name !== action;
  return action === "get-up" && speed >= RUN_FROM;
}
