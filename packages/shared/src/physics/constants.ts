// Knockback tunables (#2). Speeds are in world units (metres) per second,
// durations in seconds. The game is goofy: hits are exaggerated and bodies a
// bit floaty, so these are tuned for fun, not realism.

/**
 * Exponential drag on knockback velocity, per second. Lower is floatier.
 * A heavy hit (KNOCKDOWN_THRESHOLD and up) slides about 3.5 to 4.5 m.
 */
export const KNOCKBACK_DRAG = 2.5;

/** Constant friction on knockback velocity, in m/s². Brings slow slides to a clean stop. */
export const KNOCKBACK_FRICTION = 3;

/** Knockback velocity below this snaps to zero, in m/s. */
export const KNOCKBACK_STOP_SPEED = 0.05;

/**
 * Hard cap on knockback speed, in m/s. `moveCircle` sub-steps, so even this
 * cannot tunnel through a wall; the cap keeps stacked hits from launching a
 * body across the whole street.
 */
export const MAX_KNOCKBACK_SPEED = 30;

/** Impulses at or above this strength (m/s) also knock the body down. Below, they only push. */
export const KNOCKDOWN_THRESHOLD = 10;

/** Suggested strengths for callers (#4, #5, #8, #11). A light hit pushes, a heavy one floors. */
export const LIGHT_IMPULSE = 5;
export const HEAVY_IMPULSE = 14;

/** How long a knocked-down body stays down, in seconds. No control meanwhile. */
export const DOWN_DURATION = 1.5;

/** After getting up, how long a body cannot be knocked down again, in seconds. Pushes still apply. */
export const GETUP_IMMUNITY = 0.6;

/**
 * Restitution when a body hits a wall: the part of the velocity going into the
 * wall is reflected and scaled by this. 0 = dead stop, 1 = perfect bounce.
 */
export const WALL_BOUNCE = 0.5;

/** Below this speed into the wall (m/s) a body just stops against it instead of bouncing. */
export const WALL_BOUNCE_MIN_SPEED = 2;

/** Speed along the wall kept after a bounce (scrapes a bit). */
export const WALL_BOUNCE_TANGENT_KEEP = 0.8;
