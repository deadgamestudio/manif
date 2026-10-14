import type { RenameRefusal } from "../lobby/index.js";
import type { RoundBoardEvent, RoundEndEvent } from "../round/index.js";
import type { LeaderboardEvent, ScoreTokenEvent } from "../score/index.js";

/** Message type names sent from client to server. */
export const ClientMessage = {
  Move: "move",
  /**
   * Host only: from `waiting` (the lobby screen), start the march (#12).
   * Refused while someone who must be ready isn't (#62, `canStart`), unless
   * the payload is `{ force: true }` (the host's "Lancer quand même").
   */
  Start: "start",
  /**
   * Mark yourself ready, or not, in the lobby (#62): `{ ready: boolean }`.
   * Only a boolean, only in `waiting`, only for the sender. The host's flag
   * is ignored (pressing Start is their "ready"). Everyone is reset to not
   * ready when the march starts.
   */
  Ready: "ready",
  /**
   * Pick an archetype (#14) in the lobby. Only the id: the server looks the
   * stats up in the shared table. Ignored outside `waiting` (locked during the
   * march and on the end screen); an unknown id picks the default.
   */
  PickArchetype: "pickArchetype",
  /**
   * Rename yourself in the lobby (#61): `{ name }`, the raw text. The server
   * cleans it (`checkRename`), refuses an empty or taken name with
   * `ServerMessage.RenameRefused`, and ignores it outside `waiting` or more
   * than once per RENAME_COOLDOWN_MS. Accepted, it shows up as the player's `name`.
   */
  Rename: "rename",
  /**
   * Host only, in the lobby (#59): fill the cortège up to MAX_PLAYERS with bot
   * protesters at the next Start, or not: `{ on: boolean }`. On by default.
   */
  FillBots: "fillBots",
  /**
   * Swing at whatever is in front (#4). No payload: the server uses its own
   * position and facing, and enforces the cooldown and the player's state.
   */
  Attack: "attack",
  /**
   * Struggle in a CRS's hold (#70): one press of the mash (attack, or the
   * touch button, while grabbed). No payload. The server ignores it unless the
   * sender is grabbed, counts at most STRUGGLE_RATE presses a second, and
   * frees them (with GRAB_IMMUNITY) once the meter is full. Never a swing:
   * an attack from a grabbed player still does nothing.
   */
  Struggle: "struggle",
  /**
   * Dodge (#9): a short burst of speed in the held move direction, or the
   * facing when standing still. No payload: the server picks the direction
   * and enforces the cooldown and the player's state (free, not knocked down).
   */
  Dodge: "dodge",
  /**
   * Hop (#45): about half a second in the air, over bins and fallen CRS (not
   * cars, walls or shield lines), and a baton swing misses. No payload: the
   * server enforces the cooldown and the player's state (free, not knocked
   * down, not dodging). Ignored outside the march.
   */
  Jump: "jump",
  /**
   * The interact key (E), sent on press (`held: true`) and on release
   * (`held: false`). No target: the server picks from its own positions.
   * On a press, a grabbed teammate in RESCUE_RANGE wins (#10: keep holding to
   * pull them free); otherwise #8 picks up the nearest item (a pavé) within
   * PICKUP_RANGE, empty-handed only. Holding matters only to
   * the rescue; a release with nothing going on is a no-op.
   */
  Interact: "interact",
  /**
   * Throw the carried item (#8) along a ground direction, from the mouse.
   * Only a direction: the server re-normalizes it (zero throws along the
   * facing), checks the thrower is carrying and has control, and spawns and
   * flies the projectile itself. #11 (throwing a grabbed teammate) reuses it.
   */
  Throw: "throw",
  /**
   * DEBUG, dev builds only: knock yourself or the nearest player over.
   * The server accepts it only when NODE_ENV is "development". Remove once CRS (#5) give real hits.
   */
  DebugKnockback: "debug:knockback",
  /**
   * DEBUG, dev builds only: hurt or grab yourself to see health and arrest (#3).
   * The server accepts it only when NODE_ENV is "development". Remove once CRS (#5) exist.
   */
  DebugHealth: "debug:health",
  /**
   * DEBUG, dev builds only (#12): jump down the street or cut the round timer,
   * to test waves, the win and the timeout without an 8-minute march.
   * The server accepts it only when NODE_ENV is "development".
   */
  DebugRound: "debug:round",
  /**
   * DEBUG, dev builds only (#84): break a shop and step inside its room, to
   * test walking in, the loot and CRS coming in after you.
   * The server accepts it only when NODE_ENV is "development".
   */
  DebugShop: "debug:shop",
} as const;
export type ClientMessage = (typeof ClientMessage)[keyof typeof ClientMessage];

/** Move input: a direction on the ground plane (x, z), normalized or zero. */
export interface MoveInput {
  x: number;
  z: number;
}

export interface ClientMessagePayloads {
  [ClientMessage.Move]: MoveInput;
  [ClientMessage.Start]: StartPayload | undefined;
  [ClientMessage.Ready]: ReadyPayload;
  [ClientMessage.PickArchetype]: PickArchetypePayload;
  [ClientMessage.Rename]: RenamePayload;
  [ClientMessage.FillBots]: FillBotsPayload;
  [ClientMessage.Attack]: undefined;
  [ClientMessage.Struggle]: undefined;
  [ClientMessage.Dodge]: undefined;
  [ClientMessage.Jump]: undefined;
  [ClientMessage.Interact]: InteractPayload;
  [ClientMessage.Throw]: ThrowPayload;
  [ClientMessage.DebugKnockback]: DebugKnockbackPayload;
  [ClientMessage.DebugHealth]: DebugHealthPayload;
  [ClientMessage.DebugRound]: DebugRoundPayload;
  [ClientMessage.DebugShop]: DebugShopPayload;
}

/**
 * DEBUG payload (#84): break shop `index` (0-based, in street order; the one
 * nearest to you when absent) if it still stands, and put yourself in its
 * room, `depth` of the way from the doorway to the back wall (0..1, default
 * 0.75), facing the street.
 */
export interface DebugShopPayload {
  index?: number;
  depth?: number;
}

/**
 * DEBUG payload (#12). `teleport` puts yourself in the middle of the street at
 * `progress` (0..1, 1 is inside the Préfecture zone); `time` sets the round
 * timer to `seconds`; `hold` keeps the current round from ending (no win or
 * loss) until the next start, for scripted tests of other features.
 */
export type DebugRoundPayload =
  | { action: "teleport"; progress: number }
  | { action: "time"; seconds: number }
  | { action: "hold" }
  /** #16: put out every fire and burning body within `radius` of yourself, like a hose (#17) would. */
  | { action: "water"; radius: number }
  /** #16: no CRS on the street and no more waves this round, for scripted tests that need a calm street. */
  | { action: "calm" }
  /** #98: the street turns hot now (CRS chase anyone), as if the tension had boiled over. Not the opposite of `calm`. */
  | { action: "hot" }
  /** #13: no bots on the street right now, but the waves still to come still come. */
  | { action: "clear" }
  /** #45: a CRS lying out cold `distance` m in front of yourself for `seconds`, to hop over it. */
  | { action: "fallen"; distance: number; seconds: number }
  /**
   * #45: an ordinary CRS standing `distance` m in front of yourself, facing you, to test a baton swing against a hop.
   * #13: `kind` another unit type (`CrsKind`); a BAC blends in for `blend` seconds when given.
   */
  | { action: "crs"; distance: number; kind?: number; blend?: number }
  /**
   * #17: tune the fire brigade for scripted tests, until the next round: `delay` seconds before a truck sets off,
   * `crew` pompiers per truck, `spray` the accidental spray chance per second (0 turns it off), `extra` seconds of
   * fire before another truck comes, `soak` the hose's water per second (a slow hose keeps a pompier busy). Each is optional.
   */
  | { action: "brigade"; delay?: number; crew?: number; spray?: number; extra?: number; soak?: number }
  /**
   * #85: Jeun-Lac Moluchan turns up now, whatever the roll (unless he is already on the street), `distance` m in front of
   * yourself (absent: by his usual way in), rallying for `seconds` (absent: MOLUCHAN.duration).
   */
  | { action: "moluchan"; distance?: number; seconds?: number };

/** Payload of `ClientMessage.PickArchetype`: an `Archetype` id. */
export interface PickArchetypePayload {
  archetype: number;
}

/** Payload of `ClientMessage.Start` (#62): `force` starts even with players not ready. Host only. */
export interface StartPayload {
  force?: boolean;
}

/** Payload of `ClientMessage.Ready` (#62). */
export interface ReadyPayload {
  ready: boolean;
}

/** Payload of `ClientMessage.FillBots` (#59). */
export interface FillBotsPayload {
  on: boolean;
}

/** Payload of `ClientMessage.Rename`: the name as typed. The server cleans it. */
export interface RenamePayload {
  name: string;
}

/** Payload of `ServerMessage.RenameRefused`, sent to the renaming player only. */
export interface RenameRefusedEvent {
  reason: Exclude<RenameRefusal, "locked">;
}

/** Payload of `ClientMessage.Interact`: the key went down (true) or up (false). */
export interface InteractPayload {
  held: boolean;
}

/** Payload of `ClientMessage.Throw`: the aim, a ground direction (any length; the server normalizes it). */
export interface ThrowPayload {
  x: number;
  z: number;
}

/** DEBUG payload (#3). `damage` takes DEBUG_DAMAGE HP off yourself; `grab` grabs yourself for the default drag time. */
export interface DebugHealthPayload {
  action: "damage" | "grab";
}

/** DEBUG payload. `strength` defaults to HEAVY_IMPULSE and is capped by the server. */
export interface DebugKnockbackPayload {
  target: "self" | "nearest";
  strength?: number;
}

/** Message type names broadcast from server to clients. */
export const ServerMessage = {
  /** A body (protester or CRS) received an impulse. Not stored in Schema; lets clients tip it the right way. */
  Impulse: "impulse",
  /**
   * A player swung (#4) or threw (#8), hit or miss: sent to everyone but the
   * swinger, who already plays it locally. Also a CRS baton swing (#5) and a
   * bot protester's swing or throw (#59), sent to everyone.
   */
  Swing: "swing",
  /** A swing landed on something (#4). Not stored in Schema; lets clients flash the target. */
  Hit: "hit",
  /** Shield line members (#6) shoved protesters: lets clients thrust their shields. The pushes come as Impulse events. */
  Shove: "shove",
  /** The round just ended (#12): result, time and per-player numbers for the end screen. Sent once; not in Schema. */
  RoundEnd: "round:end",
  /** The round's live counts for the Tab scoreboard (#63): at most once a second, only on change, only while marching. Not in Schema. */
  RoundBoard: "round:board",
  /** Your rename (#61) was refused: the name is empty or taken. Only to the sender; your name stays as it was. */
  RenameRefused: "rename:refused",
  /**
   * Your device token (#41): only to you, right after a join that sent none
   * (or a malformed one). Keep it and send it on every join; your lasting
   * total belongs to it. Never broadcast, never in Schema.
   */
  ScoreToken: "score:token",
  /** The lasting leaderboard (#41), to one player: the top and their own line. After a join, a banked round and a rename. */
  Leaderboard: "score:leaderboard",
  /**
   * A CRS LBD fired (#73): where from and which way. Clients fly the ball
   * themselves at the unit's `ballSpeed` until the matching `LbdImpact`. Not in Schema.
   */
  LbdShot: "lbd:shot",
  /** That ball stopped (#73): on a protester (`hit`), or on a wall, a prop, a CRS or the ground. The knockdown comes as an Impulse. */
  LbdImpact: "lbd:impact",
} as const;
export type ServerMessage = (typeof ServerMessage)[keyof typeof ServerMessage];

/** Payload of `ServerMessage.Impulse`. */
export interface ImpulseEvent {
  /** Session id of the body that was hit, or a CRS id. */
  id: string;
  /** Unit ground direction of the push. */
  dirX: number;
  dirZ: number;
  /** Strength in m/s. */
  strength: number;
  /** True if this impulse knocked the body down. */
  down: boolean;
}

/** Payload of `ServerMessage.LbdShot` (#73). */
export interface LbdShotEvent {
  /** The ball's id, matched by its `LbdImpact`. */
  id: string;
  /** The CRS that fired. */
  by: string;
  /** Start point and unit ground direction. */
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
}

/** Payload of `ServerMessage.LbdImpact` (#73). */
export interface LbdImpactEvent {
  /** The ball's id, from its `LbdShot`. */
  id: string;
  /** Where it stopped. */
  x: number;
  z: number;
  /** The protester it knocked down (session id), or "" when it hit something else or dropped. */
  hit: string;
}

/** Payload of `ServerMessage.Swing`. */
export interface SwingEvent {
  /** Session id of the player who swung, or the CRS id. */
  id: string;
}

/** What a hit landed on: a prop (#4) or a police bot (#5), by a swing or a thrown item (#8). */
export type HitTargetKind = "prop" | "crs";

/** Payload of `ServerMessage.Hit`. */
export interface HitEvent {
  /** Session id of the attacker (the thrower, for a thrown item). */
  by: string;
  kind: HitTargetKind;
  /** Prop id from the level data, or the bot's id in `state.crs`. */
  target: string;
  /** Where the swing or the thrown item landed, for the hit effect. */
  x: number;
  z: number;
  /** True if this hit broke the prop, or took the CRS out. The synced state is the source of truth. */
  broke: boolean;
}

/** Payload of `ServerMessage.Shove`. */
export interface ShoveEvent {
  /** Ids of the CRS that shoved this tick. */
  ids: string[];
}

export interface ServerMessagePayloads {
  [ServerMessage.Shove]: ShoveEvent;
  [ServerMessage.RoundEnd]: RoundEndEvent;
  [ServerMessage.RoundBoard]: RoundBoardEvent;
  [ServerMessage.RenameRefused]: RenameRefusedEvent;
  [ServerMessage.ScoreToken]: ScoreTokenEvent;
  [ServerMessage.Leaderboard]: LeaderboardEvent;
  [ServerMessage.Impulse]: ImpulseEvent;
  [ServerMessage.Swing]: SwingEvent;
  [ServerMessage.Hit]: HitEvent;
}

/** Options sent with `client.create()` / `client.joinById()`. */
export interface LobbyJoinOptions {
  /** Display name. The server sanitises it and falls back to a random one. */
  name?: string;
  /**
   * The device token this browser was given (#41, `ServerMessage.ScoreToken`).
   * The lasting total belongs to it; the server keeps only its hash. Missing
   * or malformed: a new one is issued and the total starts at 0.
   */
  token?: string;
}
