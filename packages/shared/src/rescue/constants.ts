// Rescue tunables (#10). Durations in seconds of room time, distances in world
// units, impulses in m/s. Tuned for fun; GRAB_IMMUNITY lives with health.

import { HEAVY_IMPULSE, LIGHT_IMPULSE } from "../physics/index.js";

/** How long interact must be held next to a grabbed teammate to pull them free. */
export const RESCUE_TIME = 1;

/**
 * A grabbed teammate can be rescued when the two centres are at most this far
 * apart (two protesters touching are 0.8 apart). Checked every tick, so
 * walking away, or the CRS dragging them away, interrupts the rescue.
 */
export const RESCUE_RANGE = 1.8;

/** Push on the CRS that held the protester, away from them. Heavy: it falls over. */
export const RESCUE_CRS_IMPULSE = HEAVY_IMPULSE;

/** Push on the freed protester, away from the CRS: a stumble, not a fall, so they can run. */
export const RESCUE_PROTESTER_IMPULSE = LIGHT_IMPULSE;
