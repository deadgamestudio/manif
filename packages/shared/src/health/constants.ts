// Health and arrest tunables (#3). Durations in seconds of room time, distances
// in world units. Tuned for fun; expect to retune once CRS (#5) exist.

/** HP a protester starts and respawns with. Synced as a uint8, so keep it <= 255. */
export const MAX_HP = 100;

/** How long a KO'd protester lies on the ground before being arrested. Not a revive window. */
export const KO_DURATION = 1.5;

/** How long an arrested protester stays in the van before coming back. */
export const RESPAWN_DELAY = 10;

/** After a respawn, hits and grabs are ignored for this long. */
export const RESPAWN_INVULNERABILITY = 2;

/** Default drag time from grab to arrest, unless rescued (#10). #5 owns the real drag and can pass its own. */
export const GRAB_DURATION = 4;

/** A protester rescued from a grab at 0 HP gets at least this much back (#10). */
export const RESCUE_MIN_HP = 1;

/**
 * After a rescue (#10), or a CRS letting go because it was stunned or floored,
 * grabs are ignored for this long, so the same CRS cannot grab again the next
 * tick. Hits still land.
 */
export const GRAB_IMMUNITY = 1.5;

/** Respawn this far (world units) behind the rearmost free protester. */
export const RESPAWN_MARGIN = 4;

/** Respawns are spread up to this far (world units) either side of the street's centre line. */
export const RESPAWN_SPREAD = 6;

/** HP taken by one debug hit (dev builds only, until real hitters exist). */
export const DEBUG_DAMAGE = 25;
