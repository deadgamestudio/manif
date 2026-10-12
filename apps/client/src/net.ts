import { Callbacks, Client, type Room } from "@colyseus/sdk";
import type { IRef } from "@colyseus/schema";
import {
  ClientMessage,
  DEFAULT_SERVER_PORT,
  ROOM_NAME,
  normalizeMove,
  type MoveInput,
  type PlayerShape,
  type StreetStateShape,
} from "@manif/shared";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface NetSnapshot {
  status: ConnectionStatus;
  sessionId: string | null;
  /** Ids of players currently in the room. Changes only on join/leave. */
  playerIds: readonly string[];
  error: string | null;
}

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ?? `ws://${location.hostname || "localhost"}:${DEFAULT_SERVER_PORT}`;

/** Decoded state: the plain shape from shared, plus the decoder's ref marker. */
type ClientState = StreetStateShape & IRef;

let room: Room<unknown, ClientState> | null = null;
let snapshot: NetSnapshot = { status: "connecting", sessionId: null, playerIds: [], error: null };
const listeners = new Set<() => void>();
let lastSent: MoveInput = { x: 0, z: 0 };
let started = false;

function update(patch: Partial<NetSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

export const net = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): NetSnapshot {
    return snapshot;
  },

  /**
   * Live, decoded player state. Its fields are updated in place by the SDK
   * whenever a patch arrives, so read it from useFrame rather than React state.
   */
  getPlayer(id: string): PlayerShape | undefined {
    return room?.state.players.get(id);
  },

  /** Send a move direction, only if it differs from the last one sent. */
  sendMove(x: number, z: number) {
    const dir = normalizeMove(x, z);
    if (!room || (dir.x === lastSent.x && dir.z === lastSent.z)) return;
    lastSent = dir;
    room.send(ClientMessage.Move, dir);
  },

  /** Connect once for the lifetime of the page. */
  async start() {
    if (started) return;
    started = true;
    update({ status: "connecting" });

    try {
      const client = new Client(SERVER_URL);
      const joined = await client.joinOrCreate<ClientState>(ROOM_NAME);
      room = joined;
      lastSent = { x: 0, z: 0 };

      const refreshIds = () => {
        // state can be empty until the first full snapshot is decoded
        const players = joined.state?.players;
        update({ playerIds: players ? Array.from(players.entries(), ([id]) => id) : [] });
      };
      const callbacks = Callbacks.get(joined);
      callbacks.onAdd("players", refreshIds);
      callbacks.onRemove("players", refreshIds);

      joined.onLeave((code) => {
        room = null;
        update({ status: "disconnected", playerIds: [], error: `left (code ${code})` });
      });
      joined.onError((code, message) => {
        update({ status: "error", error: `${code}: ${message ?? "unknown error"}` });
      });

      update({ status: "connected", sessionId: joined.sessionId, error: null });
      refreshIds();
    } catch (err) {
      update({ status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  },
};
