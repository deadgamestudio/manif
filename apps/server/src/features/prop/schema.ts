import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * Runtime state of one breakable prop (#4), keyed by its level prop id in
 * `StreetState.props`. Only this is synced: position and size are in the
 * shared level data, which the client already has. The one exception is a
 * shop slot's kind (#68), dealt each round.
 */
export const Prop = schema(
  {
    hp: t.uint8(),
    broken: t.boolean(),
    /** Burnt out (#16): still in the way, never burns again. Cleared by the round reset. */
    charred: t.boolean(),
    /** A shop slot's dealt kind (#68): `shopCode(kind)`, 0 for any other prop. Changes only at the round reset. */
    kind: t.uint8(),
  },
  "Prop",
);
export type Prop = SchemaType<typeof Prop>;
