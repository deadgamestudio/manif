import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * Runtime state of one breakable prop (#4), keyed by its level prop id in
 * `StreetState.props`. Only this is synced: position, type and size are in the
 * shared level data, which the client already has.
 */
export const Prop = schema(
  {
    hp: t.uint8(),
    broken: t.boolean(),
    /** Burnt out (#16): still in the way, never burns again. Cleared by the round reset. */
    charred: t.boolean(),
  },
  "Prop",
);
export type Prop = SchemaType<typeof Prop>;
