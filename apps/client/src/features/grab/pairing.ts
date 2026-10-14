/*
 * Who drags whom (#28). The synced state says a CRS is grabbing and a
 * protester is grabbed, but not who holds whom. The server keeps the
 * protester right behind the bot that holds them (brain.ts, `stepCrs`: at
 * `radius + PLAYER_RADIUS + 0.05` along -facing), so the pair is the grabbing
 * bot whose trail point is nearest the grabbed protester.
 */

/** A grabbing bot, as the pairing needs it. */
export interface Grabber {
  id: string;
  x: number;
  z: number;
  /** Facing (radians), as synced. */
  rotation: number;
  /** How far behind itself the server keeps the protester it holds, metres. */
  gap: number;
}

/** A grabbed protester. */
export interface Grabbed {
  id: string;
  x: number;
  z: number;
}

/** A grabbed protester is only paired with a bot this close (centre to centre, beyond its gap), metres. */
export const MATCH_SLACK = 0.6;
/** The partner of the last frame wins a near tie (metres off the trail point), so pairs don't swap back and forth. */
const STICKY = 0.3;

/**
 * Pair each grabbed protester with the bot holding them: the bot whose trail
 * point (`gap` behind it) is nearest, within `gap + MATCH_SLACK` of the bot.
 * One bot per protester and one protester per bot, best fits first. `previous`
 * (victim id → bot id) keeps last frame's pairs on a near tie.
 * Returns victim id → bot id.
 */
export function matchPairs(
  grabbers: readonly Grabber[],
  grabbed: readonly Grabbed[],
  previous: ReadonlyMap<string, string> = new Map(),
): Map<string, string> {
  const fits: { victim: string; crs: string; score: number }[] = [];
  for (const v of grabbed) {
    for (const c of grabbers) {
      if (Math.hypot(v.x - c.x, v.z - c.z) > c.gap + MATCH_SLACK) continue;
      const tx = c.x - Math.sin(c.rotation) * c.gap;
      const tz = c.z - Math.cos(c.rotation) * c.gap;
      const off = Math.hypot(v.x - tx, v.z - tz);
      fits.push({ victim: v.id, crs: c.id, score: previous.get(v.id) === c.id ? off - STICKY : off });
    }
  }
  fits.sort((a, b) => a.score - b.score);
  const pairs = new Map<string, string>();
  const taken = new Set<string>();
  for (const f of fits) {
    if (pairs.has(f.victim) || taken.has(f.crs)) continue;
    pairs.set(f.victim, f.crs);
    taken.add(f.crs);
  }
  return pairs;
}
