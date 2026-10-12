import { schema, t, type SchemaType } from "@colyseus/schema";
import { Phase } from "@manif/shared";

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
  },
  "Player",
);
export type Player = SchemaType<typeof Player>;

export const StreetState = schema(
  {
    players: t.map(Player),
    /** See `Phase` in @manif/shared. #12 grows this into the round lifecycle. */
    phase: t.uint8().default(Phase.Lobby),
    /** Session id of the host, who alone can start. */
    hostId: t.string(),
  },
  "StreetState",
);
export type StreetState = SchemaType<typeof StreetState>;
