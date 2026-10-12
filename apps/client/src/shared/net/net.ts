import { Callbacks, Client, type Room } from "@colyseus/sdk";
import type { IRef } from "@colyseus/schema";
import {
  ClientMessage,
  DEFAULT_SERVER_PORT,
  Phase,
  ROOM_NAME,
  ServerMessage,
  normalizeMove,
  type DebugHealthPayload,
  type DebugKnockbackPayload,
  type ImpulseEvent,
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

/**
 * The game server's endpoint. `VITE_SERVER_URL` may be a full URL
 * (`ws://host:2567`) or a path such as `/colyseus`: in production the
 * client's own web server (Caddy) proxies that path to the game server, on
 * the same origin, so it resolves against the page (https gives wss). Unset
 * (dev): this host on the game server's port.
 */
function resolveServerUrl(): string {
  const configured = import.meta.env.VITE_SERVER_URL;
  if (configured?.startsWith("/")) {
    return new URL(configured, location.origin).href.replace(/^http/, "ws").replace(/\/$/, "");
  }
  return configured || `ws://${location.hostname || "localhost"}:${DEFAULT_SERVER_PORT}`;
}

const SERVER_URL = resolveServerUrl();

/**
 * Colyseus matchmaking error for a missing or locked (full) room id. In
 * production the client's Caddy re-sends it as HTTP 409, because Cloudflare
 * replaces 520-527 responses with its own error page (see apps/client/Caddyfile),
 * and the SDK takes the HTTP status as the error code.
 */
const MATCHMAKE_INVALID_ROOM_ID = 522;
const MATCHMAKE_ERROR_BEHIND_PROXY = 409;

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
/**
 * Last impulse per body (#2), from ServerMessage.Impulse. Only used to tip a
 * knocked-down avatar the right way; not state, so a missed event only costs a
 * default fall direction.
 */
const lastImpulses = new Map<string, ImpulseEvent>();
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
  if (code === MATCHMAKE_INVALID_ROOM_ID || code === MATCHMAKE_ERROR_BEHIND_PROXY) {
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
  lastImpulses.clear();

  const refresh = () => {
    if (gen === generation) update(readRoom(joined));
  };
  const callbacks = Callbacks.get(joined);
  callbacks.onAdd("players", (player, _id) => {
    callbacks.listen(player as PlayerShape & IRef, "name", refresh);
    refresh();
  });
  callbacks.onRemove("players", (_player, id) => {
    lastImpulses.delete(id);
    refresh();
  });
  callbacks.listen("phase", refresh);
  callbacks.listen("hostId", refresh);

  joined.onMessage(ServerMessage.Impulse, (event: ImpulseEvent) => {
    if (gen === generation) lastImpulses.set(event.id, event);
  });

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

  /**
   * Call `listener` whenever one of the given fields of player `id` changes.
   * For React HUDs (via useSyncExternalStore) that must not re-render every
   * frame. Returns an unsubscribe function; a no-op if the player is unknown.
   */
  watchPlayer(id: string, fields: readonly (keyof PlayerShape)[], listener: () => void): () => void {
    const player = room?.state.players.get(id) as (PlayerShape & IRef) | undefined;
    if (!room || !player) return () => undefined;
    const callbacks = Callbacks.get(room);
    const unbinds = fields.map((field) => callbacks.listen(player, field, listener, false));
    return () => {
      for (const unbind of unbinds) unbind();
    };
  },

  /** The last impulse a body received, if any. Read from useFrame. */
  getLastImpulse(id: string): ImpulseEvent | undefined {
    return lastImpulses.get(id);
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

  /** DEBUG (#2), dev builds only: ask the server to knock someone over. The server refuses it in production. */
  debugKnockback(payload: DebugKnockbackPayload) {
    if (import.meta.env.DEV) room?.send(ClientMessage.DebugKnockback, payload);
  },

  /** DEBUG (#3), dev builds only: hurt or grab yourself. The server refuses it in production. */
  debugHealth(payload: DebugHealthPayload) {
    if (import.meta.env.DEV) room?.send(ClientMessage.DebugHealth, payload);
  },

  /** Leave the room (or cancel a join in flight) and go back to the homepage. */
  leave() {
    generation++;
    pending = null;
    const previous = room;
    room = null;
    setInviteUrl(null);
    lastImpulses.clear();
    update(IDLE);
    void previous?.leave().catch(() => undefined);
  },
};
