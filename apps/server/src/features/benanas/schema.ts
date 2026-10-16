import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * Alexandre Bénanas (#123), keyed by BENANAS_ID in `StreetState.benanas`
 * while he is on the street. Only what clients draw; his target, path,
 * helmet and timers stay in the server's `BenanasEvent`.
 */
export const BenanasView = schema(
  {
    // Defaults, so the first sync always sends real numbers (the room only writes what changed).
    x: t.float32().default(0),
    z: t.float32().default(0),
    rotation: t.float32().default(0),
    /** A `BenanasPhase`. */
    phase: t.uint8().default(0),
    /** Index into BENANAS_LINES, -1 for none. */
    line: t.int8().default(-1),
    /** Counts his punches, wrapping at 256: a change plays one. */
    swings: t.uint8().default(0),
    /** Counts the hits he took, wrapping at 256: a change flashes him. */
    hurts: t.uint8().default(0),
  },
  "Benanas",
);
export type BenanasView = SchemaType<typeof BenanasView>;
