/**
 * Plain shapes of the synced room state, as seen by the client.
 * The real Schema classes live in the server only.
 */
import type { PlayerStatus } from "../health/index.js";
import type { CrsKind, CrsStatus } from "../crs/index.js";
import type { ThrowableKind } from "../throwable/index.js";
import type { Phase, RoundResult } from "../round/index.js";

export interface PlayerShape {
  x: number;
  z: number;
  /** Facing angle around the Y axis, in radians. */
  rotation: number;
  /** Display name, already sanitised by the server. */
  name: string;
  /** Knocked down (#2): no control until it gets back up. Not a health state. */
  down: boolean;
  /** Health points, 0..MAX_HP (#3). */
  hp: number;
  /** Free, grabbed, KO or arrested (#3). See `PlayerStatus`. */
  status: PlayerStatus;
  /** Whole seconds left in the current non-free state, for countdowns (0 while free). */
  stateLeft: number;
  /** In a dodge burst (#9), for the visual and the HUD cooldown. The cooldown itself stays server-side. */
  dodging: boolean;
  /** While grabbed: how far a teammate's rescue has got (#10), 0..100. 0 otherwise. */
  rescue: number;
  /** The item in hand (#8), a `ThrowableKind`; `ThrowableKind.None` (0) when empty-handed. */
  carrying: ThrowableKind;
  /** In tear gas (#7): coughing and slowed, for the wobble and the screen tint. */
  gassed: boolean;
  /** Bum on fire (#16): flailing, running faster and losing HP. The timer stays server-side. */
  onFire: boolean;
  /** Holding interact to light a prop or pat out a teammate (#16): 0..100 of the hold, 0 otherwise. */
  fireHold: number;
}

/** Minimal read-only view of a Colyseus MapSchema. */
export interface SyncedMap<V> {
  readonly size: number;
  get(key: string): V | undefined;
  forEach(callback: (value: V, key: string) => void): void;
  entries(): IterableIterator<[string, V]>;
  [Symbol.iterator](): IterableIterator<[string, V]>;
}

/**
 * Runtime state of a breakable prop (#4), keyed by its id in the level data.
 * Position, type and size are not synced: read them from the shared level.
 */
export interface PropShapeState {
  /** 0..PROP_TYPES[kind].maxHp. */
  hp: number;
  broken: boolean;
  /** Burnt out (#16): black, still in the way, never burns again. */
  charred: boolean;
}

/**
 * A police bot (#5), keyed by a server-made id. Target, path and timers stay
 * on the server; stats are in `CRS_STATS[kind]`.
 */
export interface CrsShape {
  x: number;
  z: number;
  /** Facing angle around the Y axis, in radians. */
  rotation: number;
  hp: number;
  /** Active, stunned, grabbing or out. See `CrsStatus`. */
  status: CrsStatus;
  /** Knocked down (#2). */
  down: boolean;
  /** Unit type (#13). See `CrsKind`. */
  kind: CrsKind;
  /** In a formed shield line (#6): shield raised, solid to protesters. */
  formation: boolean;
  /** On fire (#16). */
  onFire: boolean;
}

/** An item lying on the ground (#8), keyed by a server-made id. */
export interface GroundItemShape {
  kind: ThrowableKind;
  x: number;
  z: number;
}

/** A thrown item in flight (#8), keyed by a server-made id. Direction, range and thrower stay on the server. */
export interface ProjectileShape {
  kind: ThrowableKind;
  x: number;
  z: number;
}

/** A tear gas cloud (#7), keyed by a server-made id. Its radius never changes; it is removed when it ends. */
export interface GasCloudShape {
  x: number;
  z: number;
  radius: number;
  /** Whole seconds left. */
  left: number;
}

/**
 * A tear gas canister in flight (#7), keyed by a server-made id (the cloud
 * it becomes keeps it). Only the throw: clients fly it over
 * CANISTER_FLIGHT_TIME themselves. Removed when it lands.
 */
export interface CanisterShape {
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
}

/**
 * A burning prop (#16), keyed by its level prop id. Set when it is lit; then
 * only `intensity` and `left` change, about once a second. Removed when it
 * burns out (the prop is then `charred`) or is put out.
 */
export interface FireShape {
  /** Centre of the prop. */
  x: number;
  z: number;
  /** A circle around the whole fire zone (the prop plus FIRE_REACH), for drawing and aiming (#17). */
  radius: number;
  /** Flame size: 1 dying, 2 catching, 3 full blaze. */
  intensity: number;
  /** Whole seconds before it burns out. */
  left: number;
}

export interface StreetStateShape {
  players: SyncedMap<PlayerShape>;
  /** Breakable props by level prop id (#4). */
  props: SyncedMap<PropShapeState>;
  /** Police bots by id (#5). */
  crs: SyncedMap<CrsShape>;
  /** Items on the ground by id (#8). */
  items: SyncedMap<GroundItemShape>;
  /** Thrown items in flight by id (#8). */
  projectiles: SyncedMap<ProjectileShape>;
  /** Tear gas clouds by id (#7). */
  gas: SyncedMap<GasCloudShape>;
  /** Tear gas canisters in flight by id (#7). */
  canisters: SyncedMap<CanisterShape>;
  /** Burning props by level prop id (#16). */
  fires: SyncedMap<FireShape>;
  /** Round phase (#12): waiting (lobby screen), marching, ended. */
  phase: Phase;
  /** Whole seconds left: of the march while marching, of the end screen while ended. */
  timeLeft: number;
  /** The cortège's front, 0..100 along the street (#12). */
  progress: number;
  /** How the last round ended (#12). Stays set through `waiting` until the next march starts. */
  result: RoundResult;
  /** Session id of the host (who may start), or "" when the room is empty. */
  hostId: string;
}
