/*
 * What a grab pair plays (#28), from Jordan's paired clips:
 *
 *   seize ──done, standing──> hold ──moving──> groundGrab ──done──> drag
 *     └────done, moving────────────────────────────┘
 *   (grabbed lying down) ─────────────────────────────┘
 *
 * - seize: the CRS seizes the collar (`seize` / `seized`). It goes on from
 *   where the wind-up left `seize` (policeModels.tsx holds its first frames),
 *   so it plays the rest of the clip only: `seize-rest` / `seized-rest`.
 * - hold: standing, the CRS holding on (`hold-loop` / `held-loop`).
 * - groundGrab: the protester on the ground, the CRS taking the collar again
 *   (`ground-grab` / `ground-grabbed`). A protester grabbed while lying down
 *   (knocked over by the baton, the usual case) starts here: the clip starts
 *   lying, so they are not pulled upright for a second first.
 * - drag: the CRS walks backward pulling them (`ground-drag` / `ground-dragged`),
 *   the loop sped up to the pair's measured speed. Once on the ground they stay
 *   there, even standing still at the van door.
 *
 * Pure: the component calls `stepPhase` each frame and plays the clips of the
 * phase it returns.
 */

export type GrabPhase = "seize" | "hold" | "takeDown" | "groundGrab" | "drag";

/** Two paired clips, one for each body, and how they play. */
export interface PairClips {
  crs: string;
  victim: string;
  /** Loops; else plays once and holds its last frame until the next phase. */
  loop: boolean;
  /** Which pairs.json offset places the two bodies. */
  stance: "standing" | "ground";
}

export const PHASE_CLIPS: Readonly<Record<GrabPhase, PairClips>> = {
  seize: { crs: "seize-rest", victim: "seized-rest", loop: false, stance: "standing" },
  hold: { crs: "hold-loop", victim: "held-loop", loop: true, stance: "standing" },
  takeDown: { crs: "take-down", victim: "taken-down", loop: false, stance: "ground" },
  groundGrab: { crs: "ground-grab", victim: "ground-grabbed", loop: false, stance: "ground" },
  drag: { crs: "ground-drag", victim: "ground-dragged", loop: true, stance: "ground" },
};

/** Frames of `seize` the wind-up already played (policeModels.tsx WINDUP_FRAMES, at 24 fps). */
export const SEIZE_FROM_FRAME = 14;
export const CLIP_FPS = 24;
/** seize and ground-grab last 2 s as authored (manifest.json). */
const SEIZE_LENGTH = 2 - SEIZE_FROM_FRAME / CLIP_FPS;
const GROUND_GRAB_LENGTH = 2;
/**
 * The one-shots play faster than authored: the server drags from the moment
 * the grab lands, so the pair already slides along while they play.
 */
export const SEIZE_SCALE = 1.6;
export const GROUND_GRAB_SCALE = 2;
/** Above this pair speed (m/s) the drag is on. The server's drag walks at about 2.3 m/s. */
export const MOVING_FROM = 0.5;
/** ground-drag's walk as authored, m/s (LIRE-MOI: about 0.24 to 0.27). */
export const DRAG_AUTHORED_SPEED = 2.4;
/** The drag loop's speed-up, clamped: past it the feet slide (the server drags about 9× faster than authored). */
export const DRAG_SCALE_MIN = 0.2;
export const DRAG_SCALE_MAX = 4;

export interface PhaseState {
  phase: GrabPhase;
  /** Seconds of clip time played in this phase (one-shots only). */
  t: number;
}

/** The first phase: the standing seize, or the ground grab for a protester grabbed `lying` down. */
export function startPhase(lying: boolean): PhaseState {
  return { phase: lying ? "groundGrab" : "seize", t: 0 };
}

/** How fast this phase's clips play at pair speed `speed` (m/s). */
export function phaseTimeScale(phase: GrabPhase, speed: number): number {
  switch (phase) {
    case "seize":
      return SEIZE_SCALE;
    case "takeDown":
      return 1;
    case "groundGrab":
      return GROUND_GRAB_SCALE;
    case "hold":
      return 1;
    case "drag":
      return Math.min(DRAG_SCALE_MAX, Math.max(DRAG_SCALE_MIN, speed / DRAG_AUTHORED_SPEED));
  }
}

/**
 * Advance `s` by `dt` seconds at pair speed `speed` (m/s). Returns the new
 * state (a new object only when the phase changes, so `!==` tells a change).
 */
export function stepPhase(s: PhaseState, dt: number, speed: number): PhaseState {
  const moving = speed > MOVING_FROM;
  switch (s.phase) {
    case "seize": {
      const t = s.t + dt * SEIZE_SCALE;
      if (t < SEIZE_LENGTH) {
        s.t = t;
        return s;
      }
      return { phase: moving ? "takeDown" : "hold", t: 0 };
    }
    case "hold":
      return moving ? { phase: "takeDown", t: 0 } : s;
    case "takeDown": {
      const t = s.t + dt;
      if (t < 0.75) { s.t = t; return s; }
      return { phase: "drag", t: 0 };
    }
    case "groundGrab": {
      const t = s.t + dt * GROUND_GRAB_SCALE;
      if (t < GROUND_GRAB_LENGTH) {
        s.t = t;
        return s;
      }
      return { phase: "drag", t: 0 };
    }
    case "drag":
      return s;
  }
}
