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

// Struggling free (#70): a grabbed protester mashes attack (or the touch
// button) to break out of the CRS's hold on their own. Slower than a
// teammate's rescue (RESCUE_TIME), on purpose: helping each other stays the
// best way out.

/** Seconds of mashing at STRUGGLE_RATE presses a second to fill the meter and break free. */
export const STRUGGLE_TIME = 3;

/**
 * Presses a second that count, at most: a press closer than 1/STRUGGLE_RATE
 * after the last counted one is ignored (a macro gains nothing over a fast thumb).
 */
export const STRUGGLE_RATE = 8;

/** With no press for this long, the meter starts draining. */
export const STRUGGLE_GRACE = 0.4;

/** How fast an idle meter drains, in meters a second (1 is a full meter). */
export const STRUGGLE_DRAIN = 0.5;

/** Push on the CRS a protester struggles free from (#70), away from them: it stumbles back a step, never falls. */
export const STRUGGLE_FREE_CRS_IMPULSE = LIGHT_IMPULSE;
