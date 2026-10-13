import { schema, t, type SchemaType } from "@colyseus/schema";
import { Phase } from "@manif/shared";
import { Player } from "../features/player/index.js";
import { Prop } from "../features/prop/index.js";
import { Crs } from "../features/crs/index.js";
import { GroundItem, ProjectileView } from "../features/throwable/index.js";

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
    /** See `Phase` in @manif/shared. #12 grows this into the round lifecycle. */
    phase: t.uint8().default(Phase.Lobby),
    /** Session id of the host, who alone can start. */
    hostId: t.string(),
  },
  "StreetState",
);
export type StreetState = SchemaType<typeof StreetState>;
