/**
 * Shops dealt at random each round (#68). The level has shop slots (kind
 * `shop_window`); at every round reset the server deals each one a
 * `ShopKind` with `dealShops`, and syncs it as a small code (`shopCode`), so a
 * late joiner sees the same street. The kind changes the look, the sign, the
 * HP and the drops (`PROP_TYPES`), never the collision shape.
 *
 * Satire, not a side: a bank and a bakery are equally slapstick to smash.
 * Sign names are invented puns, never a real brand, chain or bank.
 */
import type { Level, PropSlot, ShopKind } from "../level/index.js";

export interface ShopType {
  /** Invented sign names; each slot shows one of them (`shopSign`). */
  signs: readonly [string, ...string[]];
  /** Relative odds of being dealt to a slot. */
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
};

/**
 * Every shop kind, in sync-code order: the synced `kind` of a prop is its
 * index here plus one, 0 meaning "not dealt" (not a shop slot, or not yet).
 * Only ever append, so codes stay stable.
 */
export const SHOP_KINDS: readonly ShopKind[] = ["boulangerie", "cafe", "sneakers", "banque", "kebab", "toilettage"];

/** The kind every round must have at least one of. */
export const REQUIRED_SHOP: ShopKind = "banque";

/** The level slot kind that gets a shop dealt. */
export const SHOP_SLOT_KIND = "shop_window";

export function isShopSlot(slot: PropSlot): boolean {
  return slot.kind === SHOP_SLOT_KIND;
}

/** The synced code of a shop kind (1..). */
export function shopCode(kind: ShopKind): number {
  return SHOP_KINDS.indexOf(kind) + 1;
}

/** The shop kind of a synced code; null for 0 or an unknown code. */
export function shopKindOf(code: number): ShopKind | null {
  return SHOP_KINDS[code - 1] ?? null;
}

/**
 * The slot as it plays this round: a shop slot with a dealt code becomes its
 * shop kind (same place, same footprint); anything else is unchanged.
 */
export function dealtSlot(slot: PropSlot, code: number): PropSlot {
  if (!isShopSlot(slot)) return slot;
  const kind = shopKindOf(code);
  return kind ? { ...slot, kind } : slot;
}

/** The level's shop slots in street order (from the start to the Préfecture), which is what "neighbours" means. */
export function shopSlots(level: Level): PropSlot[] {
  return level.propSlots.filter(isShopSlot).sort((a, b) => b.z - a.z || a.x - b.x);
}

/** Which of a kind's sign names this slot shows: fixed per slot, so every client reads the same sign. */
export function shopSign(kind: ShopKind, slotId: string): string {
  const signs = SHOP_TYPES[kind].signs;
  let h = 0;
  for (let i = 0; i < slotId.length; i++) h = (h * 31 + slotId.charCodeAt(i)) >>> 0;
  return signs[h % signs.length] ?? signs[0];
}

const ATTEMPTS = 50;

/**
 * Deal `count` shops, one per slot in street order. Rules: no kind more than
 * its `cap`, at least one `REQUIRED_SHOP`, and two neighbours (consecutive
 * slots) never the same kind. Odds follow each kind's `weight`. `random`
 * returns values in [0, 1) (Math.random in the room, a seeded generator in
 * tests). With `previous` (last round's deal), a deal identical to it is
 * redrawn, so each round looks different.
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
  // which follows every rule as long as the slots fit under the caps.
  return fallback ?? Array.from({ length: count }, (_, i) => SHOP_KINDS[(SHOP_KINDS.indexOf(REQUIRED_SHOP) + i) % SHOP_KINDS.length]!);
}

/** One try: the required kind on a random slot, then the others left to right. Null when it paints itself into a corner. */
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
