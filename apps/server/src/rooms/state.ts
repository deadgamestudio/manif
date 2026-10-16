import { schema, t, type SchemaType } from "@colyseus/schema";
import { Phase, RoundResult } from "@manif/shared";
import { Player } from "../features/player/index.js";
import { Prop } from "../features/prop/index.js";
import { Crs } from "../features/crs/index.js";
import { GroundItem, ProjectileView } from "../features/throwable/index.js";
import { CanisterView, GasCloudView } from "../features/gas/index.js";
import { FireView } from "../features/fire/index.js";
import { TruckView } from "../features/pompier/index.js";
import { MoluchanView } from "../features/moluchan/index.js";
import { DouaneView } from "../features/douane/index.js";
import { BenanasView } from "../features/benanas/index.js";

// The root room state. It composes the per-feature Schema classes and stays
// with the room; features define their own pieces (see features/*/schema.ts).

export const StreetState = schema(
  {
    players: t.map(Player),
    /** Breakable props by level prop id (#4): only hp and broken. Filled in onCreate. */
    props: t.map(Prop),
    /** Police bots by server-made id (#5). Target, path and timers stay server-side. */
    crs: t.map(Crs),
    /** Items lying on the ground (#8), by server-made id. Capped at MAX_GROUND_ITEMS. */
    items: t.map(GroundItem),
    /** Thrown items in flight (#8), by server-made id. Removed when they stop. */
    projectiles: t.map(ProjectileView),
    /** Tear gas clouds (#7), by server-made id. At most MAX_GAS_CLOUDS with the canisters; removed when they end. */
    gas: t.map(GasCloudView),
    /** Tear gas canisters in flight (#7), by server-made id (the cloud keeps it). Set once at the throw. */
    canisters: t.map(CanisterView),
    /** Burning props (#16), by level prop id. At most MAX_FIRES; removed when burnt out or put out. */
    fires: t.map(FireView),
    /** Fire trucks (#17), by server-made id. At most `maxTrucks`; their pompiers are bots in `crs`. */
    trucks: t.map(TruckView),
    /** Jeun-Lac Moluchan (#85), by MOLUCHAN_ID: empty, or him while he is on the street (at most one). */
    moluchan: t.map(MoluchanView),
    /** La Douane (#120), by DOUANE_ID: empty, or the kid while he is on the street (at most one). */
    douane: t.map(DouaneView),
    /** Alexandre Bénanas (#123), by BENANAS_ID: empty, or him while he is on the street (at most one). */
    benanas: t.map(BenanasView),
    /** Round phase (#12), see `Phase` in @manif/shared: waiting (the lobby screen), marching, ended. */
    phase: t.uint8().default(Phase.Waiting),
    /** Whole seconds left (#12): of the march while marching, of the end screen while ended. Changes once a second. */
    timeLeft: t.uint16().default(0),
    /** The cortège's front (#12), 0..100 from the start to the Préfecture. */
    progress: t.uint8().default(0),
    /**
     * The street turned hot this round (#98, see `StreetMood`): until then the
     * CRS escort the cortège and only go after offenders. Never back to false within a round.
     */
    hot: t.boolean().default(false),
    /** The street's tension (#98), 0..TENSION_HOT (100 once hot). Changes on offences and as it cools. */
    tension: t.uint8().default(0),
    /** How the last round ended (#12), see `RoundResult`. Kept through waiting for the lobby. */
    result: t.uint8().default(RoundResult.None),
    /** Session id of the host, who alone can start. */
    hostId: t.string(),
    /** Fill the cortège up to MAX_PLAYERS with bot protesters at the next Start (#59). Host's toggle, lobby only. */
    fillBots: t.boolean().default(true),
  },
  "StreetState",
);
export type StreetState = SchemaType<typeof StreetState>;
