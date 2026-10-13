// Carrying and throwing teammates (#11). Distances in world units, speeds in
// m/s, durations in seconds of room time. Goofy, not realistic: a thrown
// friend is a human bowling ball.

import { DOWN_DURATION, HEAVY_IMPULSE } from "../physics/index.js";

/** A free teammate is picked up when the two centres are at most this far apart (touching is 0.8). */
export const CARRY_RANGE = 1.4;

/** A carried teammate not thrown by then wriggles free (is dropped). */
export const CARRY_DURATION = 3;

/** The carrier walks this much slower (a fraction of the walking speed). */
export const CARRY_SPEED_FACTOR = 0.7;

/** Push on a dropped teammate (wriggled free, carrier hit or gone), in a random direction: a stumble, never a fall. */
export const CARRY_DROP_PUSH = 3;

/**
 * Launch speed of a thrown teammate, m/s (under MAX_KNOCKBACK_SPEED). With the
 * knockback drag that is about 7 m of travel, most of it in the air.
 */
export const TEAMMATE_THROW_SPEED = 20;

/** Time in the air: passes over bins and fallen CRS, dodges batons, and hits CRS and props meanwhile. */
export const TEAMMATE_FLIGHT_TIME = 0.6;

/** Lying in a heap after landing, before getting up: the normal knock-down time. */
export const TEAMMATE_LAND_DOWN = DOWN_DURATION;

/** A flying teammate hits what comes this close to its edge (a raised riot shield sticks out 0.15 past the CRS). */
export const TEAMMATE_HIT_MARGIN = 0.25;

/** HP a flying teammate takes off a CRS (a pavé takes 2, a swing 1; a CRS has 6). Counts towards breaking a shield line. */
export const TEAMMATE_CRS_DAMAGE = 2;

/** Knockback on a CRS hit by a flying teammate, along the flight: floors it (it lets go of any grab). */
export const TEAMMATE_CRS_KNOCKBACK = HEAVY_IMPULSE + 2;

/** Stun on that CRS (it lets go of any grab). */
export const TEAMMATE_CRS_STUN = 1.5;

/** HP taken off a prop hit by a flying teammate (a pavé takes 1). */
export const TEAMMATE_PROP_DAMAGE = 2;

/** After hitting a CRS, the flying teammate bounces back with this fraction of its speed (it lands in a heap there). */
export const TEAMMATE_REBOUND = 0.25;
