import { describe, expect, test } from "bun:test";
import { MapSchema } from "@colyseus/schema";
import { PROP_TYPES, STREET_LEVEL, isShopSlot, shopCode, shopKindOf, shopSlots } from "@manif/shared";
import { Props } from "./props.js";
import { Prop } from "./schema.js";

/** Small seeded generator so the deals are repeatable. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const kinds = (views: MapSchema<Prop>) => shopSlots(STREET_LEVEL).map((s) => views.get(s.id)?.kind ?? 0);

describe("Props shop deal (#68)", () => {
  test("a reset deals every shop slot a kind, synced, with that kind's HP; other props stay kind 0", () => {
    const props = new Props(STREET_LEVEL, mulberry32(1));
    const views = new MapSchema<Prop>();
    props.reset(views);
    for (const base of STREET_LEVEL.propSlots) {
      const view = views.get(base.id)!;
      const slot = props.slot(base.id)!;
      if (isShopSlot(base)) {
        const kind = shopKindOf(view.kind);
        expect(kind).not.toBeNull();
        expect(slot.kind).toBe(kind!);
        expect(view.kind).toBe(shopCode(kind!));
      } else {
        expect(view.kind).toBe(0);
        expect(slot.kind).toBe(base.kind);
      }
      expect(view.hp).toBe(PROP_TYPES[slot.kind].maxHp);
      expect(props.hp(base.id)).toBe(view.hp);
    }
  });

  test("each reset deals a new street, and breaking returns the dealt slot (for its drops)", () => {
    const props = new Props(STREET_LEVEL, mulberry32(2));
    const views = new MapSchema<Prop>();
    props.reset(views);
    const first = kinds(views);
    const shop = shopSlots(STREET_LEVEL)[0]!;
    const res = props.damage(shop.id, 255, views.get(shop.id));
    expect(res?.broke).toBe(true);
    expect(res?.slot.kind).toBe(shopKindOf(views.get(shop.id)!.kind)!);
    props.reset(views);
    expect(kinds(views)).not.toEqual(first);
    expect(views.get(shop.id)!.broken).toBe(false);
  });

  test("the collision world is the same whatever the deal", () => {
    const a = new Props(STREET_LEVEL, mulberry32(3));
    const b = new Props(STREET_LEVEL, mulberry32(4));
    a.reset(new MapSchema<Prop>());
    b.reset(new MapSchema<Prop>());
    expect(a.world.boxes).toEqual(b.world.boxes);
    expect(a.world.circles).toEqual(b.world.circles);
  });
});
