// Hop tunables (#45). Times in seconds of room time.

/** How long a hop keeps the body off the ground. At 6 m/s that is 3 m, enough to clear a bin (1.8 m of overlap path). */
export const JUMP_DURATION = 0.5;

/** Time from the start of one hop to the next: at least 0.3 s on the ground between two hops. */
export const JUMP_COOLDOWN = 0.8;

/** Peak height of the hop arc, metres. Cosmetic only: the client draws it, the server never uses it. */
export const JUMP_HEIGHT = 0.6;

/**
 * Landing on something solid (a bin, a fallen CRS) pushes the body out to the
 * nearest free spot. If the plain push-out does not find one (a pocket between
 * a bin and a wall), rings of this spacing are searched, out to JUMP_LAND_SEARCH.
 */
export const JUMP_LAND_STEP = 0.1;
export const JUMP_LAND_SEARCH = 3;
