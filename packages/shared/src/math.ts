import type { MoveInput } from "./messages.js";

/** Normalize a ground direction. Returns {0,0} for (near) zero or invalid input. */
export function normalizeMove(x: number, z: number): MoveInput {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { x: 0, z: 0 };
  const len = Math.hypot(x, z);
  if (len < 1e-6) return { x: 0, z: 0 };
  return { x: x / len, z: z / len };
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
