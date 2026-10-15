/*
 * What a protester wears (#112): the colours painted on Jordan's body, from
 * the archetype and the player's id. Pure, so every client paints the same
 * player the same way without anything synced.
 *
 * Each archetype has a signature colour that reads from the iso camera (the
 * fluo vest, the CGT red, the all-black bloc...) and a short list of
 * variants for it and for the secondary clothes (trousers, scarf, backpack),
 * so two bobos don't look like clones. Skin and hair come from a list of
 * people, picked from the id alone, never from the archetype: an archetype
 * is clothes, never who wears them (PRODUCT.md, #14).
 *
 * Cost: one palette texture per distinct paint (models/palette.ts caches
 * them), and the lists are short, so a full room makes about one 16×1
 * texture per body, made once when the body is copied, never per frame.
 *
 * No protester colour may come near the police navy (#109): the test checks
 * every one of them. The disguised BAC is painted the same way, so it blends in.
 */
import { Archetype } from "@manif/shared";
import { MODELS, SKIN_CELL, bodyUrlFor, type CellPaint } from "../models/index.ts";

/** The parts of a body that get their own colour. */
type Part = "key" | "trousers" | "accent" | "hair";

const C = MODELS.characters;

/**
 * Which palette cells of each body file are which clothes, read from the
 * files (UVs per cell). Some cells hold more than one thing: cell 8 is also
 * the eyes on the gilet jaune, the lycéen hoodie and the maillot's trousers,
 * the sweat's cell 4 also the soles, the bobo's cell 12 also the phone, the
 * retraité's cell 5 is both the hair and the beret, the tracksuit's cell 1
 * the whole tracksuit and the cap.
 */
export const BODY_CELLS: Readonly<Record<string, Readonly<Partial<Record<Part, number>>>>> = {
  [C.neutral]: { key: 9, trousers: 1, hair: 5 },
  [C.bobo]: { key: 3, trousers: 12, accent: 0, hair: 5 },
  [C.tracksuit]: { key: 1, hair: 5 },
  [C.giletJaune]: { key: 8, trousers: 12, accent: 2, hair: 5 },
  // Cell 5 is under the hood: left black. Cell 9 is the goggles' strap and the mask's edge.
  [C.blackBloc]: { key: 8, accent: 9 },
  [C.cgt]: { key: 0, trousers: 1, hair: 5 },
  [C.retraite]: { key: 9, trousers: 1, hair: 5 },
  [C.lyceenHoodie]: { key: 8, trousers: 9, accent: 0, hair: 5 },
  [C.lyceenMaillot]: { key: 0, trousers: 8, accent: 9, hair: 5 },
  [C.lyceenneSweat]: { key: 4, trousers: 10, hair: 5 },
  [C.lyceenneCoupeVent]: { key: 1, trousers: 12, accent: 3, hair: 5 },
};

/** An archetype's colours: `key` is its signature, the others vary around it. `hair` overrides the person's (the retraité's grey). */
export interface Wardrobe {
  key: readonly string[];
  trousers?: readonly string[];
  accent?: readonly string[];
  hair?: readonly string[];
}

export const WARDROBES: Readonly<Record<Archetype, Wardrobe>> = {
  // The plain k-way, in a few light blues (far from the police navy).
  [Archetype.Lambda]: {
    key: ["#4ea6dc", "#48b3c6", "#7d9ad8"],
    trousers: ["#bfae8a", "#75787c", "#77714f", "#2b2826"],
  },
  // Earthy jacket, a bright scarf.
  [Archetype.Bobo]: {
    key: ["#727d36", "#b85c3c", "#8ea27c", "#74405f"],
    trousers: ["#ddd2b8", "#a9855b", "#4d3a2b"],
    accent: ["#f08a24", "#d9552b", "#239a6b", "#c8437f"],
  },
  // One colour head to toe, cap included.
  [Archetype.Cite]: {
    key: ["#e6e6e2", "#6f7378", "#22995a"],
  },
  // The fluo vest; reflective bands in silver.
  [Archetype.GiletJaune]: {
    key: ["#e9e21d", "#f2d61b", "#dde935"],
    trousers: ["#6b6f75", "#4f5a3b", "#7a6650", "#3a3836"],
    accent: ["#c9cdd2", "#e0e0dc"],
  },
  // All black, a neutral to warm black (never blue: the police is navy).
  [Archetype.BlackBloc]: {
    key: ["#161514", "#1c1a18", "#121111"],
    accent: ["#3e3a36", "#5a2c2c", "#4a5236"],
  },
  // CGT red.
  [Archetype.Cgt]: {
    key: ["#d32b2b", "#c41f24", "#dc3030"],
    trousers: ["#2e2b28", "#5c6066", "#6b5a45", "#43483a"],
  },
  // Bright hoodies and backpacks (four bodies, the cells differ: BODY_CELLS).
  [Archetype.Etudiant]: {
    key: ["#8340bd", "#3aa655", "#ef7d22", "#e0588f"],
    trousers: ["#4a4744", "#6e7277", "#2b2927", "#7d6b53"],
    accent: ["#f2a33a", "#2f2d2b", "#c23b3b", "#3ba0dc"],
  },
  // Beige and brown, grey hair (and the beret, same cell).
  [Archetype.Retraite]: {
    key: ["#c8b48f", "#8b6646", "#d8cfb8", "#a39d93"],
    trousers: ["#6e6a62", "#4f4539", "#8f8a7e"],
    hair: ["#dcd8d0", "#a39e95", "#77726a"],
  },
};

/** Skin and hair, from fair to deep. */
export interface Person {
  skin: string;
  hair: string;
}

export const PEOPLE: readonly Person[] = [
  { skin: "#f2d0b5", hair: "#c9a063" },
  { skin: "#eac0a0", hair: "#8a4a24" },
  { skin: "#e3b48f", hair: "#4a2f1d" },
  { skin: "#d6a07a", hair: "#2a1c14" },
  { skin: "#c58c64", hair: "#1d1714" },
  { skin: "#b07650", hair: "#3a2416" },
  { skin: "#9a6342", hair: "#1a1512" },
  { skin: "#7e4e33", hair: "#161210" },
  { skin: "#643c27", hair: "#121010" },
  { skin: "#4a2c1e", hair: "#0f0d0c" },
];

/** FNV-1a of `salt` and `id`, reduced to [0, n). Salted, so each part picks independently. */
export function pick(id: string, salt: string, n: number): number {
  if (n <= 1) return 0;
  const s = `${salt}|${id}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // FNV's low bits only depend on the characters' low bits: mix them (murmur3's finaliser) before the modulo.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) % n;
}

function from(list: readonly string[] | undefined, id: string, salt: string): string | undefined {
  return list?.length ? list[pick(id, salt, list.length)] : undefined;
}

/** The person (skin and hair) of player `id`, whatever their archetype. */
export function personFor(id: string): Person {
  return PEOPLE[pick(id, "person", PEOPLE.length)] ?? PEOPLE[0]!;
}

/**
 * The palette cells to paint on player (or disguised BAC) `id`'s body, for
 * `archetype`: its body file is `bodyUrlFor(archetype, id)`. Only the skin
 * on a body this file doesn't know.
 */
export function protesterPaint(archetype: number, id: string): CellPaint {
  const person = personFor(id);
  const paint: Record<number, string> = { [SKIN_CELL]: person.skin };
  const cells = BODY_CELLS[bodyUrlFor(archetype, id)];
  const wardrobe = WARDROBES[archetype as Archetype];
  if (!cells || !wardrobe) return paint;
  const colours: Record<Part, string | undefined> = {
    key: from(wardrobe.key, id, "key"),
    trousers: from(wardrobe.trousers, id, "trousers"),
    accent: from(wardrobe.accent, id, "accent"),
    hair: from(wardrobe.hair, id, "hair") ?? person.hair,
  };
  for (const part of ["key", "trousers", "accent", "hair"] as const) {
    const cell = cells[part];
    const colour = colours[part];
    if (cell !== undefined && colour) paint[cell] = colour;
  }
  return paint;
}
