/** Message type names sent from client to server. */
export const ClientMessage = {
  Move: "move",
  /** Host only: leave the lobby and start the march. No payload. */
  Start: "start",
  /**
   * Swing at whatever is in front (#4). No payload: the server uses its own
   * position and facing, and enforces the cooldown and the player's state.
   */
  Attack: "attack",
  /**
   * DEBUG, dev builds only: knock yourself or the nearest player over.
   * The server ignores it when NODE_ENV is "production". Remove once CRS (#5) give real hits.
   */
  DebugKnockback: "debug:knockback",
  /**
   * DEBUG, dev builds only: hurt or grab yourself to see health and arrest (#3).
   * The server ignores it when NODE_ENV is "production". Remove once CRS (#5) exist.
   */
  DebugHealth: "debug:health",
} as const;
export type ClientMessage = (typeof ClientMessage)[keyof typeof ClientMessage];

/** Move input: a direction on the ground plane (x, z), normalized or zero. */
export interface MoveInput {
  x: number;
  z: number;
}

export interface ClientMessagePayloads {
  [ClientMessage.Move]: MoveInput;
  [ClientMessage.Start]: undefined;
  [ClientMessage.Attack]: undefined;
  [ClientMessage.DebugKnockback]: DebugKnockbackPayload;
  [ClientMessage.DebugHealth]: DebugHealthPayload;
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
   * A player swung (#4), hit or miss: sent to everyone but the swinger, who
   * already plays it locally. Also a CRS baton swing (#5), sent to everyone.
   */
  Swing: "swing",
  /** A swing landed on something (#4). Not stored in Schema; lets clients flash the target. */
  Hit: "hit",
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

/** Payload of `ServerMessage.Swing`. */
export interface SwingEvent {
  /** Session id of the player who swung, or the CRS id. */
  id: string;
}

/** What a hit landed on: a prop (#4) or a police bot (#5). #10 (rescue) may add its own kind. */
export type HitTargetKind = "prop" | "crs";

/** Payload of `ServerMessage.Hit`. */
export interface HitEvent {
  /** Session id of the attacker. */
  by: string;
  kind: HitTargetKind;
  /** Prop id from the level data, or the bot's id in `state.crs`. */
  target: string;
  /** Where the swing landed, for the hit effect. */
  x: number;
  z: number;
  /** True if this hit broke the prop, or took the CRS out. The synced state is the source of truth. */
  broke: boolean;
}

export interface ServerMessagePayloads {
  [ServerMessage.Impulse]: ImpulseEvent;
  [ServerMessage.Swing]: SwingEvent;
  [ServerMessage.Hit]: HitEvent;
}

/** Options sent with `client.create()` / `client.joinById()`. */
export interface LobbyJoinOptions {
  /** Display name. The server sanitises it and falls back to a random one. */
  name?: string;
}
