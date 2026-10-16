/*
 * The protester drawn on each archetype's lobby portrait (#126). The lobby
 * shows pre-rendered images (public/portraits/, made by `bun run portraits`),
 * so they show one fixed variant, not the random look a player gets:
 *
 * - the archetype's first body file (the lycéen hoodie for the étudiant·e);
 * - the first colour of each of its wardrobe's lists;
 * - one person (skin and hair) for all eight, so the portraits differ by
 *   their clothes only, as in the game (PRODUCT.md, #14);
 * - the CGT with the merguez barbecue (cgtKit.ts), no worn accessories
 *   (they are random flavour, accessories.ts).
 */
import { Archetype, archetypeOf } from "@manif/shared";
import { ARCHETYPE_BODIES, SKIN_CELL, type CellPaint } from "../models/index.ts";
import { BODY_CELLS, PEOPLE, WARDROBES, type Person } from "./protesterLook.ts";
import type { CgtKit } from "./cgtKit.ts";

/** The one person on every portrait: a mid skin tone, dark brown hair. */
export const PORTRAIT_PERSON: Person = PEOPLE[3]!;

/** The CGT's kit on his portrait. */
export const PORTRAIT_CGT_KIT: CgtKit = "merguez";

/** The body file on archetype `id`'s portrait. */
export function portraitBodyUrl(id: number): string {
  return ARCHETYPE_BODIES[archetypeOf(id)][0]!;
}

/** The palette cells painted on that body: like protesterPaint, with the first of every list. */
export function portraitPaint(id: number): CellPaint {
  const archetype: Archetype = archetypeOf(id);
  const paint: Record<number, string> = { [SKIN_CELL]: PORTRAIT_PERSON.skin };
  const cells = BODY_CELLS[portraitBodyUrl(archetype)] ?? {};
  const w = WARDROBES[archetype];
  const colours = { key: w.key[0], trousers: w.trousers?.[0], accent: w.accent?.[0], hair: w.hair?.[0] ?? PORTRAIT_PERSON.hair };
  for (const part of ["key", "trousers", "accent", "hair"] as const) {
    const cell = cells[part];
    const colour = colours[part];
    if (cell !== undefined && colour) paint[cell] = colour;
  }
  return paint;
}
