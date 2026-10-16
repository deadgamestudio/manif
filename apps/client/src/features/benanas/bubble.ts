/**
 * Bénanas next to Moluchan or La Douane (#123, #85, #120): their speech
 * bubbles sit at about the same height, so when he stands near either one
 * his bubble steps aside, away from each (the shifts add up, capped), the
 * same way La Douane's steps aside from Moluchan's. His also sits a little
 * higher (BenanasView). Pure, so it is tested without a scene.
 */

/** Closer than this (m, centre to centre) to one of them, his bubble steps aside. */
export const BUBBLE_NEAR = 3.5;
/** How far it steps aside from one of them at most (m), when they stand on the same spot. */
export const BUBBLE_STEP = 1.6;
/** At most this far aside in all (m), even with both of them on top of him. */
export const BENANAS_BUBBLE_MAX = BUBBLE_STEP * 1.25;

/** The offset of his bubble from above his head, in world x and z, from the others on the street (null: not there). */
export function benanasBubbleShift(x: number, z: number, others: readonly ({ x: number; z: number } | null | undefined)[]): { x: number; z: number } {
  let sx = 0;
  let sz = 0;
  for (const o of others) {
    if (!o) continue;
    const dx = x - o.x;
    const dz = z - o.z;
    const d = Math.hypot(dx, dz);
    if (d >= BUBBLE_NEAR) continue;
    const amount = BUBBLE_STEP * (1 - d / BUBBLE_NEAR);
    // On the same spot: step towards -X (La Douane's goes +X).
    if (d < 1e-3) sx -= amount;
    else {
      sx += (dx / d) * amount;
      sz += (dz / d) * amount;
    }
  }
  const d = Math.hypot(sx, sz);
  if (d > BENANAS_BUBBLE_MAX) {
    sx = (sx / d) * BENANAS_BUBBLE_MAX;
    sz = (sz / d) * BENANAS_BUBBLE_MAX;
  }
  return { x: sx, z: sz };
}
