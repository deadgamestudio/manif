/**
 * The colour of a human player's ring on the ground (#28), so each friend is
 * easy to pick out in a brawl now that Jordan's bodies are dark. No colour is
 * synced: it comes from the session id, which every client sees the same, so
 * everyone draws the same ring for the same player. Bright hues only, and no
 * yellow (the local player's own ring) or red (the destination, the alerts).
 */
export const RING_COLORS: readonly string[] = [
  "#26c6da", // cyan
  "#ec407a", // pink
  "#9ccc65", // lime
  "#ff8a3d", // orange
  "#b388ff", // violet
  "#4fc3f7", // sky blue
  "#1de9b6", // mint
  "#ff80ab", // light pink
];

/** Same id, same colour, on every client. */
export function ringColorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return RING_COLORS[Math.abs(h) % RING_COLORS.length] ?? "#26c6da";
}
