import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * An item lying on the ground (#8), keyed by a server-made id in
 * `StreetState.items`. Only what the client draws: the kind and where it lies.
 */
export const GroundItem = schema(
  {
    /** `ThrowableKind` from @manif/shared. */
    kind: t.uint8(),
    x: t.float32(),
    z: t.float32(),
  },
  "GroundItem",
);
export type GroundItem = SchemaType<typeof GroundItem>;

/**
 * A thrown item in flight (#8), keyed by a server-made id in
 * `StreetState.projectiles`. Direction, range left and thrower stay
 * server-side; removed as soon as it stops.
 */
export const ProjectileView = schema(
  {
    /** `ThrowableKind` from @manif/shared. */
    kind: t.uint8(),
    x: t.float32(),
    z: t.float32(),
  },
  "Projectile",
);
export type ProjectileView = SchemaType<typeof ProjectileView>;
