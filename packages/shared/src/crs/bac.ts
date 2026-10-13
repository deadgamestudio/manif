/**
 * The BAC (#13): a plain-clothes officer. It appears at the rear of the
 * cortège looking exactly like a protester (the client draws it with the
 * protester's avatar, see `revealed`), walks along with the crowd for a while,
 * then sidles up to someone and reveals itself (armband on) right next to
 * them, and grabs them.
 *
 *   blending ──stalkAt──> stalking ──a free protester's edge within revealRange──> revealed
 *       │                     └──stalkMax without getting close──────────────────> revealed
 *       └──any hit, push, stun, splat or burn (the squad calls revealBac)───────> revealed
 *
 * Revealed, it is an ordinary bot with weak stats (`CRS_STATS[CrsKind.Bac]`),
 * and grabs before it hits. Plain functions over a `CrsBot`: the room never
 * treats a BAC as a protester (it is a bot in `state.crs`, never in
 * `state.players`), so it cannot be carried, rescued or counted for the win.
 */
import { PlayerStatus } from "../health/index.js";
import { DEFAULT_NAMES } from "../lobby/index.js";
import { DEFAULT_BEHAVIOUR, gapTo, steerTo, type CrsBehaviour, type CrsBot, type CrsContext, type CrsHost } from "./brain.js";
import type { DisguiseStats } from "./constants.js";
import type { ProtesterView } from "./targeting.js";

/**
 * Drop the disguise now. Its next baton swing waits a full cooldown, so the
 * first thing it does once revealed is grab (see `act`). Returns true if it
 * was still disguised.
 */
export function revealBac(bot: CrsBot, now: number): boolean {
  if (bot.revealed) return false;
  bot.revealed = true;
  bot.batonReadyAt = Math.max(bot.batonReadyAt, now + bot.stats.batonCooldown);
  return true;
}

/** Room time a fresh BAC stops blending in: a random moment in [blendMin, blendMax] after `now`. */
export function bacStalkAt(d: DisguiseStats, now: number, random: () => number = Math.random): number {
  return now + d.blendMin + (d.blendMax - d.blendMin) * Math.min(1, Math.max(0, random()));
}

/**
 * The name on a BAC's placard (#13): one of the funny default protester
 * names (`DEFAULT_NAMES`), preferably one nobody in `used` goes by, so it
 * does not stand out as a double.
 */
export function disguiseName(used: ReadonlySet<string>, random: () => number = Math.random): string {
  const free = DEFAULT_NAMES.filter((n) => !used.has(n));
  const pool = free.length > 0 ? free : DEFAULT_NAMES;
  const i = Math.min(pool.length - 1, Math.floor(Math.max(0, random()) * pool.length));
  return pool[i] ?? DEFAULT_NAMES[0] ?? "Camarade";
}

/** The nearest free protester within `range` of the bot, or undefined. Ties go to the smaller id. */
function nearestFree(bot: CrsBot, host: CrsHost, range: number): ProtesterView | undefined {
  let best: ProtesterView | undefined;
  let bestD = range;
  for (const p of host.protesters()) {
    if (p.status !== PlayerStatus.Free) continue;
    const d = Math.hypot(p.x - bot.body.x, p.z - bot.body.z);
    if (d < bestD || (d === bestD && best !== undefined && p.id < best.id)) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function faceInput(bot: CrsBot): void {
  if (bot.input.x !== 0 || bot.input.z !== 0) bot.rotation = Math.atan2(bot.input.x, bot.input.z);
}

function stand(bot: CrsBot): void {
  bot.input.x = 0;
  bot.input.z = 0;
}

/**
 * What a disguised BAC does this tick (the `orders` step): true while it is
 * still disguised (it set its own input and facing), false once revealed (the
 * normal chase, act and drag take over, this very tick).
 */
export function bacOrders(bot: CrsBot, ctx: CrsContext, host: CrsHost): boolean {
  if (bot.revealed) return false;
  const d = bot.stats.disguise;
  if (!d) {
    bot.revealed = true;
    return false;
  }
  const now = ctx.now;
  // Who it keeps near (blending) or goes for (stalking): the nearest free protester it can see.
  const near = nearestFree(bot, host, bot.stats.sight * 2);
  if (now >= bot.stalkAt) {
    if (near && gapTo(bot, near) <= d.revealRange) {
      revealBac(bot, now);
      bot.targetId = near.id;
      bot.retargetAt = now + bot.stats.retargetInterval;
      bot.path = null;
      return false;
    }
    if (now >= bot.stalkAt + d.stalkMax) {
      // Nobody let it get close: drop the act and chase like any other.
      revealBac(bot, now);
      return false;
    }
    if (near) {
      steerTo(bot, near.x, near.z, ctx);
      faceInput(bot);
      return true;
    }
  }
  // Blending in: keep about `followGap` from the nearest protester, walking when they walk.
  if (near && gapTo(bot, near) > d.followGap) {
    steerTo(bot, near.x, near.z, ctx);
    faceInput(bot);
  } else stand(bot);
  return true;
}

/** The BAC's steps: the base bot's, after the disguise. */
export const BAC_BEHAVIOUR: CrsBehaviour = { ...DEFAULT_BEHAVIOUR, orders: bacOrders };
