import { schema, t, type SchemaType } from "@colyseus/schema";
import { CrsKind, CrsStatus } from "@manif/shared";

/**
 * One police bot (#5), keyed by a server-made id ("crs-1", ...) in
 * `StreetState.crs`. Only what clients draw is synced; target, path, timers
 * and velocity stay in the server's `CrsSquad`.
 */
export const Crs = schema(
  {
    x: t.float32(),
    z: t.float32(),
    rotation: t.float32(),
    hp: t.uint8(),
    /** `CrsStatus` from @manif/shared: active, stunned, grabbing or out. */
    status: t.uint8().default(CrsStatus.Active),
    /** Knocked down (#2). */
    down: t.boolean(),
    /** `CrsKind`: the unit type (#13). Always CRS for now. */
    kind: t.uint8().default(CrsKind.Crs),
    /** In a formed shield line (#6): shield raised, solid to protesters. Slots and orders stay server-side. */
    formation: t.boolean(),
    /** On fire (#16). The burn timer stays in the server's fire feature. */
    onFire: t.boolean(),
    /** A tomato on the visor (#15): stumbling and missing. The timer stays in `CrsBot.splatUntil`. */
    splatted: t.boolean(),
    /** Hit by a dog poo (#15): the others keep away. The timer stays in `CrsBot.stinkUntil`. */
    stinky: t.boolean(),
  },
  "Crs",
);
export type Crs = SchemaType<typeof Crs>;
