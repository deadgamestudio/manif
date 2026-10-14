import { describe, expect, test } from "bun:test";
import { STREET_LEVEL as L, type ShopKind } from "../level/index.js";
import { ThrowableKind } from "../throwable/index.js";
import { PROP_TYPES, SHOP_FRONT } from "./constants.js";
import { propShape } from "./prop.js";
import {
  REQUIRED_SHOP,
  SHOP_KINDS,
  SHOP_TYPES,
  dealShops,
  dealtSlot,
  shopCode,
  shopKindOf,
  shopSign,
  shopSlots,
} from "./shops.js";

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

/** The dealing rules (#68): caps, at least one bank, no identical neighbours. */
function followsRules(deal: readonly ShopKind[]): boolean {
  const counts = new Map<ShopKind, number>();
  for (const k of deal) counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const [k, n] of counts) if (n > SHOP_TYPES[k].cap) return false;
  if (!deal.includes(REQUIRED_SHOP)) return false;
  return deal.every((k, i) => i === 0 || deal[i - 1] !== k);
}

describe("shop kinds (#68)", () => {
  test("at least boulangerie, café, sneakers and banque, each with HP, drops and an invented sign", () => {
    for (const k of ["boulangerie", "cafe", "sneakers", "banque"] as const) expect(SHOP_KINDS).toContain(k);
    for (const k of SHOP_KINDS) {
      const t = PROP_TYPES[k];
      expect(t.maxHp).toBeGreaterThan(0);
      expect(t.drops).toBeGreaterThan(0);
      expect(SHOP_TYPES[k].signs.length).toBeGreaterThan(0);
    }
    const signs = SHOP_KINDS.flatMap((k) => SHOP_TYPES[k].signs);
    expect(new Set(signs).size).toBe(signs.length);
  });

  test("every kind has the same footprint, and none burns or gets hopped (the room's fire list is built before the deal)", () => {
    for (const k of SHOP_KINDS) {
      expect(PROP_TYPES[k].intact).toEqual(SHOP_FRONT);
      expect(PROP_TYPES[k].broken).toBeNull();
      expect(PROP_TYPES[k].flammable).toBe(PROP_TYPES.shop_window.flammable);
      expect(PROP_TYPES[k].hoppable).toBe(PROP_TYPES.shop_window.hoppable);
    }
    for (const slot of shopSlots(L)) {
      for (const k of SHOP_KINDS) expect(propShape(dealtSlot(slot, shopCode(k)), false)).toEqual(propShape(slot, false));
    }
  });

  test("drops are existing throwables, and the bank is the toughest", () => {
    const items: number[] = [ThrowableKind.Pave, ThrowableKind.Tomate, ThrowableKind.Crotte, ThrowableKind.Trottinette];
    for (const k of SHOP_KINDS) expect(items).toContain(PROP_TYPES[k].dropKind);
    for (const k of SHOP_KINDS) if (k !== "banque") expect(PROP_TYPES[k].maxHp).toBeLessThan(PROP_TYPES.banque.maxHp);
  });

  test("codes round-trip; 0 and unknown codes are no kind", () => {
    for (const k of SHOP_KINDS) expect(shopKindOf(shopCode(k))).toBe(k);
    expect(shopKindOf(0)).toBeNull();
    expect(shopKindOf(SHOP_KINDS.length + 1)).toBeNull();
    // Codes fit the synced uint8.
    expect(SHOP_KINDS.length).toBeLessThan(255);
  });

  test("dealtSlot turns only shop slots into their kind", () => {
    const shop = shopSlots(L)[0]!;
    expect(dealtSlot(shop, shopCode("banque")).kind).toBe("banque");
    expect(dealtSlot(shop, 0)).toBe(shop);
    const bin = L.propSlots.find((s) => s.kind === "bin")!;
    expect(dealtSlot(bin, shopCode("banque"))).toBe(bin);
  });

  test("a sign is fixed per slot", () => {
    for (const slot of shopSlots(L)) expect(shopSign("cafe", slot.id)).toBe(shopSign("cafe", slot.id));
    expect(SHOP_TYPES.cafe.signs).toContain(shopSign("cafe", "shop-1"));
  });
});

describe("dealShops", () => {
  const slots = shopSlots(L);

  test("the street has 8 to 12 shop slots, in street order", () => {
    expect(slots.length).toBeGreaterThanOrEqual(8);
    expect(slots.length).toBeLessThanOrEqual(12);
    for (let i = 1; i < slots.length; i++) expect(slots[i]!.z).toBeLessThanOrEqual(slots[i - 1]!.z);
  });

  test("every deal follows the rules, over many seeds", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const deal = dealShops(slots.length, mulberry32(seed));
      expect(deal.length).toBe(slots.length);
      expect(followsRules(deal)).toBe(true);
    }
  });

  test("is repeatable for a seed, and varies between seeds", () => {
    expect(dealShops(slots.length, mulberry32(7))).toEqual(dealShops(slots.length, mulberry32(7)));
    const deals = new Set(Array.from({ length: 20 }, (_, i) => dealShops(slots.length, mulberry32(i + 1)).join(",")));
    expect(deals.size).toBeGreaterThan(15);
  });

  test("every kind turns up over a few rounds", () => {
    const seen = new Set<ShopKind>();
    for (let seed = 1; seed <= 20; seed++) for (const k of dealShops(slots.length, mulberry32(seed))) seen.add(k);
    expect(seen.size).toBe(SHOP_KINDS.length);
  });

  test("never deals the same street twice in a row", () => {
    const random = mulberry32(3);
    let prev = dealShops(slots.length, random);
    for (let round = 0; round < 200; round++) {
      const next = dealShops(slots.length, random, prev);
      expect(next).not.toEqual(prev);
      expect(followsRules(next)).toBe(true);
      prev = next;
    }
  });

  test("small streets and a broken generator still get a legal deal", () => {
    expect(dealShops(0, Math.random)).toEqual([]);
    expect(dealShops(1, Math.random)).toEqual([REQUIRED_SHOP]);
    for (const stuck of [() => 0, () => 0.999999]) {
      for (const n of [2, 5, slots.length]) expect(followsRules(dealShops(n, stuck))).toBe(true);
    }
  });
});
