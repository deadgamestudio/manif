/**
 * Plain shapes of the synced room state, as seen by the client.
 * The real Schema classes live in the server only.
 */
import type { PlayerStatus } from "../health/index.js";
import type { CrsKind, CrsMount, CrsStatus } from "../crs/index.js";
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
  /** In the air (#45), for the hop arc. The timer and the cooldown stay server-side; the height is the client's own. */
  airborne: boolean;
  /** While grabbed: how far a teammate's rescue has got (#10), 0..100. 0 otherwise. */
  rescue: number;
  /** While grabbed: how full their own struggle meter is (#70), 0..100. 0 otherwise. */
  struggle: number;
  /**
   * While grabbed: the police van they are dragged to (#70), an index into
   * `levelVans(STREET_LEVEL)` (same order as `vanDoors`); -1 when none.
   */
  dragVan: number;
  /** The item in hand (#8), a `ThrowableKind`; `ThrowableKind.None` (0) when empty-handed. */
  carrying: ThrowableKind;
  /** In tear gas (#7): coughing and slowed, for the wobble and the screen tint. */
  gassed: boolean;
  /** Bum on fire (#16): flailing, running faster and losing HP. The timer stays server-side. */
  onFire: boolean;
  /** Holding interact to light a prop or pat out a teammate (#16): 0..100 of the hold, 0 otherwise. */
  fireHold: number;
  /** Carried overhead by this teammate (#11), a session id; "" when not carried. The timer stays server-side. */
  carriedBy: string;
  /** The archetype picked in the lobby (#14), an `Archetype`. Read its stats with `archetypeStats`, never a local copy. */
  archetype: number;
  /** Marked ready in the lobby (#62). Ignored for the host; false for everyone once the march starts. */
  ready: boolean;
  /** This round's points so far (#41), never below 0. Reset when a march starts. The lasting total is not synced. */
  score: number;
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
 * Runtime state of a breakable prop (#4), keyed by its id: a level prop id, or
 * a shop's id (#83). A level prop's position, type and size are not synced:
 * read them from the shared level. A shop's are (the fields below `kind`),
 * since the round generates them; `shopLotOf` turns them back into a `ShopLot`.
 */
export interface PropShapeState {
  /** 0..PROP_TYPES[kind].maxHp. */
  hp: number;
  broken: boolean;
  /** Burnt out (#16): black, still in the way, never burns again. */
  charred: boolean;
  /** A shop's kind (#68): `shopCode(kind)`, 0 for any other prop. Changes only at a round reset. */
  kind: number;
  /** A shop's side of the street (#83): -1 left, 1 right; 0 for any other prop. The rest are 0 too. */
  side: number;
  /** A shop's `ShopLot` fields (#83): centre along the street, width, facade, how far out, height, room depth, look seed. */
  z: number;
  width: number;
  face: number;
  out: number;
  height: number;
  interior: number;
  style: number;
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
  /** A tomato on the visor (#15): stumbling, missing its swings. */
  splatted: boolean;
  /** Hit by a dog poo (#15): the other CRS keep away. */
  stinky: boolean;
  /**
   * BAC (#13): false while it passes for a protester. Draw it then exactly
   * like one (the protester avatar, `name` on the placard, a full HP bar).
   * Always true for the other units.
   */
  revealed: boolean;
  /** A BAC's protester name while disguised (#13); "" otherwise. */
  name: string;
  /** What a BRAV-M rides (#13), see `CrsMount`; `Foot` for the other units. */
  mount: CrsMount;
  /** A pompier's hose is on (#17): the water jet goes out along `rotation`. Always false for the police. */
  spraying: boolean;
  /** Winding up a grab (#70): arms out, about to grab whoever it faces. Draw the tell; dodge or hop to foil it. */
  windup: boolean;
  /**
   * An LBD aiming (#73): the session id of the protester under its laser, ""
   * otherwise. Draw the laser from the bot to their feet; it fires when the
   * aim time is up unless they dodge or get behind cover.
   */
  aim: string;
}

/**
 * A fire truck (#17), keyed by a server-made id. It drives in down a side
 * street, parks behind the barrier while its pompiers work, and drives back
 * out. Never in the street itself.
 */
export interface TruckShape {
  x: number;
  z: number;
  /** Facing angle around the Y axis, in radians (the nose; it backs out the way it came). */
  rotation: number;
  /** Parked (lights flashing, crew off) rather than driving in or out. */
  parked: boolean;
}

/**
 * Jeun-Lac Moluchan (#85), keyed by MOLUCHAN_ID, while he is on the street (at
 * most one, at most once a round). Clients draw his ring from `x`, `z` and
 * `phase`: the buffs are not synced per player.
 */
export interface MoluchanShape {
  x: number;
  z: number;
  /** Facing angle around the Y axis, in radians. */
  rotation: number;
  /** A `MoluchanPhase`: rallying (ring on), leaving, grabbed. */
  phase: number;
  /** His speech bubble: an index into MOLUCHAN_LINES, -1 for none. */
  line: number;
  /** Whole seconds of rallying left (0 once leaving or grabbed). */
  left: number;
}

/**
 * La Douane (#120), keyed by DOUANE_ID, while he is on the street (at most
 * one, at most once a round). Clients draw the kid and his jet from this.
 */
export interface DouaneShape {
  x: number;
  z: number;
  /** Facing angle around the Y axis, in radians (towards whoever he soaks). */
  rotation: number;
  /** A `DouanePhase`: soaking, leaving. */
  phase: number;
  /** His speech bubble: an index into DOUANE_LINES, -1 for none. */
  line: number;
  /** The water gun is firing (a burst). */
  spraying: boolean;
  /** His skin tone, an index in [0, DOUANE_SKINS). */
  skin: number;
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
  /** Fire trucks by id (#17). Their pompiers are in `crs`, with kind `CrsKind.Pompier`. */
  trucks: SyncedMap<TruckShape>;
  /** Jeun-Lac Moluchan (#85), by MOLUCHAN_ID: empty, or him while he is on the street. */
  moluchan: SyncedMap<MoluchanShape>;
  /** La Douane (#120), by DOUANE_ID. A server from before #120 has no such map: read it with `?.`. */
  douane: SyncedMap<DouaneShape>;
  /** Round phase (#12): waiting (lobby screen), marching, ended. */
  phase: Phase;
  /** Whole seconds left: of the march while marching, of the end screen while ended. */
  timeLeft: number;
  /** The cortège's front, 0..100 along the street (#12). */
  progress: number;
  /** The street turned hot this round (#98): CRS chase anyone. False while calm (and between rounds). */
  hot: boolean;
  /** The street's tension (#98), 0..TENSION_HOT. */
  tension: number;
  /** How the last round ended (#12). Stays set through `waiting` until the next march starts. */
  result: RoundResult;
  /** Session id of the host (who may start), or "" when the room is empty. */
  hostId: string;
  /** Fill the cortège up to MAX_PLAYERS with bot protesters at the next Start (#59). The host's toggle in the lobby. */
  fillBots: boolean;
}
