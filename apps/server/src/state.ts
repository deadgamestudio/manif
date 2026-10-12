import { schema, t, type SchemaType } from "@colyseus/schema";

// Schema classes are built with `schema()` rather than `@type()` decorators,
// so no `experimentalDecorators` / `useDefineForClassFields` settings are needed.
// They live in the server only; the client reads the synced state through the
// plain shapes in @manif/shared.

export const Player = schema(
  {
    x: t.float32(),
    z: t.float32(),
    rotation: t.float32(),
  },
  "Player",
);
export type Player = SchemaType<typeof Player>;

export const StreetState = schema(
  {
    players: t.map(Player),
  },
  "StreetState",
);
export type StreetState = SchemaType<typeof StreetState>;
