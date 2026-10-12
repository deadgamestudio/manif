import { Callbacks, Client, type Room } from "@colyseus/sdk";
import type { IRef } from "@colyseus/schema";
import {
  ClientMessage,
  DEFAULT_SERVER_PORT,
  Phase,
  ROOM_NAME,
  normalizeMove,
  type LobbyJoinOptions,
  type MoveInput,
  type PlayerShape,
  type StreetStateShape,
} from "@manif/shared";
import { setInviteUrl } from "./invite.ts";

/**
 * - idle: on the homepage, no room.
 * - connecting: a create/join is in flight.
 * - connected: in a room (lobby or street, see `phase`).
 * - error: the last create/join failed or the room was lost; `error` says why.
 */
export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

export interface LobbyPlayer {
  id: string;
  name: string;
}

export interface NetSnapshot {
  status: ConnectionStatus;
  sessionId: string | null;
  /** The lobby code (Colyseus room id) while in a room. */
  roomId: string | null;
  /** null until the first state snapshot is decoded. */
  phase: Phase | null;
  hostId: string | null;
  /** Players in join order. Changes only on join/leave, never per frame. */
  players: readonly LobbyPlayer[];
  /** Readable message for the homepage. */
  error: string | null;
}

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ?? `ws://${location.hostname || "localhost"}:${DEFAULT_SERVER_PORT}`;

/** Colyseus matchmaking error for a missing or locked (full) room id. */
const MATCHMAKE_INVALID_ROOM_ID = 522;

/** Decoded state: the plain shape from shared, plus the decoder's ref marker. */
type ClientState = StreetStateShape & IRef;
type ClientRoom = Room<unknown, ClientState>;

const IDLE: NetSnapshot = {
  status: "idle",
  sessionId: null,
  roomId: null,
  phase: null,
  hostId: null,
  players: [],
  error: null,
};

// The connection is module state, not React state: StrictMode double effects
// and re-renders can't create a second one. At most one room at a time.
let room: ClientRoom | null = null;
let snapshot: NetSnapshot = IDLE;
const listeners = new Set<() => void>();
let lastSent: MoveInput = { x: 0, z: 0 };
/** The create/join in flight, if any. A second call while it runs gets the same promise. */
let pending: Promise<void> | null = null;
/** Bumped by every connect and leave. A stale join or a stale onLeave sees a different value and backs off. */
let generation = 0;

function update(patch: Partial<NetSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

/** Turns a matchmaking failure into a message for the homepage. */
function describeJoinError(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  const message = err instanceof Error ? err.message : String(err);
  if (code === MATCHMAKE_INVALID_ROOM_ID) {
    if (/locked/i.test(message)) return "Cette manif est complète (8 manifestants max). Lance la tienne !";
    return "Code inconnu, ou cette manif s'est déjà dispersée. Vérifie le code ou crée ta propre manif.";
  }
  if (err instanceof TypeError || /fetch|network|ECONNREFUSED|websocket/i.test(message)) {
    return "Impossible de joindre le serveur. Il fait peut-être grève ?";
  }
  return `Ça n'a pas marché : ${message}`;
}

/** Reads the lobby view of the state. Cheap; called only on joins, leaves and phase/host changes. */
function readRoom(r: ClientRoom): Partial<NetSnapshot> {
  const state = r.state as ClientState | undefined;
  // state can be empty until the first full snapshot is decoded
  if (!state?.players) return { phase: null, hostId: null, players: [] };
  return {
    phase: state.phase as Phase,
    hostId: state.hostId || null,
    players: Array.from(state.players.entries(), ([id, p]) => ({ id, name: p.name })),
  };
}

function attach(joined: ClientRoom, gen: number) {
  room = joined;
  lastSent = { x: 0, z: 0 };

  const refresh = () => {
    if (gen === generation) update(readRoom(joined));
  };
  const callbacks = Callbacks.get(joined);
  callbacks.onAdd("players", (player, _id) => {
    callbacks.listen(player as PlayerShape & IRef, "name", refresh);
    refresh();
  });
  callbacks.onRemove("players", refresh);
  callbacks.listen("phase", refresh);
  callbacks.listen("hostId", refresh);

  joined.onLeave(() => {
    // Our own leave() already reset everything; only react to an unexpected loss.
    if (gen !== generation) return;
    room = null;
    setInviteUrl(null);
    update({ ...IDLE, status: "error", error: "Connexion perdue : la manif s'est dispersée sans toi." });
  });
  joined.onError((code, message) => {
    console.warn(`[net] room error ${code}: ${message ?? "unknown"}`);
  });

  setInviteUrl(joined.roomId);
  update({ status: "connected", sessionId: joined.sessionId, roomId: joined.roomId, error: null, ...readRoom(joined) });
}

/**
 * Runs one create/join. Idempotent while connecting (double clicks and
 * StrictMode effects share the same attempt), and leaves the current room
 * first, so a player is never in two lobbies.
 */
function connect(action: (client: Client) => Promise<ClientRoom>): Promise<void> {
  if (pending) return pending;
  const attempt = (async () => {
    const previous = room;
    room = null;
    const gen = ++generation;
    update({ ...IDLE, status: "connecting" });
    if (previous) await previous.leave().catch(() => undefined);
    if (gen !== generation) return;

    try {
      const joined = await action(new Client(SERVER_URL));
      if (gen !== generation) {
        // leave() was called while we were joining: don't keep a ghost player.
        void joined.leave().catch(() => undefined);
        return;
      }
      attach(joined, gen);
    } catch (err) {
      if (gen !== generation) return;
      setInviteUrl(null);
      update({ ...IDLE, status: "error", error: describeJoinError(err) });
    }
  })();
  pending = attempt;
  void attempt.finally(() => {
    if (pending === attempt) pending = null;
  });
  return attempt;
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

  /** Create a private lobby and join it as host. */
  createLobby(name: string): Promise<void> {
    const options: LobbyJoinOptions = { name };
    return connect((client) => client.create<ClientState>(ROOM_NAME, options));
  },

  /** Join a lobby by its code. Already in that lobby: nothing to do. */
  joinLobby(code: string, name: string): Promise<void> {
    if (room && room.roomId === code && !pending) return Promise.resolve();
    const options: LobbyJoinOptions = { name };
    return connect((client) => client.joinById<ClientState>(code, options));
  },

  /** Host only (the server checks): lobby -> street for everyone. */
  start() {
    room?.send(ClientMessage.Start);
  },

  /** Leave the room (or cancel a join in flight) and go back to the homepage. */
  leave() {
    generation++;
    pending = null;
    const previous = room;
    room = null;
    setInviteUrl(null);
    update(IDLE);
    void previous?.leave().catch(() => undefined);
  },
};
