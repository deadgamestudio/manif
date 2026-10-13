export const MAX_PLAYERS = 8;

/** Longest player name, in characters, after trimming. */
export const NAME_MAX_LENGTH = 20;

/** Shortest gap between two renames from one player (#61), in milliseconds. Extra messages are dropped. */
export const RENAME_COOLDOWN_MS = 1000;

/** Query parameter of an invite link: `https://<host>/?lobby=<code>`. */
export const LOBBY_QUERY_PARAM = "lobby";
