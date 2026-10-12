import { Vector3 } from "three";

/** Classic isometric view: camera yawed 45° around Y, tilted ~35.26° down. */
export const ISO_YAW = Math.PI / 4;
export const ISO_PITCH = Math.atan(1 / Math.SQRT2); // ≈ 35.26°
export const CAMERA_DISTANCE = 50;

/** Offset from the followed target to the camera position. */
export const CAMERA_OFFSET = new Vector3(
  Math.sin(ISO_YAW) * Math.cos(ISO_PITCH),
  Math.sin(ISO_PITCH),
  Math.cos(ISO_YAW) * Math.cos(ISO_PITCH),
).multiplyScalar(CAMERA_DISTANCE);

// Ground directions matching the screen. The camera sits at +X/+Z looking
// towards -X/-Z, so "up the screen" is (-1, -1) on the (x, z) ground plane,
// and "screen right" is (+1, -1).
const S = Math.SQRT1_2;
export const SCREEN_UP = { x: -S, z: -S };
export const SCREEN_RIGHT = { x: S, z: -S };

/** Frame-rate independent smoothing factor for exponential damping. */
export function damp(lambda: number, dt: number): number {
  return 1 - Math.exp(-lambda * dt);
}
