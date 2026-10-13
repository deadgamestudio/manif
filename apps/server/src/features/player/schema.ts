import { schema, t, type SchemaType } from "@colyseus/schema";
import { MAX_HP, PlayerStatus } from "@manif/shared";

// Schema classes are built with `schema()` rather than `@type()` decorators,
// so no `experimentalDecorators` / `useDefineForClassFields` settings are needed.
// They live in the server only; the client reads the synced state through the
// plain shapes in @manif/shared.

export const Player = schema(
  {
    x: t.float32(),
    z: t.float32(),
    rotation: t.float32(),
    /** Sanitised display name, shown on the lobby screen and above the avatar. */
    name: t.string(),
    /** Knocked down (#2). Velocity and timers stay server-side in the physics feature. */
    down: t.boolean(),
    /** Health points (#3). Timers stay server-side in the health feature. */
    hp: t.uint8().default(MAX_HP),
    /** `PlayerStatus` from @manif/shared: free, grabbed, KO or arrested. */
    status: t.uint8().default(PlayerStatus.Free),
    /** Whole seconds left in the current non-free state, for the HUD countdown. 0 while free. */
    stateLeft: t.uint8(),
    /** In a dodge burst (#9). The cooldown and burst timer stay server-side in the physics and dodge features. */
    dodging: t.boolean(),
    /** While grabbed: a teammate's rescue progress (#10), 0..100. 0 otherwise. Progress per rescuer stays server-side. */
    rescue: t.uint8().default(0),
    /** The item in hand (#8), a `ThrowableKind` from @manif/shared; 0 when empty-handed. */
    carrying: t.uint8().default(0),
    /** In tear gas (#7): coughing and slowed. Exposure timers stay server-side in the gas feature. */
    gassed: t.boolean(),
    /** Bum on fire (#16): flailing, faster, losing HP. The burn timer stays in the server's fire feature. */
    onFire: t.boolean(),
    /** Holding interact to light a prop or pat out a teammate (#16): 0..100 of the hold, 0 otherwise. */
    fireHold: t.uint8().default(0),
  },
  "Player",
);
export type Player = SchemaType<typeof Player>;
