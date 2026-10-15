/*
 * What a protester wears on top of their body (#113): a hat, something on
 * the back, a scarf, or nothing. Picked from the archetype, the body file and
 * the player's id, so every client dresses the same player the same way
 * without anything synced, like the colours (protesterLook.ts, same hash).
 *
 * The models (models/assets.ts `accessories`) were made by Claude in Blender,
 * in Jordan's style. Each one's pivot is the origin of the bone it goes on,
 * so it is added to that bone as is (WornAccessories.tsx).
 *
 * Rules:
 * - at most one head item, one back item, and a scarf only when that leaves
 *   two items at most: flavour, not a uniform, and a fair share wear nothing;
 * - nothing a body already has (BODY_WEARS): the tracksuit's cap, the
 *   retraité's beret, the black bloc's hood and mask, the CGT's union flag,
 *   the bobo's scarf, three of the lycéen bodies' backpacks;
 * - flags and placards are rare (about one protester in six), or the
 *   cortège turns into a forest;
 * - a few items get a colour per player (TINTS), from short lists, so the
 *   palette cache (models/palette.ts) makes a handful of textures, not one
 *   per player. None is near the police navy (#109).
 */
import { Archetype } from "@manif/shared";
import { MODELS, type CellPaint } from "../models/index.ts";
import { pick } from "./protesterLook.ts";

export type AccessoryName = keyof typeof MODELS.accessories;
type Slot = "head" | "back";

/** Where each item goes on the rig. */
export const ACCESSORY_BONE: Readonly<Record<AccessoryName, "head" | "spine">> = {
  beanie: "head",
  cap: "head",
  cgtCap: "head",
  beret: "head",
  bandana: "head",
  scarf: "spine",
  backpack: "spine",
  toteBag: "spine",
  flag: "spine",
  placard: "spine",
};

/** Held up on a pole behind the head: put away while grabbed, carried, or carrying someone. */
export const TALL_ACCESSORIES: ReadonlySet<AccessoryName> = new Set(["flag", "placard"]);

/** What a body file already wears, so nothing doubles up. */
interface Wears {
  /** A cap, a beret or a hood: no head item but a bandana. */
  hat?: boolean;
  /** The face is covered: no bandana, no scarf. */
  mask?: boolean;
  scarf?: boolean;
  /** Something on the back already: no backpack or tote bag. */
  backpack?: boolean;
  /** A flag or a placard of its own: no other. */
  sign?: boolean;
}

const B = MODELS.characters;

export const BODY_WEARS: Readonly<Record<string, Wears>> = {
  [B.neutral]: {},
  [B.bobo]: { scarf: true },
  [B.tracksuit]: { hat: true },
  [B.giletJaune]: {},
  [B.blackBloc]: { hat: true, mask: true },
  [B.cgt]: { sign: true },
  [B.retraite]: { hat: true },
  [B.lyceenHoodie]: { backpack: true },
  [B.lyceenMaillot]: { backpack: true },
  [B.lyceenneSweat]: {},
  [B.lyceenneCoupeVent]: { backpack: true },
};

/** Odds per archetype: integer weights per slot (`none` included), and one scarf in `scarf` (0: never). */
interface Odds {
  head: Partial<Record<AccessoryName | "none", number>>;
  back: Partial<Record<AccessoryName | "none", number>>;
  scarf: number;
}

export const ODDS: Readonly<Record<Archetype, Odds>> = {
  [Archetype.Lambda]: { head: { none: 8, cap: 3, beanie: 3, beret: 1 }, back: { none: 9, backpack: 3, toteBag: 2, flag: 1, placard: 1 }, scarf: 6 },
  [Archetype.Bobo]: { head: { none: 6, beanie: 3, beret: 3, cap: 1 }, back: { none: 7, toteBag: 4, backpack: 1, placard: 1 }, scarf: 0 },
  [Archetype.Cite]: { head: { none: 6, bandana: 2 }, back: { none: 8, backpack: 3, flag: 1 }, scarf: 0 },
  [Archetype.GiletJaune]: { head: { none: 6, cap: 3, beanie: 2 }, back: { none: 8, backpack: 2, placard: 1, flag: 1 }, scarf: 8 },
  [Archetype.BlackBloc]: { head: { none: 1 }, back: { none: 5, backpack: 3, flag: 1 }, scarf: 0 },
  [Archetype.Cgt]: { head: { none: 5, cgtCap: 5, beanie: 1 }, back: { none: 7, backpack: 1, toteBag: 1 }, scarf: 3 },
  [Archetype.Etudiant]: { head: { none: 6, cap: 3, beanie: 3, bandana: 1 }, back: { none: 9, backpack: 4, toteBag: 1, placard: 1, flag: 1 }, scarf: 6 },
  [Archetype.Retraite]: { head: { none: 1 }, back: { none: 6, toteBag: 3, placard: 1 }, scarf: 3 },
};

/** Per-player colours: the item's main palette cell, and the colours it can take. */
export const TINTS: Readonly<Partial<Record<AccessoryName, { cell: number; colours: readonly string[] }>>> = {
  beanie: { cell: 0, colours: ["#c62828", "#ef7d22", "#3aa655", "#e9c21d", "#8a8a86", "#e0588f"] },
  // The file's cell 12 is a dark blue, too close to the police navy: always repainted.
  cap: { cell: 12, colours: ["#d32b2b", "#ece8df", "#e9c21d", "#2e8b57", "#1d1b1a", "#ef7d22"] },
  // Cell 1 is near the police navy too.
  beret: { cell: 1, colours: ["#1b1a19", "#6d1f2a", "#4f5a2b", "#b3262b"] },
  scarf: { cell: 0, colours: ["#c62828", "#ef7d22", "#3aa655", "#8340bd", "#e9c21d", "#2a9d8f"] },
  backpack: { cell: 12, colours: ["#ef7d22", "#c23b3b", "#3aa655", "#e9c21d", "#8340bd", "#2a9d8f"] },
};
/** The backpack's pocket (cell 9, a blue-grey): a plain dark grey. */
const BACKPACK_POCKET: CellPaint = { 9: "#2e2d2b" };
/** The black bloc's flag is black. */
const BLACK_FLAG: CellPaint = { 0: "#161514" };

export interface Accessory {
  name: AccessoryName;
  /** Palette cells to repaint on this copy, if any. */
  paint?: CellPaint;
}

function allowed(name: AccessoryName, wears: Wears): boolean {
  switch (name) {
    case "bandana":
      return !wears.mask;
    case "beanie":
    case "cap":
    case "cgtCap":
    case "beret":
      return !wears.hat;
    case "scarf":
      return !wears.scarf && !wears.mask;
    case "backpack":
    case "toteBag":
      return !wears.backpack;
    case "flag":
    case "placard":
      return !wears.sign;
  }
}

/** One of `weights` (some ruled out by the body), by weight, or null for none. */
function choose(id: string, slot: Slot, weights: Odds[Slot], wears: Wears): AccessoryName | null {
  const options = (Object.entries(weights) as [AccessoryName | "none", number][]).filter(([name, w]) => w > 0 && (name === "none" || allowed(name, wears)));
  const total = options.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return null;
  let roll = pick(id, `wear-${slot}`, total);
  for (const [name, w] of options) {
    if (roll < w) return name === "none" ? null : name;
    roll -= w;
  }
  return null;
}

function paintFor(name: AccessoryName, archetype: number, id: string): CellPaint | undefined {
  if (name === "flag") return archetype === Archetype.BlackBloc ? BLACK_FLAG : undefined;
  const tint = TINTS[name];
  if (!tint) return undefined;
  const colour = tint.colours[pick(id, `tint-${name}`, tint.colours.length)] ?? tint.colours[0]!;
  return name === "backpack" ? { ...BACKPACK_POCKET, [tint.cell]: colour } : { [tint.cell]: colour };
}

/**
 * What player (or disguised BAC) `id` wears on body file `bodyUrl` (from
 * `bodyUrlFor(archetype, id)`): 0 to 2 items, at most one per bone slot.
 * The same answer on every call and every client. Unknown archetype or body: nothing.
 */
export function accessoriesFor(archetype: number, bodyUrl: string, id: string): Accessory[] {
  const odds = ODDS[archetype as Archetype];
  const wears = BODY_WEARS[bodyUrl];
  if (!odds || !wears) return [];
  const names: AccessoryName[] = [];
  const head = choose(id, "head", odds.head, wears);
  const back = choose(id, "back", odds.back, wears);
  if (head) names.push(head);
  if (back) names.push(back);
  const scarf = odds.scarf > 0 && pick(id, "wear-scarf", odds.scarf) === 0 && allowed("scarf", wears);
  // The bandana's flap hangs where the scarf goes.
  if (scarf && names.length < 2 && head !== "bandana") names.push("scarf");
  return names.map((name) => {
    const paint = paintFor(name, archetype, id);
    return paint ? { name, paint } : { name };
  });
}
