/** Message type names sent from client to server. */
export const ClientMessage = {
  Move: "move",
  /** Host only: leave the lobby and start the march. No payload. */
  Start: "start",
  /**
   * DEBUG, dev builds only: knock yourself or the nearest player over.
   * The server ignores it when NODE_ENV is "production". Remove once real hits exist (#4).
   */
  DebugKnockback: "debug:knockback",
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
  [ClientMessage.DebugKnockback]: DebugKnockbackPayload;
}

/** DEBUG payload. `strength` defaults to HEAVY_IMPULSE and is capped by the server. */
export interface DebugKnockbackPayload {
  target: "self" | "nearest";
  strength?: number;
}

/** Message type names broadcast from server to clients. */
export const ServerMessage = {
  /** A body received an impulse. Not stored in Schema; lets clients tip it the right way. */
  Impulse: "impulse",
} as const;
export type ServerMessage = (typeof ServerMessage)[keyof typeof ServerMessage];

/** Payload of `ServerMessage.Impulse`. */
export interface ImpulseEvent {
  /** Session id of the body that was hit. */
  id: string;
  /** Unit ground direction of the push. */
  dirX: number;
  dirZ: number;
  /** Strength in m/s. */
  strength: number;
  /** True if this impulse knocked the body down. */
  down: boolean;
}

export interface ServerMessagePayloads {
  [ServerMessage.Impulse]: ImpulseEvent;
}

/** Options sent with `client.create()` / `client.joinById()`. */
export interface LobbyJoinOptions {
  /** Display name. The server sanitises it and falls back to a random one. */
  name?: string;
}
