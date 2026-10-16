import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * La Douane (#120), keyed by DOUANE_ID in `StreetState.douane` while he is on
 * the street. Only what clients draw; his target, path and timers stay in the
 * server's `DouaneEvent`.
 */
export const DouaneView = schema(
  {
    // Defaults, so the first sync always sends real numbers (the room only writes what changed).
    x: t.float32().default(0),
    z: t.float32().default(0),
    rotation: t.float32().default(0),
    /** A `DouanePhase`. */
    phase: t.uint8().default(0),
    /** Index into DOUANE_LINES, -1 for none. */
    line: t.int8().default(-1),
    /** The water gun is firing. */
    spraying: t.boolean().default(false),
    /** His skin tone, in [0, DOUANE_SKINS). */
    skin: t.uint8().default(0),
  },
  "Douane",
);
export type DouaneView = SchemaType<typeof DouaneView>;
