import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * Le Z (#133), keyed by LEZ_ID in `StreetState.lez` while he is on the
 * street. Only what clients draw; his spot, hit counter and timers stay in
 * the server's `LeZEvent`.
 */
export const LeZView = schema(
  {
    // Defaults, so the first sync always sends real numbers (the room only writes what changed).
    x: t.float32().default(0),
    z: t.float32().default(0),
    rotation: t.float32().default(0),
    /** A `LeZPhase`. */
    phase: t.uint8().default(0),
    /** Index into LEZ_LINES, -1 for none. */
    line: t.int8().default(-1),
    /** Counts the hits he took, wrapping at 256: a change staggers him. */
    hurts: t.uint8().default(0),
  },
  "LeZ",
);
export type LeZView = SchemaType<typeof LeZView>;
