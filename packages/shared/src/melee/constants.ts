// Melee tunables (#4). Distances in world units, angles in radians, times in
// seconds of room time.

/** Reach, from the attacker's centre to the nearest point of the target. A player is 0.4 in radius. */
export const MELEE_RANGE = 1.2;

/** Half the swing arc: targets up to this far either side of the facing are hit (±45°). */
export const MELEE_HALF_ANGLE = Math.PI / 4;

/** Time between two swings. Clicks faster than this are ignored by the server. */
export const MELEE_COOLDOWN = 0.5;

/** HP a swing takes off a prop. Prop HP (PROP_TYPES) is counted in swings. */
export const MELEE_PROP_DAMAGE = 1;
