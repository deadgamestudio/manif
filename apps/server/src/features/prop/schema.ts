import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * Runtime state of one breakable prop (#4), keyed by its id in
 * `StreetState.props`. For a level prop only HP and state are synced: its
 * position and size are in the shared level data, which the client already
 * has. A shop (#68, #83) is generated each round, so its kind and its whole
 * `ShopLot` are synced too, set once when the round lays the street out and
 * never changed mid-round (see `shopLotOf` in shared). Every length the
 * generator picks is a multiple of 1/8, exact in float32.
 */
export const Prop = schema(
  {
    hp: t.uint8(),
    broken: t.boolean(),
    /** Burnt out (#16): still in the way, never burns again. Cleared by the round reset. */
    charred: t.boolean(),
    /** A shop's kind (#68): `shopCode(kind)`, 0 for any other prop. */
    kind: t.uint8(),
    /** A shop's side (#83): -1 left, 1 right. 0, like the fields below, for any other prop. */
    side: t.int8(),
    z: t.float32(),
    width: t.float32(),
    face: t.float32(),
    out: t.float32(),
    height: t.float32(),
    /** Depth of the room behind the front, reserved for walk-in shops (unused yet). */
    interior: t.float32(),
    style: t.uint16(),
  },
  "Prop",
);
export type Prop = SchemaType<typeof Prop>;
