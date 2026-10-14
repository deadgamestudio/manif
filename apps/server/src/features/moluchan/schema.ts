import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * Jeun-Lac Moluchan (#85), keyed by MOLUCHAN_ID in `StreetState.moluchan`
 * while he is on the street. Only what clients draw; his plan, path and
 * timers stay in the server's `MoluchanEvent`. Clients work out his ring from
 * his position and phase, so nothing is synced per player.
 */
export const MoluchanView = schema(
  {
    // Defaults, so the first sync always sends real numbers (the room only writes what changed).
    x: t.float32().default(0),
    z: t.float32().default(0),
    rotation: t.float32().default(0),
    /** A `MoluchanPhase`. */
    phase: t.uint8().default(0),
    /** Index into MOLUCHAN_LINES, -1 for none. */
    line: t.int8().default(-1),
    /** Whole seconds of rallying left. */
    left: t.uint8().default(0),
  },
  "Moluchan",
);
export type MoluchanView = SchemaType<typeof MoluchanView>;
