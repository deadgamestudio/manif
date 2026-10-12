import { schema, t, type SchemaType } from "@colyseus/schema";
import { Phase } from "@manif/shared";
import { Player } from "../features/player/index.js";

// The root room state. It composes the per-feature Schema classes and stays
// with the room; features define their own pieces (see features/*/schema.ts).

export const StreetState = schema(
  {
    players: t.map(Player),
    /** See `Phase` in @manif/shared. #12 grows this into the round lifecycle. */
    phase: t.uint8().default(Phase.Lobby),
    /** Session id of the host, who alone can start. */
    hostId: t.string(),
  },
  "StreetState",
);
export type StreetState = SchemaType<typeof StreetState>;
