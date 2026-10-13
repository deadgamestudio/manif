/**
 * How a pompier moves (#17): a `CrsBehaviour` whose standing orders always
 * apply, so the base bot's chase, baton, grab and gas never run for it. The
 * server's brigade decides each pompier's order (walk somewhere, face
 * something) from the fires; this only carries it out with the base bot's
 * steering (paths around walls, props and fire zones).
 */
import { DEFAULT_BEHAVIOUR, steerTo, type CrsBehaviour, type CrsBot } from "../crs/index.js";
import type { Vec2 } from "../physics/index.js";

/** What a pompier is told to do this tick. */
export interface PompierOrder {
  /** Walk here (null: stand still). */
  goal: Vec2 | null;
  /** Face this point while standing (the fire or whoever it sprays). Null: keep the facing. */
  aim: Vec2 | null;
}

/** A pompier this close to its goal stands still. */
const GOAL_REACHED = 0.2;

function stand(bot: CrsBot): void {
  bot.input.x = 0;
  bot.input.z = 0;
}

/** The pompier's steps: orders from `orderOf` (by bot id), and nothing else. Without an order it stands still. */
export function pompierBehaviour(orderOf: (id: string) => PompierOrder | undefined): CrsBehaviour {
  return {
    ...DEFAULT_BEHAVIOUR,
    // Never targets, hits or grabs anyone (only reached without orders, which never happens).
    updateTarget: (bot) => {
      bot.targetId = null;
    },
    act: () => true,
    drag: (bot) => stand(bot),
    orders: (bot, ctx) => {
      const order = orderOf(bot.id);
      const goal = order?.goal ?? null;
      if (goal && Math.hypot(goal.x - bot.body.x, goal.z - bot.body.z) > GOAL_REACHED) steerTo(bot, goal.x, goal.z, ctx);
      else stand(bot);
      const moving = bot.input.x !== 0 || bot.input.z !== 0;
      const aim = order?.aim ?? null;
      if (moving) bot.rotation = Math.atan2(bot.input.x, bot.input.z);
      else if (aim) {
        const dx = aim.x - bot.body.x;
        const dz = aim.z - bot.body.z;
        if (Math.hypot(dx, dz) > 1e-6) bot.rotation = Math.atan2(dx, dz);
      }
      return true;
    },
  };
}
