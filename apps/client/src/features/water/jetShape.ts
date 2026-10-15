import type { Vec3 } from "../models/index.ts";
import { JET_LOOK, JET_MODEL } from "./waterVisuals.ts";

/**
 * How Jordan's water jet model is stretched over a jet of `range` metres
 * (#17, #28): its length to the range, its drop to the placeholder's sag (so
 * it ends where the reach cone ends), its width for readability; and the
 * clip speed that keeps the water flying at JET_MODEL.speed.
 */
export function jetModelFit(range: number): { scale: Vec3; timeScale: number } {
  const z = range / JET_MODEL.length;
  return {
    scale: [JET_MODEL.width, JET_LOOK.sag / JET_MODEL.sag, z],
    timeScale: range > 0 ? (JET_MODEL.speed * JET_MODEL.loop) / range : 1,
  };
}
