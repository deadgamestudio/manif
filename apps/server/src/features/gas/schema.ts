import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * A tear gas cloud on the ground (#7), keyed by a server-made id in
 * `StreetState.gas`. Only what the client draws; set once when it appears,
 * then only `left` ticks down once a second. Removed when it ends.
 */
export const GasCloudView = schema(
  {
    x: t.float32(),
    z: t.float32(),
    radius: t.float32(),
    /** Whole seconds left before it goes, for the fade-out. */
    left: t.uint8(),
  },
  "GasCloud",
);
export type GasCloudView = SchemaType<typeof GasCloudView>;

/**
 * A tear gas canister in flight (#7), keyed by a server-made id in
 * `StreetState.canisters` (the cloud it becomes keeps the same id). Only where
 * it was thrown from and where it is going, set once: the client flies it
 * over CANISTER_FLIGHT_TIME itself, so nothing is sent per tick. Removed when
 * it lands (early, if a wall stopped it).
 */
export const CanisterView = schema(
  {
    fromX: t.float32(),
    fromZ: t.float32(),
    toX: t.float32(),
    toZ: t.float32(),
  },
  "Canister",
);
export type CanisterView = SchemaType<typeof CanisterView>;
