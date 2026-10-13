import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * A burning prop (#16), keyed by its level prop id in `StreetState.fires`.
 * Only what clients draw and what a hose (#17) aims at: set when it is lit,
 * then `intensity` and `left` change about once a second. Fuel, age and the
 * spread timer stay in the server's `Fires`. Removed when it goes out.
 */
export const FireView = schema(
  {
    x: t.float32(),
    z: t.float32(),
    /** A circle around the whole fire zone: the prop plus FIRE_REACH. */
    radius: t.float32(),
    /** Flame size: 1 dying, 2 catching, 3 full blaze. */
    intensity: t.uint8(),
    /** Whole seconds before it burns out. */
    left: t.uint8(),
  },
  "Fire",
);
export type FireView = SchemaType<typeof FireView>;
