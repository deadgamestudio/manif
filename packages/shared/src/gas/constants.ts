// Tear gas (#7): the CRS's area weapon. A canister flies for about a second,
// lands, and becomes a round cloud for a few seconds: protesters inside cough,
// lose HP slowly and walk slower. Distances in world units, durations in
// seconds of room time. Tuned for slapstick, not realism.

/** Radius of a gas cloud. Constant for the cloud's whole life (no spreading, v1). */
export const GAS_RADIUS = 3;

/** How long a cloud lasts once the canister lands. */
export const GAS_DURATION = 8;

/** HP a protester in the gas loses every GAS_DAMAGE_INTERVAL (MAX_HP is 100). */
export const GAS_DAMAGE = 3;

/** Time between two gas damage ticks. 3 HP every 0.5 s is 6 HP/s: a full cloud costs about half the HP bar. */
export const GAS_DAMAGE_INTERVAL = 0.5;

/**
 * Walking speed in the gas, as a fraction of PLAYER_SPEED. Kept so a gassed
 * protester (4.5 m/s) still outruns a CRS (4.2): the gas hurts and slows, but
 * running out of it still works (the tests hold this). The dodge (#9) is not
 * slowed at all.
 */
export const GAS_SLOW = 0.75;

/** The cough and the slow keep going this long after leaving the cloud, then stop. */
export const GAS_LINGER = 0.6;

/**
 * Most clouds alive in a room, canisters in flight included, so a long round
 * cannot fill the street (or the patches). A throw over the cap is refused.
 */
export const MAX_GAS_CLOUDS = 6;

/** Minimum time between two canisters thrown by the whole squad, so bots don't all throw on the same tick. */
export const GAS_SQUAD_INTERVAL = 4;

/** How long a canister flies, whatever the distance (a lob). */
export const CANISTER_FLIGHT_TIME = 1;

/** Collision radius of a canister in flight, against walls, obstacles and props. */
export const CANISTER_RADIUS = 0.12;

/** A bot throws only at a spot at least this far (no gassing its own feet)... */
export const GAS_MIN_RANGE = 5;

/** ...and at most this far away. */
export const GAS_MAX_RANGE = 14;

/** Free protesters that must stand within GAS_RADIUS of each other to be worth a canister. */
export const GAS_MIN_GROUP = 2;

/** The aim lands up to this far off the group's centre, at random. */
export const GAS_SCATTER = 1;
