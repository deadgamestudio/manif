/**
 * The street's shops: built into the facades and dealt a kind afresh at every
 * round reset (#68, #83). `generateShops` lays them out along the building
 * blocks (each with its own width, depth and height) and deals each a
 * `ShopKind`. The server runs it and syncs every shop as a prop (its box and
 * kind), so a late joiner sees the same street. The kind changes the look,
 * the sign, the HP and the drops (`PROP_TYPES`); the layout changes the shape.
 *
 * Satire, not a side: a bank and a bakery are equally slapstick to smash.
 * Sign names are invented puns, never a real brand, chain or bank.
 */
import type { Rect } from "../physics/index.js";
import type { Facade, Level, PropSlot, ShopKind } from "../level/index.js";
import { propShape } from "./prop.js";

export interface ShopType {
  /** Invented sign names; each shop shows one of them (`shopSign`). */
  signs: readonly [string, ...string[]];
  /** Relative odds of being dealt to a shop. */
  weight: number;
  /** At most this many of the kind on the street in one round. */
  cap: number;
}

export const SHOP_TYPES: Readonly<Record<ShopKind, ShopType>> = {
  boulangerie: { signs: ["Au Pain Perdu", "Baguette Magique"], weight: 3, cap: 3 },
  cafe: { signs: ["Le Bistrot du Coin", "Le Zinc Zinc"], weight: 3, cap: 3 },
  sneakers: { signs: ["Sneak'Hair", "Basket Case"], weight: 2, cap: 3 },
  banque: { signs: ["Banque du Grisbi", "Crédit Ébloui"], weight: 2, cap: 2 },
  kebab: { signs: ["Kebabylone", "Sauce Blanche-Neige"], weight: 2, cap: 3 },
  toilettage: { signs: ["Wouf'Hair", "Caniche Chic"], weight: 1, cap: 2 },
  // #117: parodies of the chains along a demo route. Never the real name or logo.
  burger: { signs: ["McDodo", "Burger Barricade"], weight: 2, cap: 2 },
  poulet: { signs: ["Tasty Croûte", "Crousty Party", "Tacos Cassés"], weight: 2, cap: 2 },
  sport: { signs: ["Foot Loquet", "Pied Locker", "Décathlard"], weight: 2, cap: 2 },
  telephone: { signs: ["Allo Réparo", "Écran Total"], weight: 1, cap: 2 },
  pharmacie: { signs: ["Pharmacie du Cortège", "Pharmacie Lacrymo"], weight: 2, cap: 2 },
  superette: { signs: ["Prix Cassés", "Supérette Coin-Coin"], weight: 2, cap: 2 },
  tabac: { signs: ["Tabac-Tac", "Presse-Purée"], weight: 2, cap: 2 },
};

/**
 * Every shop kind, in sync-code order: the synced `kind` of a prop is its
 * index here plus one, 0 meaning "not a shop". Only ever append, so codes
 * stay stable.
 */
export const SHOP_KINDS: readonly ShopKind[] = [
  "boulangerie",
  "cafe",
  "sneakers",
  "banque",
  "kebab",
  "toilettage",
  // #117, appended: codes 7 to 13.
  "burger",
  "poulet",
  "sport",
  "telephone",
  "pharmacie",
  "superette",
  "tabac",
];

/** What a shop of an unknown kind code stands in as (`shopLotOf`): any glass front will do. */
export const UNKNOWN_SHOP: ShopKind = "boulangerie";

/** The kind every round must have at least one of. */
export const REQUIRED_SHOP: ShopKind = "banque";

/**
 * How shops are laid out (#83). Lengths in world units. Every value the
 * generator picks is a multiple of 1/8, so it survives the float32 sync
 * exactly and the client builds the very box the server collides with.
 */
export const SHOP_LAYOUT = {
  /** Shop widths along the street; a bank is always wider than any other kind. */
  minWidth: 4,
  maxWidth: 5.5,
  bankMinWidth: 6,
  bankMaxWidth: 7.5,
  /** Each shop sits somewhere in a lot this long, so any kind fits whichever lot it is dealt. */
  minLot: 6,
  maxLot: 7.5,
  /** Plain wall between two lots on the same block. At least `clear`, so two shops never make a narrow notch. */
  minGap: 1.25,
  maxGap: 2,
  /** Plain wall kept at each end of a block, by the side-street corners. */
  endMargin: 1,
  /** How far a front stands out of the facade into the pavement; negative: set back into the wall. */
  minOut: -0.5,
  maxOut: 1,
  /**
   * The hitbox always stands at least this far out of the wall, even for a
   * front set back behind it, so a swing or a throw lands on the shop rather
   * than the building around it.
   */
  lip: 0.125,
  /** The hitbox also reaches this far into the building, so even a flush shop is a full unit thick (no tunnelling). */
  inset: 1,
  /** Room left between a shop (at its furthest out) and any other obstacle: a player (0.8 wide) passes, or can't get in at all. */
  clear: 1.25,
  /** Ground-floor height of a front, kept under the building's. */
  minHeight: 3,
  maxHeight: 4.25,
  /** Depth of the room reserved behind the front, inside the building (for walk-in shops later; unused for now). */
  minInterior: 3,
  maxInterior: 5,
  /** At least this many shops on the street, when the level has room for them. */
  minShops: 16,
  /** At most this many shops on the street. */
  maxShops: 20,
  /** How close a CRS spawn point may come, as a circle of this radius. */
  spawnRadius: 1,
} as const;

/** One shop of the round (#83): where it is built in, how big, and what it is. Synced field by field as a prop. */
export interface ShopLot {
  /** Its prop id. */
  id: string;
  kind: ShopKind;
  /** -1: on the left side of the street (negative X); 1: the right. */
  side: -1 | 1;
  /** Centre of the front along the street. */
  z: number;
  /** Width of the front along the street. */
  width: number;
  /** Distance from the centre line to the facade the shop is built into. */
  face: number;
  /** How far the front stands out of that facade into the pavement; negative: set back behind it. */
  out: number;
  /** Height of the storefront (frame, glass, sign band). */
  height: number;
  /**
   * Depth of the room behind the front, inside the building. Reserved for
   * walk-in shops; nothing collides or draws with it yet.
   */
  interior: number;
  /** Seed for the look (sign name, awning stripes...), 0..65535. */
  style: number;
  /**
   * Set on the client only, for a synced kind code this build doesn't know
   * (a tab left open across a deploy that adds kinds, #117): `kind` is then
   * only a stand-in, and the shop is drawn as a plain generic front.
   */
  unknown?: true;
}

/** The synced code of a shop kind (1..). */
export function shopCode(kind: ShopKind): number {
  return SHOP_KINDS.indexOf(kind) + 1;
}

/** The shop kind of a synced code; null for 0 or an unknown code. */
export function shopKindOf(code: number): ShopKind | null {
  return SHOP_KINDS[code - 1] ?? null;
}

/** Which of a kind's sign names a shop shows, from its style seed, so every client reads the same sign. */
export function shopSign(kind: ShopKind, style: number): string {
  const signs = SHOP_TYPES[kind].signs;
  return signs[Math.abs(Math.floor(style)) % signs.length] ?? signs[0];
}

/**
 * A shop's collision box, in world axes: from the front (at least `lip` out
 * of the wall) to `inset` inside the building. Server physics, melee, throws
 * and the client drawing all start from this one function.
 */
export function shopFootprint(lot: ShopLot): { x: number; z: number; halfX: number; halfZ: number } {
  const front = lot.face - Math.max(lot.out, SHOP_LAYOUT.lip);
  const back = lot.face + SHOP_LAYOUT.inset;
  return { x: (lot.side * (front + back)) / 2, z: lot.z, halfX: (back - front) / 2, halfZ: lot.width / 2 };
}

/**
 * The shop as a prop slot: its kind, its own box as the footprint, and turned
 * so its front (+X locally) faces the street (the right-hand ones half a turn,
 * which leaves an axis-aligned box as it is).
 */
export function shopSlot(lot: ShopLot): PropSlot {
  const box = shopFootprint(lot);
  return {
    id: lot.id,
    kind: lot.kind,
    x: box.x,
    z: box.z,
    rotation: lot.side < 0 ? 0 : Math.PI,
    footprint: { halfX: box.halfX, halfZ: box.halfZ },
  };
}

/** The synced fields of a shop prop (see `Prop` on the server, `PropShapeState` in net/). */
export interface ShopFields {
  kind: number;
  side: number;
  z: number;
  width: number;
  face: number;
  out: number;
  height: number;
  interior: number;
  style: number;
}

/**
 * A shop back from its synced prop; null for a prop that isn't one (kind 0,
 * or no size yet). A code this build doesn't know (newer server) still comes
 * back as a shop, marked `unknown` and standing in as `UNKNOWN_SHOP`, so its
 * room is carved like the server's and the client draws a generic front.
 */
export function shopLotOf(id: string, s: ShopFields): ShopLot | null {
  const known = shopKindOf(s.kind);
  if (!(s.kind > 0) || !(s.width > 0)) return null;
  const kind = known ?? UNKNOWN_SHOP;
  return {
    ...(known ? {} : { unknown: true as const }),
    id,
    kind,
    side: s.side < 0 ? -1 : 1,
    z: s.z,
    width: s.width,
    face: s.face,
    out: s.out,
    height: s.height,
    interior: s.interior,
    style: s.style,
  };
}


const ATTEMPTS = 50;

/**
 * Deal `count` shops, in street order. Rules: no kind more than its `cap`,
 * at least one `REQUIRED_SHOP`, and two neighbours (consecutive shops) never
 * the same kind. Odds follow each kind's `weight`. `random` returns values in
 * [0, 1) (Math.random in the room, a seeded generator in tests). With
 * `previous` (last round's deal), a deal identical to it is redrawn, so each
 * round looks different.
 */
export function dealShops(count: number, random: () => number = Math.random, previous?: readonly ShopKind[]): ShopKind[] {
  if (count <= 0) return [];
  let fallback: ShopKind[] | null = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const deal = tryDeal(count, random);
    if (!deal) continue;
    fallback ??= deal;
    if (!previous || previous.length !== deal.length || deal.some((k, i) => k !== previous[i])) return deal;
  }
  // Out of luck (or a tiny street with only one possible deal): cycle the kinds,
  // which follows every rule as long as the shops fit under the caps.
  return fallback ?? Array.from({ length: count }, (_, i) => SHOP_KINDS[(SHOP_KINDS.indexOf(REQUIRED_SHOP) + i) % SHOP_KINDS.length]!);
}

/** One try: the required kind on a random shop, then the others left to right. Null when it paints itself into a corner. */
function tryDeal(count: number, random: () => number): ShopKind[] | null {
  const deal: (ShopKind | undefined)[] = new Array<ShopKind | undefined>(count).fill(undefined);
  const used = new Map<ShopKind, number>();
  const required = Math.min(count - 1, Math.floor(random() * count));
  deal[required] = REQUIRED_SHOP;
  used.set(REQUIRED_SHOP, 1);
  for (let i = 0; i < count; i++) {
    if (i === required) continue;
    const options = SHOP_KINDS.filter((k) => (used.get(k) ?? 0) < SHOP_TYPES[k].cap && deal[i - 1] !== k && deal[i + 1] !== k);
    const total = options.reduce((sum, k) => sum + SHOP_TYPES[k].weight, 0);
    if (options.length === 0 || total <= 0) return null;
    let roll = random() * total;
    let pick = options[options.length - 1]!;
    for (const k of options) {
      roll -= SHOP_TYPES[k].weight;
      if (roll < 0) {
        pick = k;
        break;
      }
    }
    deal[i] = pick;
    used.set(pick, (used.get(pick) ?? 0) + 1);
  }
  return deal as ShopKind[];
}

/**
 * Something a shop keeps `SHOP_LAYOUT.clear` away from. `furniture` (vans,
 * kiosks, barriers, works walls, and the level's props: bins, shelters,
 * stalls, cars) never stands in front of a shop, even a flush one; a lamp
 * post or a tree may, a little way out.
 */
type Blocker = ({ type: "rect"; rect: Rect } | { type: "circle"; x: number; z: number; r: number }) & { furniture?: boolean; gap?: number };

/** Gap between two rectangles (0 when they touch or overlap). */
function rectGap(a: Rect, b: Rect): number {
  const gx = Math.max(a.minX - b.maxX, b.minX - a.maxX, 0);
  const gz = Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ, 0);
  return Math.hypot(gx, gz);
}

function gapTo(a: Rect, b: Blocker): number {
  if (b.type === "rect") return rectGap(a, b.rect);
  const dx = Math.max(a.minX - b.x, b.x - a.maxX, 0);
  const dz = Math.max(a.minZ - b.z, b.z - a.maxZ, 0);
  return Math.max(0, Math.hypot(dx, dz) - b.r);
}

/** What shops keep clear of: every obstacle but the buildings, the level's props, CRS spawns, items, and the start and end zones. */
function blockers(level: Level): Blocker[] {
  const out: Blocker[] = [];
  const rect = (x: number, z: number, hx: number, hz: number): Blocker => ({
    type: "rect",
    rect: { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz },
    furniture: true,
  });
  for (const b of level.boxes) if (b.kind !== "building") out.push(rect(b.x, b.z, b.halfX, b.halfZ));
  for (const c of level.circles) out.push({ type: "circle", x: c.x, z: c.z, r: c.r });
  for (const slot of level.propSlots) {
    const s = propShape(slot, false);
    if (s?.type === "box") out.push(rect(s.x, s.z, s.halfX, s.halfZ));
    else if (s) out.push({ type: "circle", x: s.x, z: s.z, r: s.r, furniture: true });
  }
  for (const p of level.crsSpawns) out.push({ type: "circle", x: p.x, z: p.z, r: SHOP_LAYOUT.spawnRadius });
  // Items on the ground only have to stay out from under a shop, reachable.
  for (const it of level.items) out.push({ type: "circle", x: it.x, z: it.z, r: 0.3, gap: 0.5 });
  // The start zone (where everyone spawns) and the Préfecture forecourt: no shop on either side of them.
  const b = level.bounds;
  for (const zone of [level.start, level.destination]) out.push({ type: "rect", rect: { minX: b.minX, maxX: b.maxX, minZ: zone.minZ, maxZ: zone.maxZ } });
  return out;
}

/** The ground a lot covers when its shop stands at most `out` out of the wall: its whole length, from the wall to there. */
function lotRect(f: Facade, minZ: number, maxZ: number, out: number): Rect {
  const near = f.face - Math.max(out, SHOP_LAYOUT.lip);
  return f.side < 0 ? { minX: -f.face, maxX: -near, minZ, maxZ } : { minX: near, maxX: f.face, minZ, maxZ };
}

/** How many layouts `generateShops` tries for `minShops` lots. */
const LAYOUT_ATTEMPTS = 8;

/** A random multiple of `step` in [lo, hi] (lo when the range is empty). */
function between(random: () => number, lo: number, hi: number, step = 0.125): number {
  const n = Math.floor((hi - lo) / step + 1e-9);
  if (n <= 0) return lo;
  return lo + Math.min(n, Math.floor(random() * (n + 1))) * step;
}

/** A free stretch of facade where one shop goes, whatever kind it is dealt. */
interface Lot {
  facade: Facade;
  minZ: number;
  maxZ: number;
  /** How far out of the wall its shop may stand: `maxOut` with room in front, 0 (flush or set back) without. */
  maxOut: number;
}

/**
 * Free lots along one block, from its start end (+Z) towards the Préfecture.
 * A lot with `clear` room in front of it at full depth may have a shop that
 * stands out; one with a lamp post or a tree closer than that still gets a
 * flush or set-back shop when the wall itself is clear. Furniture is kept
 * clear of the full depth either way.
 */
function lotsAlong(f: Facade, blocked: readonly Blocker[], random: () => number): Lot[] {
  const L = SHOP_LAYOUT;
  const out: Lot[] = [];
  const end = f.minZ + L.endMargin;
  const clear = (lo: number, hi: number, depth: number) => {
    const area = lotRect(f, lo, hi, depth);
    const full = lotRect(f, lo, hi, L.maxOut);
    return blocked.every((b) => gapTo(b.furniture ? full : area, b) >= (b.gap ?? L.clear));
  };
  let cursor = f.maxZ - L.endMargin - between(random, 0, L.maxGap - L.minGap);
  while (cursor > end) {
    // A random length, cut short to what is left of the block; and when
    // something stands in the way, a shortest lot still gets a try before
    // moving on, so a stretch between two lamp posts is not wasted (#117).
    const length = Math.min(between(random, L.minLot, L.maxLot), cursor - end);
    if (length < L.minLot) break;
    const fit = (len: number) => {
      const lo = cursor - len;
      const maxOut = clear(lo, cursor, L.maxOut) ? L.maxOut : clear(lo, cursor, 0) ? 0 : null;
      return maxOut === null ? null : { facade: f, minZ: lo, maxZ: cursor, maxOut };
    };
    const lot = fit(length) ?? (length > L.minLot ? fit(L.minLot) : null);
    if (lot) {
      out.push(lot);
      cursor = lot.minZ - between(random, L.minGap, L.maxGap);
    } else cursor -= 0.25;
  }
  return out;
}

export interface GenerateShopsOptions {
  /** Last round's shops: the deal is never the very same street twice in a row. */
  previous?: readonly ShopLot[];
  /** Prop ids are `<prefix>-1`, `<prefix>-2`... in street order. Default "shop". */
  prefix?: string;
}

/**
 * Lay out and deal the round's shops (#83). Pure: the same level and the
 * same `random` sequence give the same street. Along every facade it finds
 * free lots, clear of the side streets, the start and end zones, CRS spawn
 * points, vans, stalls, shelters, bins and everything else by
 * `SHOP_LAYOUT.clear`; keeps at most `maxShops` of them; deals the kinds in
 * street order (`dealShops`); then sizes each shop in its lot: a bank wide,
 * the others narrower, each with its own depth, height and look.
 *
 * The shops come back in street order: by their lots, from the start to the
 * Préfecture, left before right. That is what "neighbours" means for the
 * deal (on one side of the street it is also the order of the shops).
 */
export function generateShops(level: Level, random: () => number = Math.random, options: GenerateShopsOptions = {}): ShopLot[] {
  const L = SHOP_LAYOUT;
  const blocked = blockers(level);
  // A street with too few lots (the gaps fell badly) is laid out again; the fullest try wins.
  let lots: Lot[] = [];
  for (let attempt = 0; attempt < LAYOUT_ATTEMPTS && lots.length < L.minShops; attempt++) {
    const next = level.facades.flatMap((f) => lotsAlong(f, blocked, random));
    if (next.length > lots.length) lots = next;
  }
  // Too many: drop some at random, so the gaps move round from one round to the next.
  while (lots.length > L.maxShops) lots.splice(Math.floor(random() * lots.length), 1);
  lots.sort((a, b) => b.maxZ + b.minZ - (a.maxZ + a.minZ) || a.facade.side - b.facade.side);
  const kinds = dealShops(lots.length, random, options.previous?.map((s) => s.kind));
  const prefix = options.prefix ?? "shop";
  return lots.map((lot, i): ShopLot => {
    const kind = kinds[i]!;
    const f = lot.facade;
    const length = lot.maxZ - lot.minZ;
    // Widths in quarters, so the centre stays on the 1/8 grid.
    const width =
      kind === REQUIRED_SHOP
        ? between(random, L.bankMinWidth, Math.min(L.bankMaxWidth, length), 0.25)
        : between(random, L.minWidth, Math.min(L.maxWidth, length), 0.25);
    const start = lot.minZ + between(random, 0, length - width);
    return {
      id: `${prefix}-${i + 1}`,
      kind,
      side: f.side,
      z: start + width / 2,
      width,
      face: f.face,
      out: between(random, L.minOut, lot.maxOut),
      height: between(random, L.minHeight, Math.min(L.maxHeight, f.height - 1.5)),
      interior: between(random, L.minInterior, Math.min(L.maxInterior, f.depth - L.inset)),
      style: Math.floor(random() * 65536),
    };
  });
}
