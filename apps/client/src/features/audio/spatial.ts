/**
 * Where a sound sits for the local player (#57): how loud and how far left or
 * right. Measured from the local player's body, not the camera, so a fight
 * next to you is loud whichever camera is used; left and right follow the
 * screen, so a CRS on your left on screen is heard on the left.
 */

/** Full volume up to here (metres), so a fight around you isn't uneven. */
export const NEAR = 3;
/** Silent past here: roughly the edge of the iso view on a laptop screen. */
export const FAR = 24;
/** At this sideways distance (metres) a sound is fully on one side. */
const PAN_WIDTH = 10;
/** Never fully in one ear: harsh on headphones. */
const MAX_PAN = 0.8;

/**
 * "Screen right" on the ground plane (x, z) for the iso camera, which sits at
 * +X/+Z looking towards -X/-Z. Same value as `SCREEN_RIGHT` in shared/iso,
 * kept here so the audio code doesn't load three.js on the homepage (a test
 * checks the two agree).
 */
export const SCREEN_RIGHT = { x: Math.SQRT1_2, z: -Math.SQRT1_2 } as const;

export interface Point {
  x: number;
  z: number;
}

export interface Placement {
  /** 0..1 multiplier for the distance. */
  gain: number;
  /** -1 (left) .. 1 (right). */
  pan: number;
}

const CENTRE: Placement = { gain: 1, pan: 0 };

/**
 * Gain and pan of a sound at `source` heard by a listener at `listener`.
 * No listener (not in the street yet) or no source (a UI or round sound):
 * full volume, centred. Falls off smoothly from NEAR to silent at FAR.
 */
export function place(listener: Point | null, source: Point | null | undefined): Placement {
  if (!listener || !source) return CENTRE;
  const dx = source.x - listener.x;
  const dz = source.z - listener.z;
  const distance = Math.hypot(dx, dz);
  if (!Number.isFinite(distance)) return { gain: 0, pan: 0 };
  let gain = 1;
  if (distance >= FAR) gain = 0;
  else if (distance > NEAR) {
    const t = 1 - (distance - NEAR) / (FAR - NEAR);
    gain = t * t;
  }
  const side = dx * SCREEN_RIGHT.x + dz * SCREEN_RIGHT.z;
  const pan = Math.max(-1, Math.min(1, side / PAN_WIDTH)) * MAX_PAN;
  return { gain, pan };
}

/** A playback rate within ±`jitter` around 1, from a 0..1 random number. */
export function pitch(jitter: number, random: number): number {
  if (!(jitter > 0)) return 1;
  return 1 + (Math.min(1, Math.max(0, random)) * 2 - 1) * jitter;
}
