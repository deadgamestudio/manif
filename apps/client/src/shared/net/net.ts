import { Callbacks, Client, type Room } from "@colyseus/sdk";
import type { IRef } from "@colyseus/schema";
import {
  ClientMessage,
  DEFAULT_SERVER_PORT,
  MELEE_COOLDOWN,
  Phase,
  PlayerStatus,
  ROOM_NAME,
  ServerMessage,
  normalizeMove,
  type CanisterShape,
  type CrsShape,
  type GasCloudShape,
  type DebugHealthPayload,
  type DebugKnockbackPayload,
  type GroundItemShape,
  type ProjectileShape,
  type ThrowPayload,
  type HitEvent,
  type ImpulseEvent,
  type InteractPayload,
  type LobbyJoinOptions,
  type MoveInput,
  type PlayerShape,
  type PropShapeState,
  type StreetStateShape,
  type SyncedMap,
  type ShoveEvent,
  type SwingEvent,
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
  /** Ids of the police bots on the street (#5). Changes only when one appears or is removed. */
  crs: readonly string[];
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
  crs: [],
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
/**
 * Melee and props (#4), cosmetic only: when (performance.now(), ms) each body
 * last swung, each prop was last hit, and each prop broke while we watched.
 * Read from useFrame. A missed event only skips an effect; the synced
 * `broken` flag still swaps the model.
 */
const lastSwings = new Map<string, number>();
const lastPropHits = new Map<string, number>();
/** When (performance.now(), ms) each CRS was last hit by a protester (#5). */
const lastCrsHits = new Map<string, number>();
/** When (performance.now(), ms) each CRS last shoved with its shield (#6). */
const lastShoves = new Map<string, number>();
const propBrokenAt = new Map<string, number>();
/** Local cosmetic gate so the swing animation is not replayed faster than the server allows. */
let lastLocalSwing = -Infinity;
/**
 * Throwables (#8): ids of the items on the ground and in flight. Kept out of
 * NetSnapshot so a throw re-renders only the throwables view, not the game.
 * Arrays are replaced (never mutated) on change, for useSyncExternalStore.
 */
let itemIds: readonly string[] = [];
let projectileIds: readonly string[] = [];
const itemListeners = new Set<() => void>();
function setItemIds(items: readonly string[], projectiles: readonly string[]) {
  if (items === itemIds && projectiles === projectileIds) return;
  itemIds = items;
  projectileIds = projectiles;
  for (const listener of itemListeners) listener();
}

/**
 * Tear gas (#7): ids of the clouds and canisters in flight, kept out of
 * NetSnapshot like the throwables, and when (performance.now(), ms) we first
 * saw each one, for the grow-in and the canister's lob.
 */
let gasIds: readonly string[] = [];
let canisterIds: readonly string[] = [];
const gasSeenAt = new Map<string, number>();
const gasListeners = new Set<() => void>();
function setGasIds(clouds: readonly string[], canisters: readonly string[]) {
  if (clouds === gasIds && canisters === canisterIds) return;
  gasIds = clouds;
  canisterIds = canisters;
  for (const listener of gasListeners) listener();
}

/** Bumped by every connect and leave. A stale join or a stale onLeave sees a different value and backs off. */
let generation = 0;

function clearEffects() {
  lastImpulses.clear();
  lastSwings.clear();
  lastPropHits.clear();
  lastCrsHits.clear();
  lastShoves.clear();
  propBrokenAt.clear();
  lastLocalSwing = -Infinity;
  setItemIds([], []);
  gasSeenAt.clear();
  setGasIds([], []);
}

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
  if (!state?.players) return { phase: null, hostId: null, players: [], crs: [] };
  return {
    phase: state.phase as Phase,
    hostId: state.hostId || null,
    players: Array.from(state.players.entries(), ([id, p]) => ({ id, name: p.name })),
    crs: state.crs ? Array.from(state.crs.entries(), ([id]) => id) : [],
  };
}

function attach(joined: ClientRoom, gen: number) {
  room = joined;
  lastSent = { x: 0, z: 0 };
  clearEffects();

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
    lastSwings.delete(id);
    refresh();
  });
  callbacks.onAdd("props", (prop, id) => {
    // `previous` is undefined on the first sync, so a prop that was already
    // broken when we joined swaps its model without spraying debris.
    callbacks.listen(prop as PropShapeState & IRef, "broken", (broken, previous) => {
      if (gen === generation && broken && previous === false) propBrokenAt.set(id, performance.now());
    });
  });
  callbacks.onAdd("crs", () => refresh());
  callbacks.onRemove("crs", (_crs, id) => {
    lastImpulses.delete(id);
    lastSwings.delete(id);
    lastCrsHits.delete(id);
    lastShoves.delete(id);
    refresh();
  });
  // Throwables (#8): only the id lists; positions are read live from useFrame.
  // `removed` is left out explicitly, in case the map still holds it while onRemove runs.
  const refreshItems = (removed?: string) => {
    if (gen !== generation) return;
    const state = joined.state as ClientState | undefined;
    const ids = (map: StreetStateShape["items"] | StreetStateShape["projectiles"] | undefined) =>
      map ? Array.from(map.entries(), ([id]) => id).filter((id) => id !== removed) : [];
    setItemIds(ids(state?.items), ids(state?.projectiles));
  };
  callbacks.onAdd("items", () => refreshItems());
  callbacks.onRemove("items", (_item, id) => refreshItems(id));
  callbacks.onAdd("projectiles", () => refreshItems());
  callbacks.onRemove("projectiles", (_p, id) => refreshItems(id));
  // Tear gas (#7): same pattern as the throwables.
  const refreshGas = (removed?: string) => {
    if (gen !== generation) return;
    const state = joined.state as ClientState | undefined;
    const ids = (map: SyncedMap<unknown> | undefined): string[] =>
      map ? Array.from(map.entries(), ([id]) => id).filter((id) => id !== removed) : [];
    setGasIds(ids(state?.gas), ids(state?.canisters));
  };
  callbacks.onAdd("gas", (_c, id) => {
    gasSeenAt.set(`cloud:${id}`, performance.now());
    refreshGas();
  });
  callbacks.onRemove("gas", (_c, id) => {
    gasSeenAt.delete(`cloud:${id}`);
    refreshGas(id);
  });
  callbacks.onAdd("canisters", (_c, id) => {
    gasSeenAt.set(`can:${id}`, performance.now());
    refreshGas();
  });
  callbacks.onRemove("canisters", (_c, id) => {
    gasSeenAt.delete(`can:${id}`);
    refreshGas(id);
  });
  callbacks.listen("phase", refresh);
  callbacks.listen("hostId", refresh);

  joined.onMessage(ServerMessage.Impulse, (event: ImpulseEvent) => {
    if (gen === generation) lastImpulses.set(event.id, event);
  });

  joined.onMessage(ServerMessage.Swing, (event: SwingEvent) => {
    if (gen === generation) lastSwings.set(event.id, performance.now());
  });
  joined.onMessage(ServerMessage.Shove, (event: ShoveEvent) => {
    if (gen !== generation) return;
    const now = performance.now();
    for (const id of event.ids) lastShoves.set(id, now);
  });
  joined.onMessage(ServerMessage.Hit, (event: HitEvent) => {
    if (gen !== generation) return;
    if (event.kind === "prop") lastPropHits.set(event.target, performance.now());
    else if (event.kind === "crs") lastCrsHits.set(event.target, performance.now());
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

  /** Synced state of a breakable prop (#4), by level prop id. Read from useFrame. */
  getProp(id: string): PropShapeState | undefined {
    return room?.state.props?.get(id);
  },

  /** When (performance.now()) body `id` last swung (#4), if ever. */
  getLastSwing(id: string): number | undefined {
    return lastSwings.get(id);
  },

  /** When (performance.now()) CRS `id` last shoved with its shield (#6), if ever. */
  getLastShove(id: string): number | undefined {
    return lastShoves.get(id);
  },

  /** Live, decoded state of a police bot (#5). Read from useFrame. */
  getCrs(id: string): CrsShape | undefined {
    return room?.state.crs?.get(id);
  },

  /** Call `listener` when an item appears on or leaves the ground, or a throw starts or stops (#8). */
  subscribeItems(listener: () => void): () => void {
    itemListeners.add(listener);
    return () => itemListeners.delete(listener);
  },

  /** Ids of the items on the ground (#8). Same array until one is added or removed. */
  getItemIds(): readonly string[] {
    return itemIds;
  },

  /** Ids of the thrown items in flight (#8). Same array until one is added or removed. */
  getProjectileIds(): readonly string[] {
    return projectileIds;
  },

  /** Live state of an item on the ground (#8). Read from useFrame. */
  getItem(id: string): GroundItemShape | undefined {
    return room?.state.items?.get(id);
  },

  /** Live state of a thrown item in flight (#8). Read from useFrame. */
  getProjectile(id: string): ProjectileShape | undefined {
    return room?.state.projectiles?.get(id);
  },

  /** Call `listener` when a tear gas cloud or canister (#7) appears or goes. */
  subscribeGas(listener: () => void): () => void {
    gasListeners.add(listener);
    return () => gasListeners.delete(listener);
  },

  /** Ids of the tear gas clouds (#7). Same array until one is added or removed. */
  getGasIds(): readonly string[] {
    return gasIds;
  },

  /** Ids of the tear gas canisters in flight (#7). Same array until one is added or removed. */
  getCanisterIds(): readonly string[] {
    return canisterIds;
  },

  /** Live state of a tear gas cloud (#7). Read from useFrame. */
  getGasCloud(id: string): GasCloudShape | undefined {
    return room?.state.gas?.get(id);
  },

  /** A tear gas canister in flight (#7). Read from useFrame. */
  getCanister(id: string): CanisterShape | undefined {
    return room?.state.canisters?.get(id);
  },

  /** When (performance.now()) we first saw cloud or canister `id` (#7), or undefined. */
  getGasSeenAt(kind: "cloud" | "can", id: string): number | undefined {
    return gasSeenAt.get(`${kind}:${id}`);
  },

  /** When (performance.now()) CRS `id` was last hit by a protester (#5), if ever. */
  getLastCrsHit(id: string): number | undefined {
    return lastCrsHits.get(id);
  },

  /** When (performance.now()) prop `id` was last hit (#4), if ever. */
  getLastPropHit(id: string): number | undefined {
    return lastPropHits.get(id);
  },

  /** When (performance.now()) prop `id` broke while we were in the room, if it did. */
  getPropBrokenAt(id: string): number | undefined {
    return propBrokenAt.get(id);
  },

  /**
   * Swing (#4). Plays the local swing right away (cosmetic; no prediction of
   * the hit) and asks the server, which decides what it lands on and enforces
   * the cooldown. Nothing happens while we can't act.
   */
  sendAttack() {
    if (!room || room.state.phase !== Phase.Playing) return;
    const me = room.state.players.get(room.sessionId);
    if (!me || me.down || me.status !== PlayerStatus.Free) return;
    const now = performance.now();
    if (now - lastLocalSwing >= MELEE_COOLDOWN * 1000) {
      lastLocalSwing = now;
      lastSwings.set(room.sessionId, now);
    }
    room.send(ClientMessage.Attack);
  },

  /**
   * Throw the carried item (#8) along a ground direction (the server
   * normalizes it; zero throws along the facing). Plays the arm swing locally
   * right away; the projectile itself is the server's. Not sent while we
   * can't act or carry nothing.
   */
  sendThrow(x: number, z: number) {
    if (!room || room.state.phase !== Phase.Playing) return;
    const me = room.state.players.get(room.sessionId);
    if (!me || me.down || me.status !== PlayerStatus.Free || !me.carrying) return;
    const now = performance.now();
    lastLocalSwing = now;
    lastSwings.set(room.sessionId, now);
    const payload: ThrowPayload = { x, z };
    room.send(ClientMessage.Throw, payload);
  },

  /**
   * Dodge (#9). The server picks the direction and enforces the cooldown; the
   * avatar and the HUD react to the synced `dodging` flag, so a refused press
   * shows nothing. Not sent while we can't act.
   */
  sendDodge() {
    if (!room || room.state.phase !== Phase.Playing) return;
    const me = room.state.players.get(room.sessionId);
    if (!me || me.down || me.status !== PlayerStatus.Free) return;
    room.send(ClientMessage.Dodge);
  },

  /**
   * Interact key pressed or released (#10 rescue, #8 pick-up). Always sent,
   * whatever our state: the server decides what it does, and a release must
   * never be lost or a rescue would keep going.
   */
  sendInteract(held: boolean) {
    if (!room || room.state.phase !== Phase.Playing) return;
    const payload: InteractPayload = { held };
    room.send(ClientMessage.Interact, payload);
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
    clearEffects();
    update(IDLE);
    void previous?.leave().catch(() => undefined);
  },
};
