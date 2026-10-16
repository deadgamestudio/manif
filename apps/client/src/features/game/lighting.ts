/*
 * Lighting (#28): Jordan's models are realistic and dark (near-black CRS,
 * navy vans, dark outfits), so the street is lit brighter than for the old
 * bright placeholders: a strong soft sky fill (no shadows, costs nothing on
 * phones) plus the one shadow-casting sun, over a lighter asphalt (Level.tsx).
 *
 * Plain values, no three.js: the street (Scene.tsx) and the studio that
 * draws the lobby portraits (app/portraits/, #126) light bodies the same way.
 */

export const BACKGROUND = "#3b4048";
export const SKY = "#e8efff";
/** Light bounced off the street, warm and fairly bright so dark clothes keep some shape from below. */
export const GROUND_BOUNCE = "#8a8272";
export const SKY_FILL = 1.9;
export const SUN_INTENSITY = 2.6;
/** Where the sun comes from, relative to the point it lights. */
export const SUN_DIRECTION: readonly [number, number, number] = [15, 25, 10];
