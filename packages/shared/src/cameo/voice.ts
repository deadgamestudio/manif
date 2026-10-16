/**
 * The cameos' voiced lines (#137). Each line of each cameo has a recorded
 * clip in the client's `public/voices/<cameo>/<kind>-<index>.mp3`, and its
 * length (seconds) in CAMEO_CLIP_SECONDS, so the server keeps the bubble up
 * as long as the voice (at least CAMEO.bubble).
 *
 * The file name comes from the line's kind and its index in the line list,
 * so a clip can be swapped for another recording by dropping a file of the
 * same name (then run `bun run voices` in apps/client to refresh the lengths).
 */
import { BENANAS_ID, BENANAS_LINES } from "../benanas/index.js";
import { DOUANE_ID, DOUANE_LINES } from "../douane/index.js";
import { LEZ_ID, LEZ_LINES } from "../lez/index.js";
import { MOLUCHAN_ID, MOLUCHAN_LINES } from "../moluchan/index.js";
import { CAMEO_CLIP_SECONDS } from "./clips.js";
import { CAMEO } from "./constants.js";

/** The cameos that speak, by their id (also their folder under `voices/`). */
export const CAMEO_VOICE_LINES: Readonly<Record<string, readonly { kind: string; text: string }[]>> = {
  [MOLUCHAN_ID]: MOLUCHAN_LINES,
  [DOUANE_ID]: DOUANE_LINES,
  [BENANAS_ID]: BENANAS_LINES,
  [LEZ_ID]: LEZ_LINES,
};

/** After the voice ends, the bubble stays up this much longer, so the last word isn't cut by the next patch. */
export const CLIP_TAIL = 0.3;

/** Path of a line's clip under the client's public folder (no leading slash), or null for no such line. */
export function cameoClipPath(cameo: string, line: number): string | null {
  const kind = CAMEO_VOICE_LINES[cameo]?.[line]?.kind;
  return kind === undefined ? null : `voices/${cameo}/${kind}-${line}.mp3`;
}

/** How long a line's clip lasts, in seconds; 0 when it has none. */
export function cameoClipSeconds(cameo: string, line: number): number {
  return CAMEO_CLIP_SECONDS[cameo]?.[line] ?? 0;
}

/** How long a line's bubble stays up: its clip and a short tail, never under CAMEO.bubble. */
export function cameoBubbleSeconds(cameo: string, line: number): number {
  const clip = cameoClipSeconds(cameo, line);
  return Math.max(CAMEO.bubble, clip > 0 ? clip + CLIP_TAIL : 0);
}
