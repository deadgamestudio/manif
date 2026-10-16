/**
 * La Douane and Moluchan on the street at once (#120, #85): the kid's bubble
 * sits much lower (he is small), and when the two stand within NEAR of each
 * other it also steps aside, away from Moluchan, so the two bubbles never
 * cover the same spot. Pure, so it is tested without a scene.
 */

/** Closer than this (m, centre to centre), the kid's bubble steps aside. */
export const BUBBLE_NEAR = 3.5;
/** How far it steps aside at most (m), when they stand on the same spot. */
export const BUBBLE_STEP = 1.6;

/** The offset of the kid's bubble from above his head, in world x and z. Zero with no Moluchan or with him far. */
export function bubbleShift(x: number, z: number, mx: number | null, mz: number | null): { x: number; z: number } {
  if (mx === null || mz === null) return { x: 0, z: 0 };
  const dx = x - mx;
  const dz = z - mz;
  const d = Math.hypot(dx, dz);
  if (d >= BUBBLE_NEAR) return { x: 0, z: 0 };
  const amount = BUBBLE_STEP * (1 - d / BUBBLE_NEAR);
  // On the same spot: step towards +X.
  if (d < 1e-3) return { x: amount, z: 0 };
  return { x: (dx / d) * amount, z: (dz / d) * amount };
}
