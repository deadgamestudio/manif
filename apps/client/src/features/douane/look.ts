/*
 * La Douane's colours (#120): his skin on the neutral body's skin cell and
 * on its top (shirtless), bright shorts on its trousers, hair to match.
 * Pure, so it is tested without a scene; the people list (protesterLook's
 * PEOPLE) is passed in.
 */
import { DOUANE_SKINS } from "@manif/shared";

/** The neutral body's cells (protesterLook's BODY_CELLS, and the palette's skin cell 6). */
export const SKIN = 6;
export const TOP_CELL = 9;
export const TROUSERS_CELL = 1;
export const HAIR_CELL = 5;
/** Bright shorts, picked with his skin index (just for variety). */
export const SHORTS = ["#f07b1f", "#e94b6a", "#2bb673", "#f2c230", "#3fa7e0"] as const;

/** His paint for synced skin index `skin` (clamped), from `people` (skin and hair, fair to deep). */
export function douanePaint(skin: number, people: readonly { skin: string; hair: string }[]): Record<number, string> {
  const i = Math.max(0, Math.min(DOUANE_SKINS - 1, Math.floor(Number.isFinite(skin) ? skin : 0)));
  const person = people[i % Math.max(1, people.length)] ?? { skin: "#c58c64", hair: "#1d1714" };
  return {
    [SKIN]: person.skin,
    [TOP_CELL]: person.skin,
    [TROUSERS_CELL]: SHORTS[i % SHORTS.length] ?? SHORTS[0],
    [HAIR_CELL]: person.hair,
  };
}
