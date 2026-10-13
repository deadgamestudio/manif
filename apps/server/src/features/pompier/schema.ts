import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * A fire truck (#17), keyed by a server-made id ("truck-1", ...) in
 * `StreetState.trucks`. Only what clients draw: its crew are bots in
 * `state.crs` (kind `CrsKind.Pompier`); its bay, crew list and phase stay in
 * the server's `FireBrigade`. Removed once it has driven off.
 */
export const TruckView = schema(
  {
    x: t.float32(),
    z: t.float32(),
    rotation: t.float32(),
    /** Parked behind its side street's barrier while the crew work (lights on). */
    parked: t.boolean(),
  },
  "Truck",
);
export type TruckView = SchemaType<typeof TruckView>;
