import { SCREEN_RIGHT, SCREEN_UP } from "../../shared/iso/index.ts";

/** A direction on the ground plane. */
export interface GroundDir {
  x: number;
  z: number;
}

const ZERO: GroundDir = { x: 0, z: 0 };

/**
 * The touch stick (#42) as a ground direction: (dx, dy) is the thumb's offset
 * from where it landed, in screen pixels (dy grows downwards). Goes through the
 * same isometric mapping as WASD, so "up on the stick" walks like W. The
 * direction is analog but the length is always 1 past the dead zone: the
 * server's move input is a direction, not a speed.
 */
export function stickToGround(dx: number, dy: number, deadZone: number): GroundDir {
  if (Math.hypot(dx, dy) <= deadZone) return ZERO;
  const fwd = -dy;
  const side = dx;
  const x = SCREEN_UP.x * fwd + SCREEN_RIGHT.x * side;
  const z = SCREEN_UP.z * fwd + SCREEN_RIGHT.z * side;
  const len = Math.hypot(x, z);
  return { x: x / len, z: z / len };
}

/** Where to draw the knob: the thumb's offset, kept inside the stick's ring. */
export function clampKnob(dx: number, dy: number, radius: number): { dx: number; dy: number } {
  const len = Math.hypot(dx, dy);
  if (len <= radius) return { dx, dy };
  return { dx: (dx / len) * radius, dy: (dy / len) * radius };
}

/**
 * The throw aim on touch: along the stick while it is held, otherwise zero,
 * which the server reads as "along the facing".
 */
export function touchAim(stick: GroundDir): GroundDir {
  return stick.x !== 0 || stick.z !== 0 ? { x: stick.x, z: stick.z } : ZERO;
}
