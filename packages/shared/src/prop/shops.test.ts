import { describe, expect, test } from "bun:test";
import { MIN_OBSTACLE_HALF_THICKNESS, circleOverlaps, moveCircle, type Rect } from "../physics/index.js";
import { PLAYER_RADIUS, PLAYER_SPEED } from "../player/index.js";
import { TICK_DT } from "../net/index.js";
import { NavGrid } from "../crs/nav.js";
import { CRS_STATS } from "../crs/constants.js";
import { STREET_LEVEL as L, spawnPoint, type Facade, type ShopKind } from "../level/index.js";
import { ThrowableKind } from "../throwable/index.js";
import { PROP_TYPES } from "./constants.js";
import { propCollisionWorld, propShape } from "./prop.js";
import {
  REQUIRED_SHOP,
  SHOP_KINDS,
  SHOP_LAYOUT,
  SHOP_TYPES,
  dealShops,
  generateShops,
  shopCode,
  shopFootprint,
  shopKindOf,
  shopLotOf,
  shopSign,
  shopSlot,
  type ShopLot,
} from "./shops.js";

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

/** The dealing rules (#68): caps, at least one bank, no identical neighbours. */
function followsRules(deal: readonly ShopKind[]): boolean {
  const counts = new Map<ShopKind, number>();
  for (const k of deal) counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const [k, n] of counts) if (n > SHOP_TYPES[k].cap) return false;
  if (!deal.includes(REQUIRED_SHOP)) return false;
  return deal.every((k, i) => i === 0 || deal[i - 1] !== k);
}

const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);
const streets = SEEDS.map((seed) => generateShops(L, mulberry32(seed)));

function facadeOf(lot: ShopLot): Facade | undefined {
  return L.facades.find((f) => f.side === lot.side && lot.z > f.minZ && lot.z < f.maxZ);
}

/** The part of a shop's box out in the street (the rest is inside its building). */
function outside(lot: ShopLot): Rect {
  const b = shopFootprint(lot);
  const front = lot.face - Math.max(lot.out, SHOP_LAYOUT.lip);
  const x = lot.side < 0 ? { minX: -lot.face, maxX: -front } : { minX: front, maxX: lot.face };
  return { ...x, minZ: b.z - b.halfZ, maxZ: b.z + b.halfZ };
}

function rectGap(a: Rect, b: Rect): number {
  return Math.hypot(Math.max(a.minX - b.maxX, b.minX - a.maxX, 0), Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ, 0));
}

function circleGap(a: Rect, x: number, z: number, r: number): number {
  return Math.hypot(Math.max(a.minX - x, x - a.maxX, 0), Math.max(a.minZ - z, z - a.maxZ, 0)) - r;
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

  test("no shop burns, gets hopped or stays solid once broken; the level itself holds no shop", () => {
    for (const k of SHOP_KINDS) {
      expect(PROP_TYPES[k].broken).toBeNull();
      expect(PROP_TYPES[k].flammable).toBe(false);
      expect(PROP_TYPES[k].hoppable).toBe(false);
    }
    // The room's list of things that can burn is built from the level's slots once.
    for (const slot of L.propSlots) expect((SHOP_KINDS as readonly string[]).includes(slot.kind)).toBe(false);
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

  test("a sign comes from the shop's style seed, and every name turns up", () => {
    expect(shopSign("cafe", 7)).toBe(shopSign("cafe", 7));
    const seen = new Set(Array.from({ length: 10 }, (_, i) => shopSign("cafe", i)));
    expect([...seen].sort()).toEqual([...SHOP_TYPES.cafe.signs].sort());
  });
});

describe("dealShops", () => {
  const count = SHOP_LAYOUT.maxShops;

  test("every deal follows the rules, over many seeds", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const deal = dealShops(count, mulberry32(seed));
      expect(deal.length).toBe(count);
      expect(followsRules(deal)).toBe(true);
    }
  });

  test("is repeatable for a seed, and varies between seeds", () => {
    expect(dealShops(count, mulberry32(7))).toEqual(dealShops(count, mulberry32(7)));
    const deals = new Set(Array.from({ length: 20 }, (_, i) => dealShops(count, mulberry32(i + 1)).join(",")));
    expect(deals.size).toBeGreaterThan(15);
  });

  test("never deals the same street twice in a row", () => {
    const random = mulberry32(3);
    let prev = dealShops(count, random);
    for (let round = 0; round < 200; round++) {
      const next = dealShops(count, random, prev);
      expect(next).not.toEqual(prev);
      expect(followsRules(next)).toBe(true);
      prev = next;
    }
  });

  test("small streets and a broken generator still get a legal deal", () => {
    expect(dealShops(0, Math.random)).toEqual([]);
    expect(dealShops(1, Math.random)).toEqual([REQUIRED_SHOP]);
    for (const stuck of [() => 0, () => 0.999999]) {
      for (const n of [2, 5, count]) expect(followsRules(dealShops(n, stuck))).toBe(true);
    }
  });
});

describe("generateShops (#83)", () => {
  test("is repeatable for a seed, and lays out a different street for another", () => {
    expect(generateShops(L, mulberry32(9))).toEqual(generateShops(L, mulberry32(9)));
    const layouts = new Set(streets.slice(0, 20).map((s) => s.map((l) => `${l.side}${l.z}${l.width}`).join(",")));
    expect(layouts.size).toBe(20);
  });

  test("8 to 12 shops a round, in street order, with unique ids", () => {
    for (const shops of streets) {
      expect(shops.length).toBeGreaterThanOrEqual(SHOP_LAYOUT.minShops);
      expect(shops.length).toBeLessThanOrEqual(SHOP_LAYOUT.maxShops);
      // On each side, from the start to the Préfecture.
      for (const side of [-1, 1]) {
        const zs = shops.filter((s) => s.side === side).map((s) => s.z);
        for (let i = 1; i < zs.length; i++) expect(zs[i]!).toBeLessThan(zs[i - 1]!);
      }
      expect(new Set(shops.map((s) => s.id)).size).toBe(shops.length);
    }
    expect(generateShops(L, mulberry32(1), { prefix: "shop7" })[0]!.id).toBe("shop7-1");
  });

  test("every street follows the dealing rules, and every kind turns up", () => {
    const seen = new Set<ShopKind>();
    for (const shops of streets) {
      expect(followsRules(shops.map((s) => s.kind))).toBe(true);
      for (const s of shops) seen.add(s.kind);
    }
    expect(seen.size).toBe(SHOP_KINDS.length);
  });

  test("never the same street twice in a row", () => {
    const random = mulberry32(5);
    let prev = generateShops(L, random);
    for (let round = 0; round < 100; round++) {
      const next = generateShops(L, random, { previous: prev });
      const same = next.length === prev.length && next.every((s, i) => s.kind === prev[i]!.kind);
      expect(same).toBe(false);
      prev = next;
    }
  });

  test("sizes vary in their ranges, a bank always wider than any other shop, in exact float32 steps", () => {
    const L8 = SHOP_LAYOUT;
    const widths = new Set<number>();
    const outs = new Set<number>();
    for (const shops of streets) {
      for (const s of shops) {
        if (s.kind === REQUIRED_SHOP) {
          expect(s.width).toBeGreaterThanOrEqual(L8.bankMinWidth);
          expect(s.width).toBeLessThanOrEqual(L8.bankMaxWidth);
        } else {
          expect(s.width).toBeGreaterThanOrEqual(L8.minWidth);
          expect(s.width).toBeLessThanOrEqual(L8.maxWidth);
        }
        expect(s.out).toBeGreaterThanOrEqual(L8.minOut);
        expect(s.out).toBeLessThanOrEqual(L8.maxOut);
        expect(s.height).toBeGreaterThanOrEqual(L8.minHeight);
        expect(s.height).toBeLessThanOrEqual(L8.maxHeight);
        expect(s.interior).toBeGreaterThanOrEqual(L8.minInterior);
        expect(s.interior).toBeLessThanOrEqual(L8.maxInterior);
        expect(Number.isInteger(s.style) && s.style >= 0 && s.style < 65536).toBe(true);
        for (const v of [s.z, s.width, s.face, s.out, s.height, s.interior]) {
          expect(Math.fround(v)).toBe(v);
          expect(Number.isInteger(v * 8)).toBe(true);
        }
        widths.add(s.width);
        outs.add(s.out);
      }
    }
    expect(L8.bankMinWidth).toBeGreaterThan(L8.maxWidth);
    expect(widths.size).toBeGreaterThan(10);
    // Set back, flush and standing out all happen.
    expect([...outs].some((o) => o < 0)).toBe(true);
    expect([...outs].some((o) => o > 0.5)).toBe(true);
  });

  test("built into a facade: inside its block, under its roof, the room behind it inside the building", () => {
    for (const shops of streets) {
      for (const s of shops) {
        const f = facadeOf(s);
        expect(f).toBeDefined();
        if (!f) continue;
        expect(s.face).toBe(f.face);
        expect(s.z - s.width / 2).toBeGreaterThanOrEqual(f.minZ + SHOP_LAYOUT.endMargin);
        expect(s.z + s.width / 2).toBeLessThanOrEqual(f.maxZ - SHOP_LAYOUT.endMargin);
        expect(s.height).toBeLessThan(f.height);
        expect(s.interior + SHOP_LAYOUT.inset).toBeLessThanOrEqual(f.depth);
        // Its box: thick enough not to be tunnelled through, reaching into the building, sticking out by `out` (or the lip).
        const b = shopFootprint(s);
        expect(b.halfX).toBeGreaterThanOrEqual(MIN_OBSTACLE_HALF_THICKNESS);
        expect(b.halfZ).toBeGreaterThanOrEqual(MIN_OBSTACLE_HALF_THICKNESS);
        expect(Math.abs(b.x) + b.halfX).toBeCloseTo(f.face + SHOP_LAYOUT.inset, 9);
        expect(Math.abs(b.x) - b.halfX).toBeCloseTo(f.face - Math.max(s.out, SHOP_LAYOUT.lip), 9);
        expect(Math.sign(b.x)).toBe(s.side);
      }
    }
  });

  test("no two shops overlap or leave a gap a player could wedge in", () => {
    for (const shops of streets) {
      for (let i = 0; i < shops.length; i++) {
        for (let j = i + 1; j < shops.length; j++) {
          const a = shops[i]!;
          const b = shops[j]!;
          if (a.side !== b.side) continue;
          expect(Math.abs(a.z - b.z) - (a.width + b.width) / 2).toBeGreaterThanOrEqual(SHOP_LAYOUT.clear);
        }
      }
    }
  });

  test("clear of side streets, the start and end zones, spawns, vans, stalls, shelters, bins and everything else", () => {
    const clear = SHOP_LAYOUT.clear - 1e-9;
    for (const shops of streets) {
      for (const s of shops) {
        const r = outside(s);
        // Furniture never stands in front of a shop, even a flush one: clear of where any shop there could stand out to.
        const front = s.side < 0 ? { minX: -s.face, maxX: -(s.face - SHOP_LAYOUT.maxOut) } : { minX: s.face - SHOP_LAYOUT.maxOut, maxX: s.face };
        const full = { ...r, ...front };
        for (const b of L.boxes) {
          if (b.kind === "building") continue;
          expect(rectGap(full, { minX: b.x - b.halfX, maxX: b.x + b.halfX, minZ: b.z - b.halfZ, maxZ: b.z + b.halfZ })).toBeGreaterThanOrEqual(clear);
        }
        for (const slot of L.propSlots) {
          const p = propShape(slot, false)!;
          const gap = p.type === "circle" ? circleGap(full, p.x, p.z, p.r) : rectGap(full, { minX: p.x - p.halfX, maxX: p.x + p.halfX, minZ: p.z - p.halfZ, maxZ: p.z + p.halfZ });
          expect(gap).toBeGreaterThanOrEqual(clear);
        }
        // Trees, lamp posts and bollards keep clear of the shop itself.
        for (const c of L.circles) expect(circleGap(r, c.x, c.z, c.r)).toBeGreaterThanOrEqual(clear);
        for (const p of L.crsSpawns) expect(circleGap(r, p.x, p.z, SHOP_LAYOUT.spawnRadius)).toBeGreaterThanOrEqual(clear);
        // Items on the ground stay out from under it.
        for (const it of L.items) expect(circleGap(r, it.x, it.z, 0.3)).toBeGreaterThanOrEqual(0.5 - 1e-9);
        for (const zone of [L.start, L.destination]) {
          const apart = r.maxZ + clear <= zone.minZ || r.minZ - clear >= zone.maxZ;
          expect(apart).toBe(true);
        }
      }
    }
  });

  test("synced fields come back as the same shop, and as a prop slot with its own box", () => {
    for (const s of streets[0]!) {
      const fields = { ...s, kind: shopCode(s.kind), side: s.side };
      expect(shopLotOf(s.id, fields)).toEqual(s);
      const slot = shopSlot(s);
      expect(slot.kind).toBe(s.kind);
      const b = shopFootprint(s);
      expect(propShape(slot, false)).toEqual({ type: "box", x: b.x, z: b.z, halfX: b.halfX, halfZ: b.halfZ });
      expect(propShape(slot, true)).toBeNull();
    }
    expect(shopLotOf("bin-1", { kind: 0, side: 0, z: 0, width: 0, face: 0, out: 0, height: 0, interior: 0, style: 0 })).toBeNull();
  });

  test("players never end up inside anything, and CRS still find their way down the whole street", () => {
    const step = PLAYER_SPEED * TICK_DT;
    const clearance = Math.max(...Object.values(CRS_STATS).map((c) => c.radius));
    for (const shops of streets.slice(0, 10)) {
      const world = propCollisionWorld(L, () => false, [...L.propSlots, ...shops.map(shopSlot)]);
      const rand = mulberry32(shops.length);
      let p = spawnPoint(L, PLAYER_RADIUS, rand);
      let angle = 0;
      for (let tick = 0; tick < 30 * 300; tick++) {
        if (tick % 20 === 0) angle = rand() * Math.PI * 2;
        p = moveCircle(world, p, Math.sin(angle) * step * 1.5, (Math.cos(angle) - 0.6) * step, PLAYER_RADIUS);
        expect(circleOverlaps(world, p.x, p.z, PLAYER_RADIUS)).toBe(false);
      }
      const nav = new NavGrid(world, clearance);
      expect(nav.findPath({ x: 0, z: 92 }, { x: 0, z: -95 })).not.toBeNull();
    }
  });
});
