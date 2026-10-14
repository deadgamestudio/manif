import { Callbacks, Client, type Room } from "@colyseus/sdk";
import type { IRef } from "@colyseus/schema";
import {
  ClientMessage,
  DEFAULT_SERVER_PORT,
  MOLUCHAN_ID,
  MELEE_COOLDOWN,
  Phase,
  PlayerStatus,
  ROOM_NAME,
  RoundResult,
  ServerMessage,
  normalizeMove,
  shopLotOf,
  type ShopLot,
  type CanisterShape,
  type CrsShape,
  type GasCloudShape,
  type FireShape,
  type TruckShape,
  type MoluchanShape,
  type MoluchanPhase,
  type DebugHealthPayload,
  type DebugKnockbackPayload,
  type DebugRoundPayload,
  type GroundItemShape,
  type ProjectileShape,
  type ThrowPayload,
  type HitEvent,
  type ImpulseEvent,
  type InteractPayload,
  type LbdImpactEvent,
  type LbdShotEvent,
  type LobbyJoinOptions,
  type MoveInput,
  type PickArchetypePayload,
  type ReadyPayload,
  type FillBotsPayload,
  type RenamePayload,
  type StartPayload,
  type RenameRefusedEvent,
  type PlayerShape,
  type PropShapeState,
  type StreetStateShape,
  type SyncedMap,
  type ShoveEvent,
  type SwingEvent,
  type RoundBoardEvent,
  type RoundEndEvent,
  type LeaderboardEvent,
  type ScoreTokenEvent,
} from "@manif/shared";
import { setInviteUrl } from "./invite.ts";
import { loadToken, saveToken } from "./token.ts";

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
  /** The archetype picked in the lobby (#14), an `Archetype`. */
  archetype: number;
  /** Marked ready in the lobby (#62). Read through `canStart`, which ignores the host's flag. */
  ready: boolean;
}

export interface NetSnapshot {
  status: ConnectionStatus;
  sessionId: string | null;
  /** The lobby code (Colyseus room id) while in a room. */
  roomId: string | null;
  /** null until the first state snapshot is decoded. */
  phase: Phase | null;
  hostId: string | null;
  /** Players in join order. Changes only on join/leave, never per frame. Bots (#59, `isBotId`) only during the march. */
  players: readonly LobbyPlayer[];
  /** The host's toggle (#59): the cortège fills up with bots at the next Start. */
  fillBots: boolean;
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
/** The server refused to create a lobby: this visitor made too many, or the server has too many. */
const MATCHMAKE_TOO_MANY_LOBBIES = 429;
const MATCHMAKE_SERVER_FULL = 503;

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
  fillBots: true,
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
/**
 * LBD balls (#73), cosmetic only: each shot as it arrived (performance.now(),
 * ms) and its impact once that arrives. The ball itself is flown on the
 * client from the shot; read from useFrame. Old ones are dropped on the next shot.
 */
export interface LbdBall {
  shot: LbdShotEvent;
  firedAt: number;
  impact: LbdImpactEvent | null;
  impactAt: number;
}
const lbdBalls = new Map<string, LbdBall>();
/** A ball older than this is gone for good (it flies under a second, then puffs). */
const LBD_BALL_TTL_MS = 4000;
/** When (performance.now(), ms) each CRS LBD last fired (#73), for the recoil. */
const lastLbdShots = new Map<string, number>();
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

/**
 * Fire (#16): ids of the burning props, kept out of NetSnapshot like the gas,
 * and when (performance.now(), ms) we first saw each one, for the flare-up.
 */
let fireIds: readonly string[] = [];
const fireSeenAt = new Map<string, number>();
const fireListeners = new Set<() => void>();
function setFireIds(ids: readonly string[]) {
  if (ids === fireIds) return;
  fireIds = ids;
  for (const listener of fireListeners) listener();
}

/** Fire trucks (#17): their ids, kept out of NetSnapshot like the fires. */
let truckIds: readonly string[] = [];
const truckListeners = new Set<() => void>();
function setTruckIds(ids: readonly string[]) {
  if (ids === truckIds) return;
  truckIds = ids;
  for (const listener of truckListeners) listener();
}

/**
 * Jeun-Lac Moluchan (#85): his phase while he is on the street, null when he
 * isn't, kept out of NetSnapshot like the trucks. Changes when he arrives,
 * starts leaving, is grabbed and is gone: a handful of times a round.
 */
let moluchanPhase: MoluchanPhase | null = null;
const moluchanListeners = new Set<() => void>();
function setMoluchanPhase(phase: MoluchanPhase | null) {
  if (phase === moluchanPhase) return;
  moluchanPhase = phase;
  for (const listener of moluchanListeners) listener();
}

/**
 * The round (#12): timer, progress and result, kept out of NetSnapshot so the
 * once-a-second countdown re-renders only the HUD, not the game. `end` is the
 * last ServerMessage.RoundEnd seen in this room (null after joining). `board`
 * is the last ServerMessage.RoundBoard of this march (#63), for the Tab
 * scoreboard; null outside the march. The object is replaced (never mutated)
 * on change, for useSyncExternalStore.
 */
export interface RoundView {
  timeLeft: number;
  progress: number;
  /** The street turned hot this round (#98): the CRS chase anyone. */
  hot: boolean;
  result: RoundResult;
  end: RoundEndEvent | null;
  board: RoundBoardEvent | null;
}
const NO_ROUND: RoundView = { timeLeft: 0, progress: 0, hot: false, result: RoundResult.None, end: null, board: null };
let roundView: RoundView = NO_ROUND;
const roundListeners = new Set<() => void>();
function setRound(patch: Partial<RoundView>) {
  roundView = { ...roundView, ...patch };
  for (const listener of roundListeners) listener();
}

/**
 * The lasting leaderboard (#41), as the server last sent it to us: after our
 * join, after a banked round, after a rename. Null until the first one in this
 * room. Replaced (never mutated), for useSyncExternalStore.
 */
let leaderboard: LeaderboardEvent | null = null;
const leaderboardListeners = new Set<() => void>();
function setLeaderboard(next: LeaderboardEvent | null) {
  if (next === leaderboard) return;
  leaderboard = next;
  for (const listener of leaderboardListeners) listener();
}

/**
 * The server's event messages as they arrive (and our own swing, which the
 * server doesn't echo back), for the sound layer (#57). Not state: a missed
 * one only costs a sound.
 */
export type NetEvent =
  | { type: "swing"; id: string }
  | { type: "hit"; event: HitEvent }
  | { type: "shove"; ids: readonly string[] }
  | { type: "impulse"; event: ImpulseEvent }
  | { type: "lbdShot"; event: LbdShotEvent }
  | { type: "lbdImpact"; event: LbdImpactEvent }
  | { type: "roundEnd"; event: RoundEndEvent };
const eventListeners = new Set<(event: NetEvent) => void>();
function emit(event: NetEvent) {
  for (const listener of eventListeners) listener(event);
}

/** Who wants to hear that our rename was refused (#61): the lobby's name field. */
const renameListeners = new Set<(event: RenameRefusedEvent) => void>();

/**
 * Shops (#83): the round's generated shops, decoded from the synced props.
 * Replaced (never mutated) when a new layout arrives, for useSyncExternalStore;
 * the shops never change mid-round, so this changes once per round at most.
 */
let shops: readonly ShopLot[] = [];
const shopListeners = new Set<() => void>();
function setShops(next: readonly ShopLot[]) {
  const same = next.length === shops.length && next.every((s, i) => s.id === shops[i]!.id);
  if (same) return;
  shops = next;
  for (const listener of shopListeners) listener();
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
  lbdBalls.clear();
  lastLbdShots.clear();
  lastLocalSwing = -Infinity;
  setItemIds([], []);
  gasSeenAt.clear();
  setGasIds([], []);
  fireSeenAt.clear();
  setFireIds([]);
  setShops([]);
  setTruckIds([]);
  setMoluchanPhase(null);
  setRound(NO_ROUND);
  setLeaderboard(null);
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
  // The server's lobby creation limits (per visitor, then for the whole server).
  if (code === MATCHMAKE_TOO_MANY_LOBBIES) return "Trop de manifs créées, réessaie dans un moment.";
  if (code === MATCHMAKE_SERVER_FULL) return "Trop de manifs en cours sur le serveur, réessaie dans un moment.";
  if (err instanceof TypeError || /fetch|network|ECONNREFUSED|websocket/i.test(message)) {
    return "Impossible de joindre le serveur. Il fait peut-être grève ?";
  }
  return `Ça n'a pas marché : ${message}`;
}

/** Reads the lobby view of the state. Cheap; called only on joins, leaves and phase/host changes. */
function readRoom(r: ClientRoom): Partial<NetSnapshot> {
  const state = r.state as ClientState | undefined;
  // state can be empty until the first full snapshot is decoded
  if (!state?.players) return { phase: null, hostId: null, players: [], fillBots: true, crs: [] };
  return {
    phase: state.phase as Phase,
    hostId: state.hostId || null,
    fillBots: state.fillBots !== false,
    players: Array.from(state.players.entries(), ([id, p]) => ({ id, name: p.name, archetype: p.archetype ?? 0, ready: p.ready === true })),
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
    // The lobby shows everyone's pick (#14).
    callbacks.listen(player as PlayerShape & IRef, "archetype", refresh);
    // ...and who is ready (#62).
    callbacks.listen(player as PlayerShape & IRef, "ready", refresh);
    refresh();
  });
  callbacks.onRemove("players", (_player, id) => {
    lastImpulses.delete(id);
    lastSwings.delete(id);
    refresh();
  });
  // Shops (#83): a new layout removes last round's shops and adds the new ones, each whole in one patch.
  const refreshShops = (removed?: string) => {
    if (gen !== generation) return;
    const state = joined.state as ClientState | undefined;
    const next: ShopLot[] = [];
    state?.props?.forEach((p, id) => {
      const lot = id === removed ? null : shopLotOf(id, p);
      if (lot) next.push(lot);
    });
    setShops(next);
  };
  callbacks.onAdd("props", (prop, id) => {
    // `previous` is undefined on the first sync, so a prop that was already
    // broken when we joined swaps its model without spraying debris.
    callbacks.listen(prop as PropShapeState & IRef, "broken", (broken, previous) => {
      if (gen === generation && broken && previous === false) propBrokenAt.set(id, performance.now());
    });
    if ((prop as PropShapeState).kind) refreshShops();
  });
  callbacks.onRemove("props", (prop, id) => {
    propBrokenAt.delete(id);
    lastPropHits.delete(id);
    if ((prop as PropShapeState).kind) refreshShops(id);
  });
  callbacks.onAdd("crs", () => refresh());
  callbacks.onRemove("crs", (_crs, id) => {
    lastImpulses.delete(id);
    lastSwings.delete(id);
    lastCrsHits.delete(id);
    lastShoves.delete(id);
    lastLbdShots.delete(id);
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
  // Fire (#16): same pattern as the gas.
  const refreshFires = (removed?: string) => {
    if (gen !== generation) return;
    const state = joined.state as ClientState | undefined;
    const map = state?.fires;
    setFireIds(map ? Array.from(map.entries(), ([id]) => id).filter((id) => id !== removed) : []);
  };
  callbacks.onAdd("fires", (_f, id) => {
    fireSeenAt.set(id, performance.now());
    refreshFires();
  });
  callbacks.onRemove("fires", (_f, id) => {
    fireSeenAt.delete(id);
    refreshFires(id);
  });
  // Fire trucks (#17): same pattern again.
  const refreshTrucks = (removed?: string) => {
    if (gen !== generation) return;
    const state = joined.state as ClientState | undefined;
    const map = state?.trucks;
    setTruckIds(map ? Array.from(map.entries(), ([id]) => id).filter((id) => id !== removed) : []);
  };
  callbacks.onAdd("trucks", () => refreshTrucks());
  callbacks.onRemove("trucks", (_t, id) => refreshTrucks(id));
  // Moluchan (#85): at most one entry; his phase drives the view and the HUD banner.
  callbacks.onAdd("moluchan", (m) => {
    const read = () => {
      if (gen === generation) setMoluchanPhase((m as MoluchanShape).phase as MoluchanPhase);
    };
    callbacks.listen(m as MoluchanShape & IRef, "phase", read);
    read();
  });
  callbacks.onRemove("moluchan", () => {
    if (gen === generation) setMoluchanPhase(null);
  });
  callbacks.listen("phase", () => {
    // A new phase starts from no held input on the server (#12): forget the
    // last direction sent, or pressing the same key again would not be sent.
    lastSent = { x: 0, z: 0 };
    // #63: the live board belongs to one march; the next one starts from a fresh message.
    const phase = (joined.state as ClientState | undefined)?.phase;
    if (gen === generation && phase !== Phase.Marching && roundView.board) setRound({ board: null });
    refresh();
  });
  const refreshRound = () => {
    if (gen !== generation) return;
    const state = joined.state as ClientState | undefined;
    if (!state) return;
    setRound({
      timeLeft: state.timeLeft ?? 0,
      progress: state.progress ?? 0,
      hot: state.hot ?? false,
      result: (state.result ?? RoundResult.None) as RoundResult,
    });
  };
  callbacks.listen("timeLeft", refreshRound);
  callbacks.listen("progress", refreshRound);
  callbacks.listen("hot", refreshRound);
  callbacks.listen("result", refreshRound);
  joined.onMessage(ServerMessage.RoundEnd, (event: RoundEndEvent) => {
    if (gen !== generation) return;
    setRound({ end: event });
    emit({ type: "roundEnd", event });
  });
  callbacks.listen("hostId", refresh);
  callbacks.listen("fillBots", refresh);
  joined.onMessage(ServerMessage.RoundBoard, (event: RoundBoardEvent) => {
    if (gen !== generation) return;
    setRound({ board: event });
  });
  joined.onMessage(ServerMessage.RenameRefused, (event: RenameRefusedEvent) => {
    if (gen !== generation) return;
    for (const listener of renameListeners) listener(event);
  });
  // #41: our device token, sent once by the server if we joined without one. Kept for every later join.
  joined.onMessage(ServerMessage.ScoreToken, (event: ScoreTokenEvent) => {
    saveToken(event?.token);
  });
  joined.onMessage(ServerMessage.Leaderboard, (event: LeaderboardEvent) => {
    if (gen !== generation) return;
    setLeaderboard(event);
  });

  joined.onMessage(ServerMessage.Impulse, (event: ImpulseEvent) => {
    if (gen !== generation) return;
    lastImpulses.set(event.id, event);
    emit({ type: "impulse", event });
  });

  joined.onMessage(ServerMessage.Swing, (event: SwingEvent) => {
    if (gen !== generation) return;
    lastSwings.set(event.id, performance.now());
    emit({ type: "swing", id: event.id });
  });
  joined.onMessage(ServerMessage.Shove, (event: ShoveEvent) => {
    if (gen !== generation) return;
    const now = performance.now();
    for (const id of event.ids) lastShoves.set(id, now);
    emit({ type: "shove", ids: event.ids });
  });
  joined.onMessage(ServerMessage.Hit, (event: HitEvent) => {
    if (gen !== generation) return;
    if (event.kind === "prop") lastPropHits.set(event.target, performance.now());
    else if (event.kind === "crs") lastCrsHits.set(event.target, performance.now());
    emit({ type: "hit", event });
  });
  // The CRS LBD (#73): the ball flies on the client from its shot until its impact arrives.
  joined.onMessage(ServerMessage.LbdShot, (event: LbdShotEvent) => {
    if (gen !== generation) return;
    const now = performance.now();
    for (const [id, ball] of lbdBalls) if (now - ball.firedAt > LBD_BALL_TTL_MS) lbdBalls.delete(id);
    lbdBalls.set(event.id, { shot: event, firedAt: now, impact: null, impactAt: 0 });
    lastLbdShots.set(event.by, now);
    emit({ type: "lbdShot", event });
  });
  joined.onMessage(ServerMessage.LbdImpact, (event: LbdImpactEvent) => {
    if (gen !== generation) return;
    const ball = lbdBalls.get(event.id);
    if (ball) {
      ball.impact = event;
      ball.impactAt = performance.now();
    }
    emit({ type: "lbdImpact", event });
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

/** The teammate player `carrierId` holds overhead (#11), or null. */
function carriedOf(carrierId: string): string | null {
  const players = room?.state.players;
  if (!players) return null;
  for (const [id, p] of players.entries()) if (p.carriedBy === carrierId) return id;
  return null;
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
   * The whole live, decoded street state, or null outside a room. Updated in
   * place by the SDK: read it on a timer or from useFrame, never keep pieces.
   */
  getState(): StreetStateShape | null {
    return room?.state ?? null;
  },

  /** Call `listener` for every server event message (#57, the sound layer) and our own swing. */
  subscribeEvents(listener: (event: NetEvent) => void): () => void {
    eventListeners.add(listener);
    return () => eventListeners.delete(listener);
  },

  /** Call `listener` when the server refuses our rename (#61): the name was empty or taken. */
  subscribeRenameRefused(listener: (event: RenameRefusedEvent) => void): () => void {
    renameListeners.add(listener);
    return () => renameListeners.delete(listener);
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

  /** The teammate player `carrierId` holds overhead (#11), or null. Scans the players: read it from useFrame or a poll. */
  getCarried(carrierId: string): string | null {
    return carriedOf(carrierId);
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

  /** The LBD balls (#73) still flying or just stopped, by ball id. Read from useFrame; never keep pieces. */
  getLbdBalls(): ReadonlyMap<string, LbdBall> {
    return lbdBalls;
  },

  /** When (performance.now()) CRS LBD `id` last fired (#73), if ever. */
  getLastLbdShot(id: string): number | undefined {
    return lastLbdShots.get(id);
  },

  /** Live, decoded state of a police bot (#5). Read from useFrame. */
  getCrs(id: string): CrsShape | undefined {
    return room?.state.crs?.get(id);
  },

  /** Call `listener` when the round's shops (#83) are laid out anew. */
  subscribeShops(listener: () => void): () => void {
    shopListeners.add(listener);
    return () => shopListeners.delete(listener);
  },

  /** The round's shops (#83), in street order. Same array until a new layout arrives. */
  getShops(): readonly ShopLot[] {
    return shops;
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

  /** Call `listener` when a prop catches fire or stops burning (#16). */
  subscribeFires(listener: () => void): () => void {
    fireListeners.add(listener);
    return () => fireListeners.delete(listener);
  },

  /** Ids (level prop ids) of the burning props (#16). Same array until one is lit or goes out. */
  getFireIds(): readonly string[] {
    return fireIds;
  },

  /** Live state of a burning prop (#16). Read from useFrame. */
  getFire(id: string): FireShape | undefined {
    return room?.state.fires?.get(id);
  },

  /** When (performance.now()) we first saw prop `id` burning (#16), or undefined. */
  getFireSeenAt(id: string): number | undefined {
    return fireSeenAt.get(id);
  },

  /** Call `listener` when a fire truck (#17) arrives or has driven off. */
  subscribeTrucks(listener: () => void): () => void {
    truckListeners.add(listener);
    return () => truckListeners.delete(listener);
  },

  /** Ids of the fire trucks on the street (#17). Same array until one arrives or leaves. */
  getTruckIds(): readonly string[] {
    return truckIds;
  },

  /** Live state of a fire truck (#17). Read from useFrame. */
  getTruck(id: string): TruckShape | undefined {
    return room?.state.trucks?.get(id);
  },

  /** Call `listener` when Jeun-Lac Moluchan (#85) arrives, changes phase or is gone. */
  subscribeMoluchan(listener: () => void): () => void {
    moluchanListeners.add(listener);
    return () => moluchanListeners.delete(listener);
  },

  /** Moluchan's phase (#85, a `MoluchanPhase`) while he is on the street, null when he isn't. */
  getMoluchanPhase(): MoluchanPhase | null {
    return moluchanPhase;
  },

  /** Moluchan's live state (#85). Read from useFrame. */
  getMoluchan(): MoluchanShape | undefined {
    return room?.state.moluchan?.get(MOLUCHAN_ID);
  },

  /** Call `listener` when the lasting leaderboard (#41) arrives or changes. */
  subscribeLeaderboard(listener: () => void): () => void {
    leaderboardListeners.add(listener);
    return () => leaderboardListeners.delete(listener);
  },

  /** The lasting leaderboard (#41) as last sent to us, or null before the first one. */
  getLeaderboard(): LeaderboardEvent | null {
    return leaderboard;
  },

  /** Call `listener` when the round timer, progress or result changes, or a round ends (#12). */
  subscribeRound(listener: () => void): () => void {
    roundListeners.add(listener);
    return () => roundListeners.delete(listener);
  },

  /** The round as last synced (#12). Same object until something changes. */
  getRound(): RoundView {
    return roundView;
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
    if (!room || room.state.phase !== Phase.Marching) return;
    const me = room.state.players.get(room.sessionId);
    if (!me || me.down || me.status !== PlayerStatus.Free) return;
    const now = performance.now();
    if (now - lastLocalSwing >= MELEE_COOLDOWN * 1000) {
      lastLocalSwing = now;
      lastSwings.set(room.sessionId, now);
      emit({ type: "swing", id: room.sessionId });
    }
    room.send(ClientMessage.Attack);
  },

  /**
   * One press of the struggle (#70), while grabbed: the server fills the meter
   * (at most STRUGGLE_RATE presses a second count) and frees us when it is
   * full. Not sent unless grabbed. Never a swing.
   */
  sendStruggle() {
    if (!room || room.state.phase !== Phase.Marching) return;
    const me = room.state.players.get(room.sessionId);
    if (!me || me.status !== PlayerStatus.Grabbed) return;
    room.send(ClientMessage.Struggle);
  },

  /** Whether the local player is grabbed right now (#70: attack becomes a struggle). */
  isGrabbed(): boolean {
    const me = room?.state.players.get(room.sessionId);
    return me?.status === PlayerStatus.Grabbed;
  },

  /**
   * Throw the carried item (#8), or the carried teammate (#11), along a
   * ground direction (the server normalizes it; zero throws along the
   * facing). Plays the arm swing locally right away; the flight itself is the
   * server's. Not sent while we can't act or carry nothing.
   */
  sendThrow(x: number, z: number) {
    if (!room || room.state.phase !== Phase.Marching) return;
    const me = room.state.players.get(room.sessionId);
    if (!me || me.down || me.status !== PlayerStatus.Free || me.carriedBy) return;
    if (!me.carrying && carriedOf(room.sessionId) === null) return;
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
    if (!room || room.state.phase !== Phase.Marching) return;
    const me = room.state.players.get(room.sessionId);
    if (!me || me.down || me.status !== PlayerStatus.Free) return;
    room.send(ClientMessage.Dodge);
  },

  /**
   * Hop (#45). The server enforces the cooldown and the state; the avatar
   * reacts to the synced `airborne` flag, so a refused press shows nothing.
   * Not sent while we can't act.
   */
  sendJump() {
    if (!room || room.state.phase !== Phase.Marching) return;
    const me = room.state.players.get(room.sessionId);
    if (!me || me.down || me.status !== PlayerStatus.Free) return;
    room.send(ClientMessage.Jump);
  },

  /**
   * Interact key pressed or released (#10 rescue, #8 pick-up, #11 lift or put down a teammate). Always sent,
   * whatever our state: the server decides what it does, and a release must
   * never be lost or a rescue would keep going.
   */
  sendInteract(held: boolean) {
    if (!room || room.state.phase !== Phase.Marching) return;
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
    const options: LobbyJoinOptions = { name, token: loadToken() };
    return connect((client) => client.create<ClientState>(ROOM_NAME, options));
  },

  /** Join a lobby by its code. Already in that lobby: nothing to do. */
  joinLobby(code: string, name: string): Promise<void> {
    if (room && room.roomId === code && !pending) return Promise.resolve();
    const options: LobbyJoinOptions = { name, token: loadToken() };
    return connect((client) => client.joinById<ClientState>(code, options));
  },

  /**
   * Host only (the server checks): from the lobby screen (`waiting`), start the march for everyone (#12).
   * The server refuses it while someone isn't ready (#62), unless `force` ("Lancer quand même").
   */
  start(force = false) {
    if (force) {
      const payload: StartPayload = { force: true };
      room?.send(ClientMessage.Start, payload);
    } else room?.send(ClientMessage.Start);
  },

  /** Mark yourself ready or not in the lobby (#62). The server ignores it outside `waiting` and from the host. */
  setReady(ready: boolean) {
    const payload: ReadyPayload = { ready };
    room?.send(ClientMessage.Ready, payload);
  },

  /** Host only (the server checks), in the lobby (#59): fill the cortège with bots at the next Start, or not. */
  setFillBots(on: boolean) {
    const payload: FillBotsPayload = { on };
    room?.send(ClientMessage.FillBots, payload);
  },

  /** Pick an archetype in the lobby (#14). The server ignores it outside `waiting`. */
  pickArchetype(archetype: number) {
    const payload: PickArchetypePayload = { archetype };
    room?.send(ClientMessage.PickArchetype, payload);
  },

  /**
   * Rename yourself in the lobby (#61). The raw text: the server cleans it and
   * either changes your `name` in the state or answers RenameRefused.
   */
  rename(name: string) {
    const payload: RenamePayload = { name };
    room?.send(ClientMessage.Rename, payload);
  },

  /** DEBUG (#2), dev builds only: ask the server to knock someone over. The server refuses it in production. */
  debugKnockback(payload: DebugKnockbackPayload) {
    if (import.meta.env.DEV) room?.send(ClientMessage.DebugKnockback, payload);
  },

  /** DEBUG (#3), dev builds only: hurt or grab yourself. The server refuses it in production. */
  debugHealth(payload: DebugHealthPayload) {
    if (import.meta.env.DEV) room?.send(ClientMessage.DebugHealth, payload);
  },

  /** DEBUG (#12), dev builds only: jump down the street or cut the round timer. The server refuses it in production. */
  debugRound(payload: DebugRoundPayload) {
    if (import.meta.env.DEV) room?.send(ClientMessage.DebugRound, payload);
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
