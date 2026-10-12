/** Server simulation rate, in ticks per second. */
export const TICK_RATE = 30;

/** Fixed simulation step, in seconds. */
export const TICK_DT = 1 / TICK_RATE;

/** The street is a square centred on the origin, MAP_SIZE units per side. */
export const MAP_SIZE = 40;
export const MAP_HALF = MAP_SIZE / 2;

/** Player walking speed, in world units per second. */
export const PLAYER_SPEED = 6;

/** Player capsule radius, used to keep players inside the map bounds. */
export const PLAYER_RADIUS = 0.4;

export const ROOM_NAME = "street";
export const MAX_PLAYERS = 8;

export const DEFAULT_SERVER_PORT = 2567;
