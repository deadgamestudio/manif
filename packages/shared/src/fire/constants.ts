// Fire (#16): props set alight, the zone around them that sets people on fire,
// and the slapstick "bum on fire" status. Distances in world units, durations
// in seconds of room time. Tuned for fun, not realism.

/**
 * How long a prop at full HP burns before it is charred. A prop with less HP
 * left burns for less (same HP per second). A wreck (a smashed car, #91)
 * burns this long too, on its own fuel.
 */
export const FIRE_DURATION = 30;

/**
 * The fire's zone reaches this far beyond the prop's edge: a body within it
 * catches fire. Small on purpose, so a knocked-down body is never stuck in it
 * for long. CRS treat the prop plus this as blocked (they path around it).
 * A new fire's zone grows to this over FIRE_GROW_TIME (#91, `zoneGrowth`).
 */
export const FIRE_REACH = 0.6;

/** A fire can first spread after burning this long... */
export const FIRE_SPREAD_DELAY = 8;

/** ...and then once every this long (whether it found something to light or not). */
export const FIRE_SPREAD_COOLDOWN = 8;

/** A fire spreads only to a flammable prop at most this far away, edge to edge. */
export const FIRE_SPREAD_RADIUS = 3;

/** Most props burning at once in a room. Lighting or spreading over the cap does nothing. */
export const MAX_FIRES = 6;

/** Flames start small for this long (intensity 2), while the zone grows to full size, then roar (3)... */
export const FIRE_GROW_TIME = 2;

/** ...and die down (1) over their last seconds. */
export const FIRE_DYING_TIME = 4;

/** Hold interact this long next to a flammable prop to light it (everyone has a lighter). */
export const LIGHT_TIME = 1;

/**
 * A prop can be lit when the holder's edge is at most this far from the
 * prop's edge. As far as FIRE_REACH, so the igniter starts in the full zone:
 * the zone's growth (FIRE_GROW_TIME) is what gives them time to step away.
 */
export const LIGHT_REACH = 0.6;

/** Hold interact this long next to a burning teammate to pat them out. */
export const PUT_OUT_TIME = 0.6;

/** A burning teammate can be patted out when the two centres are at most this far apart (same as a rescue). */
export const PUT_OUT_RANGE = 1.8;

/** Walking into a fire sets a body on fire for this long (again from the start while it stays in the zone). */
export const ON_FIRE_DURATION = 4;

/** HP a burning protester loses every BURN_DAMAGE_INTERVAL (MAX_HP is 100): 4 s on fire costs 32 HP. */
export const BURN_DAMAGE = 4;
export const BURN_DAMAGE_INTERVAL = 0.5;

/** HP a burning CRS loses every CRS_BURN_DAMAGE_INTERVAL (a CRS has 6): 4 s on fire costs 2 HP. */
export const CRS_BURN_DAMAGE = 1;
export const CRS_BURN_DAMAGE_INTERVAL = 1.5;

/** A burning protester panics and runs this much faster than PLAYER_SPEED. */
export const ON_FIRE_SPEED = 1.3;
