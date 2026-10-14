import { describe, expect, test } from "bun:test";
import { MapSchema } from "@colyseus/schema";
import { PROP_TYPES, STREET_LEVEL, circleOverlaps, propShape, shopFootprint, shopKindOf, shopLotOf, shopSlot } from "@manif/shared";
import { Props } from "./props.js";
import { Prop } from "./schema.js";

/** Small seeded generator so the streets are repeatable. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("Props shops (#68, #83)", () => {
  test("a reset builds the round's shops and syncs each one whole: kind, box and HP; level props stay kind 0", () => {
    const props = new Props(STREET_LEVEL, mulberry32(1));
    const views = new MapSchema<Prop>();
    props.reset(views);
    expect(props.shops.length).toBeGreaterThanOrEqual(8);
    expect(views.size).toBe(STREET_LEVEL.propSlots.length + props.shops.length);
    for (const lot of props.shops) {
      const view = views.get(lot.id)!;
      // What a client decodes is exactly what the server generated (float32 fields included).
      expect(shopLotOf(lot.id, view)).toEqual(lot);
      expect(props.slot(lot.id)).toEqual(shopSlot(lot));
      expect(view.hp).toBe(PROP_TYPES[lot.kind].maxHp);
      expect(props.hp(lot.id)).toBe(view.hp);
    }
    for (const base of STREET_LEVEL.propSlots) {
      const view = views.get(base.id)!;
      expect(view.kind ?? 0).toBe(0);
      expect(view.width ?? 0).toBe(0);
      expect(view.hp).toBe(PROP_TYPES[base.kind].maxHp);
    }
  });

  test("each shop collides as its own box until it breaks, then the gap is walkable", () => {
    const props = new Props(STREET_LEVEL, mulberry32(2));
    const views = new MapSchema<Prop>();
    props.reset(views);
    const lot = props.shops.find((s) => s.out > 0.5) ?? props.shops[0]!;
    const box = shopFootprint(lot);
    expect(props.world.boxes).toContainEqual(propShape(shopSlot(lot), false) as (typeof props.world.boxes)[number]);
    expect(propShape(shopSlot(lot), false)).toMatchObject(box);
    const front = { x: box.x - lot.side * (box.halfX + 0.35), z: box.z };
    expect(circleOverlaps(props.world, front.x, front.z, 0.4)).toBe(true);
    const res = props.damage(lot.id, 255, views.get(lot.id));
    expect(res?.broke).toBe(true);
    expect(res?.slot.kind).toBe(shopKindOf(views.get(lot.id)!.kind)!);
    expect(circleOverlaps(props.world, front.x, front.z, 0.4)).toBe(false);
    // Swings reach it from the street while it stands.
    props.reset(views, false);
    const target = [...props.targets()].find((t) => t.id === lot.id);
    expect(target?.shape).toEqual(propShape(shopSlot(lot), false)!);
  });

  test("a new layout each reset, the old shops gone from the map; a reset without relayout keeps the street", () => {
    const props = new Props(STREET_LEVEL, mulberry32(3));
    const views = new MapSchema<Prop>();
    props.reset(views);
    const first = props.shops;
    const firstLot = first[0]!;
    props.damage(firstLot.id, 255, views.get(firstLot.id));
    // Start of the march (#83): same shops, whole again.
    props.reset(views, false);
    expect(props.shops).toBe(first);
    expect(views.get(firstLot.id)!.broken).toBe(false);
    // The next round: new shops, new ids.
    props.reset(views);
    expect(props.shops).not.toEqual(first);
    for (const lot of first) expect(views.has(lot.id)).toBe(false);
    for (const lot of props.shops) expect(views.has(lot.id)).toBe(true);
    expect(views.size).toBe(STREET_LEVEL.propSlots.length + props.shops.length);
  });
});
