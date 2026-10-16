/*
 * The archetype portraits on the lobby's role picker (#126): one small
 * pre-rendered image per archetype in public/portraits/, made from the game's
 * own models by `bun run portraits` (scripts/portraits/render.ts, which drives
 * the studio page in src/app/portraits/). Plain strings: the lobby needs no
 * three.js and downloads no model to show them.
 */
import { Archetype, archetypeOf } from "@manif/shared";

/** The file name of each archetype's portrait, without the extension. */
export const PORTRAIT_FILES: Readonly<Record<Archetype, string>> = {
  [Archetype.Lambda]: "lambda",
  [Archetype.Bobo]: "bobo",
  [Archetype.Cite]: "cite",
  [Archetype.GiletJaune]: "gilet-jaune",
  [Archetype.BlackBloc]: "black-bloc",
  [Archetype.Cgt]: "cgt",
  [Archetype.Etudiant]: "etudiant",
  [Archetype.Retraite]: "retraite",
};

/** Size of the images in pixels: twice the biggest size the cards show them at, for sharp phone screens. */
export const PORTRAIT_WIDTH = 112;
export const PORTRAIT_HEIGHT = 140;

/** The URL of archetype `id`'s portrait (the default archetype's for an unknown id). */
export function portraitUrl(id: unknown): string {
  return `/portraits/${PORTRAIT_FILES[archetypeOf(id)]}.webp`;
}
