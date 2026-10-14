import { schema, t, type SchemaType } from "@colyseus/schema";
import { CrsKind, CrsMount, CrsStatus } from "@manif/shared";

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
    /** `CrsKind`: the unit type (#13). */
    kind: t.uint8().default(CrsKind.Crs),
    /**
     * BAC (#13): false while it still passes for a protester (the client then
     * draws it with the protester avatar, `name` on its placard). Always true
     * for the other units.
     */
    revealed: t.boolean().default(true),
    /** A BAC's protester name while disguised (#13); "" for every other bot. */
    name: t.string().default(""),
    /** `CrsMount` (#13): what a BRAV-M rides (bike with two, one or no riders); `Foot` for the others. */
    mount: t.uint8().default(CrsMount.Foot),
    /** In a formed shield line (#6): shield raised, solid to protesters. Slots and orders stay server-side. */
    formation: t.boolean(),
    /** On fire (#16). The burn timer stays in the server's fire feature. */
    onFire: t.boolean(),
    /** A tomato on the visor (#15): stumbling and missing. The timer stays in `CrsBot.splatUntil`. */
    splatted: t.boolean(),
    /** Hit by a dog poo (#15): the others keep away. The timer stays in `CrsBot.stinkUntil`. */
    stinky: t.boolean(),
    /** A pompier's hose is on (#17), along `rotation`. Set by the brigade; always false for the police. */
    spraying: t.boolean(),
    /**
     * Winding up a grab (#70): arms out, about to grab whoever it faces. The tell clients draw;
     * a dodge, a hop, a hit or stepping away foils it. The target and the timer stay in `CrsBot`.
     */
    windup: t.boolean(),
    /**
     * An LBD aiming (#73): the session id of the protester under its laser, "" otherwise.
     * The tell clients draw (laser and dot); the timer stays in `CrsBot.aimUntil`.
     */
    aim: t.string().default(""),
  },
  "Crs",
);
export type Crs = SchemaType<typeof Crs>;
