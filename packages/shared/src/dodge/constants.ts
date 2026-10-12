// Dodge tunables (#9). Times in seconds of room time. Speeds are factors of the
// body's walking speed, so a faster or slower archetype (#14) dodges in
// proportion without new constants.

/** Speed during a dodge, as a multiple of the walking speed (6 m/s -> 18 m/s). */
export const DODGE_SPEED_FACTOR = 3;

/** How long the burst lasts. 0.3 s at 18 m/s is about 5.4 m, three times a walk. */
export const DODGE_DURATION = 0.3;

/** Time from the start of one dodge to the next. Presses before that are ignored by the server. */
export const DODGE_COOLDOWN = 3;

/**
 * A dodge that hits a wall or a prop with at least this fraction of its speed
 * going into it (about head-on, within 60°) bonks: the burst ends, the body
 * bounces back and is knocked down for DODGE_BONK_DOWN. Glancing hits slide
 * along and keep going.
 */
export const DODGE_BONK_FACTOR = 0.5;

/** How long a bonk knocks the body down. Shorter than a real hit (DOWN_DURATION). */
export const DODGE_BONK_DOWN = 0.8;
