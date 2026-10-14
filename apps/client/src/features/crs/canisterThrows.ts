import { net } from "../../shared/net/index.ts";
import { nearestThrower } from "./crsClips.ts";

/*
 * Which CRS just threw tear gas (#7, #28). The state only has the canister's
 * start and end points, and the server throws from the bot's own position,
 * so each new canister is put down to the bot nearest its start. The scan
 * runs at most once per change of the canister list (net keeps the same
 * array until one is added or removed), whoever asks first.
 */

const seen = new Set<string>();
const lastThrows = new Map<string, number>();
let scanned: readonly string[] | null = null;

function scan(): void {
  const ids = net.getCanisterIds();
  if (ids === scanned) return;
  const first = scanned === null;
  scanned = ids;
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    // Canisters already flying when we first look were thrown before we were watching.
    if (first) continue;
    const can = net.getCanister(id);
    if (!can) continue;
    const thrower = nearestThrower(can.fromX, can.fromZ, crsPositions());
    if (thrower) lastThrows.set(thrower, performance.now());
  }
  // Forget the landed ones, so the set stays small over a long round.
  for (const id of seen) if (!ids.includes(id)) seen.delete(id);
}

function* crsPositions(): Generator<readonly [string, { x: number; z: number }]> {
  for (const id of net.getSnapshot().crs) {
    const c = net.getCrs(id);
    if (c && !c.down) yield [id, c];
  }
}

/** When (performance.now()) CRS `id` last threw a canister, if ever. Read from useFrame. */
export function getLastThrow(id: string): number | undefined {
  scan();
  return lastThrows.get(id);
}
