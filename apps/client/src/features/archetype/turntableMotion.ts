/*
 * How the role picker's live characters move (#128), as plain numbers: each
 * turns slowly on the spot, the picked one a bit faster, and it hops twice
 * for joy when it gets picked. Three-free, so it is tested on its own.
 */

/** Seconds for one full turn of a card's character. */
export const TURN_SECONDS = 8;
/** Seconds for one full turn of the picked character. */
export const PICKED_TURN_SECONDS = 4.5;
/** The happy hop when picked: two hops, the second smaller, in this many seconds. */
export const HOP_SECONDS = 0.62;
/** How high the first hop goes, in metres (a body is about 1.8 m tall). */
export const HOP_HEIGHT = 0.16;
/** Where the second, smaller hop starts, as a share of HOP_SECONDS. */
const SECOND_HOP_AT = 0.58;
/** How high the second hop goes, as a share of the first. */
const SECOND_HOP_SCALE = 0.45;

/** The turning speed in radians per second. */
export function turnSpeed(picked: boolean): number {
  return (2 * Math.PI) / (picked ? PICKED_TURN_SECONDS : TURN_SECONDS);
}

/** How high above the ground the feet are `t` seconds into the hop (0 before it, and once it is over). */
export function hopHeight(t: number): number {
  if (!(t > 0) || t >= HOP_SECONDS) return 0;
  const split = HOP_SECONDS * SECOND_HOP_AT;
  if (t < split) return HOP_HEIGHT * Math.sin((Math.PI * t) / split);
  return HOP_HEIGHT * SECOND_HOP_SCALE * Math.sin((Math.PI * (t - split)) / (HOP_SECONDS - split));
}
