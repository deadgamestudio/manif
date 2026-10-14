/**
 * A bot protester's head (#59): what one bot decides to do, a few times a
 * second. Plain functions over a plain `BotMind` and a plain `BotWorld` (what
 * the room shows it), returning a `BotIntent` the room carries out through
 * the same id-based actions players use (move, swing, throw, pick up, rescue,
 * dodge, hop). It walks with the CRS's own navigation (`steerTo`, `NavGrid`,
 * `detectStuck`).
 *
 *   march ──sees something worth doing (rolled)──> [reaction delay] ──> rescue | fight | fetch | throw | flee
 *     ^                                                                       │
 *     └──────────────── done, gone, or no longer worth it ────────────────────┘
 *
 * It never picks up or throws a teammate and never lights a fire: those stay
 * players' choices, and the room gives bots no way to do them.
 */
import { detectStuck, steerTo, type NavContext } from "../crs/index.js";
import { PlayerStatus } from "../health/index.js";
import { progressAt, type Level } from "../level/index.js";
import { MELEE_RANGE } from "../melee/index.js";
import { isDown, type Body, type Vec2 } from "../physics/index.js";
import { PLAYER_RADIUS } from "../player/index.js";
import { RESCUE_RANGE } from "../rescue/index.js";
import { PICKUP_RANGE } from "../throwable/index.js";
import { BOT } from "./constants.js";

/** What a bot is busy with. Ids are protester ids (rescue) or CRS ids (fight, throw). */
export type BotPlan =
  | { kind: "march" }
  | { kind: "rescue"; id: string }
  | { kind: "fight"; id: string }
  | { kind: "fetch"; x: number; z: number }
  | { kind: "throw"; id: string }
  | { kind: "flee"; x: number; z: number };

const MARCH: BotPlan = { kind: "march" };

/** One bot's own state, server-side. Satisfies what `steerTo` and `detectStuck` need. */
export interface BotMind {
  readonly id: string;
  /** Its body, set by the room before each think (the room owns it). */
  body: Readonly<Body>;
  readonly stats: { readonly radius: number; readonly repathInterval: number };
  path: number[] | null;
  pathIndex: number;
  readonly pathGoal: Vec2;
  repathAt: number;
  /** Where it wants to walk (unit or zero), set by `thinkBot`. */
  readonly input: Vec2;
  readonly anchor: Vec2;
  anchorAt: number;
  stuckCount: number;
  /** Unused by a bot protester (always null): `detectStuck` gives up on CRS targets with it. */
  targetId: string | null;
  ignoreId: string | null;
  ignoreUntil: number;
  retargetAt: number;
  /** Its own spot in the cortège: offset in progress from the leading human, and side of the street. */
  readonly lead: number;
  readonly lane: number;
  /** Room time of its next think. */
  thinkAt: number;
  plan: BotPlan;
  /** A plan it has seen and will start once the reaction delay is over. */
  pending: BotPlan | null;
  pendingAt: number;
  /** Chances already rolled, by thing (`fight:<crs id>`...), and until when the result holds. */
  readonly rolls: Map<string, { ok: boolean; until: number }>;
}

export function createBotMind(id: string, body: Readonly<Body>, now: number, random: () => number = Math.random): BotMind {
  return {
    id,
    body,
    stats: { radius: PLAYER_RADIUS, repathInterval: BOT.repathInterval },
    path: null,
    pathIndex: 0,
    pathGoal: { x: body.x, z: body.z },
    repathAt: 0,
    input: { x: 0, z: 0 },
    anchor: { x: body.x, z: body.z },
    anchorAt: now,
    stuckCount: 0,
    targetId: null,
    ignoreId: null,
    ignoreUntil: 0,
    retargetAt: 0,
    lead: BOT.leadMin + (BOT.leadMax - BOT.leadMin) * random(),
    lane: (random() * 2 - 1) * BOT.laneSpread,
    // Spread the thinks of a fresh batch over one interval, so they don't all land on one tick.
    thinkAt: now + random() * BOT.thinkInterval,
    plan: MARCH,
    pending: null,
    pendingAt: 0,
    rolls: new Map(),
  };
}

/** A protester as a bot sees it. */
export interface BotSeenProtester extends Vec2 {
  id: string;
  /** A `PlayerStatus`. */
  status: number;
  bot: boolean;
}

/** A CRS as a bot sees it: only those standing on the street (not out). */
export interface BotSeenCrs extends Vec2 {
  id: string;
  radius: number;
  /** Lying on the ground: nothing to hit or fear. */
  down: boolean;
  /** The protester it is dragging, or null. */
  grabbing: string | null;
}

/** A round thing: a tear gas cloud, or a hurdle (an intact bin, a fallen CRS). */
export interface BotCircle extends Vec2 {
  r: number;
}

/** What the room shows a bot when it thinks. */
export interface BotWorld {
  level: Level;
  nav: NavContext;
  now: number;
  random: () => number;
  self: {
    x: number;
    z: number;
    /** Free, not knocked down, not carried: may act at all. */
    canAct: boolean;
    /** Something in hand (#8). */
    carrying: boolean;
    /** In tear gas (#7). */
    gassed: boolean;
  };
  /** Everyone in the cortège, the bot itself included (skipped by id). */
  protesters: readonly BotSeenProtester[];
  crs: readonly BotSeenCrs[];
  /** Items on the ground a bot would pick up. */
  items: readonly Vec2[];
  gas: readonly BotCircle[];
  hurdles: readonly BotCircle[];
}

/** What the bot does this think. The room checks every action like a player's (control, cooldowns). */
export interface BotIntent {
  /** Walking direction, unit or zero. The room applies the bot's slower walk. */
  move: Vec2;
  /** Face this point before acting (a swing goes where the bot faces). Null: face the walk. */
  face: Vec2 | null;
  attack: boolean;
  /** Throw what it carries at this point (the room makes it sloppy). */
  throwAt: Vec2 | null;
  pickUp: boolean;
  /** Hold interact for a rescue (only a rescue: bots never carry or light anything). */
  rescueHold: boolean;
  dodge: boolean;
  jump: boolean;
}

function idle(): BotIntent {
  return { move: { x: 0, z: 0 }, face: null, attack: false, throwAt: null, pickUp: false, rescueHold: false, dodge: false, jump: false };
}

/** Whether this think is due. The room skips `thinkBot` (and keeps the last walk) until then. */
export function botThinkDue(mind: BotMind, now: number): boolean {
  return now >= mind.thinkAt;
}

/**
 * Roll a chance for one thing (`key`) and remember the result for
 * BOT.rollMemory seconds, so a bot that passed on a CRS doesn't re-roll it
 * five times a second (which would make every chance a near-certainty).
 */
export function rollFor(mind: BotMind, key: string, chance: number, now: number, random: () => number): boolean {
  const seen = mind.rolls.get(key);
  if (seen && now < seen.until) return seen.ok;
  const ok = random() < chance;
  mind.rolls.set(key, { ok, until: now + BOT.rollMemory });
  return ok;
}

function forgetOldRolls(mind: BotMind, now: number): void {
  for (const [k, v] of mind.rolls) if (now >= v.until) mind.rolls.delete(k);
}

function samePlan(a: BotPlan, b: BotPlan): boolean {
  if (a.kind !== b.kind) return false;
  if ("id" in a && "id" in b) return a.id === b.id;
  return true;
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Where a bot keeps in the cortège: its lead past the leading free human (or,
 * with none free, the leading free protester, or itself), on its own lane,
 * never past the middle of the Préfecture zone.
 */
export function marchGoal(mind: BotMind, world: BotWorld): Vec2 {
  const { level } = world;
  let lead = -Infinity;
  let anyone = -Infinity;
  for (const p of world.protesters) {
    if (p.status !== PlayerStatus.Free || p.id === mind.id) continue;
    const t = progressAt(level, p.x, p.z);
    if (!p.bot && t > lead) lead = t;
    if (t > anyone) anyone = t;
  }
  const self = progressAt(level, world.self.x, world.self.z);
  const anchor = lead > -Infinity ? lead : anyone > -Infinity ? anyone : self;
  const d = level.destination;
  const end = progressAt(level, (d.minX + d.maxX) / 2, (d.minZ + d.maxZ) / 2);
  const t = Math.max(0, Math.min(end, anchor + mind.lead));
  const { from, to } = level.progress;
  const len = Math.hypot(to.x - from.x, to.z - from.z) || 1;
  // Sideways: the street's left-right, perpendicular to its axis.
  const sx = -(to.z - from.z) / len;
  const sz = (to.x - from.x) / len;
  return { x: from.x + (to.x - from.x) * t + sx * mind.lane, z: from.z + (to.z - from.z) * t + sz * mind.lane };
}

/** What catches the bot's eye right now, before the reaction delay. March when nothing does (or the dice say no). */
export function chooseBotPlan(mind: BotMind, world: BotWorld): BotPlan {
  const { self, now, random } = world;
  // Tear gas: out of the cloud, away from its centre.
  if (self.gassed) {
    let cloud: BotCircle | undefined;
    for (const g of world.gas) if (!cloud || dist(self, g) < dist(self, cloud)) cloud = g;
    if (cloud) {
      let dx = self.x - cloud.x;
      let dz = self.z - cloud.z;
      const l = Math.hypot(dx, dz);
      if (l < 1e-6) {
        dx = 0;
        dz = 1;
      } else {
        dx /= l;
        dz /= l;
      }
      return { kind: "flee", x: cloud.x + dx * (cloud.r + 1.5), z: cloud.z + dz * (cloud.r + 1.5) };
    }
  }
  // Something in hand: at the nearest standing CRS in reach, else keep it and march.
  if (self.carrying) {
    let best: BotSeenCrs | undefined;
    for (const c of world.crs) if (!c.down && dist(self, c) <= BOT.throwRange && (!best || dist(self, c) < dist(self, best))) best = c;
    return best ? { kind: "throw", id: best.id } : MARCH;
  }
  // A grabbed teammate: humans first (they count as half as far), then fellow bots.
  let mate: BotSeenProtester | undefined;
  let mateD = Infinity;
  for (const p of world.protesters) {
    if (p.id === mind.id || p.status !== PlayerStatus.Grabbed) continue;
    const d = dist(self, p);
    if (d > BOT.helpRange) continue;
    const w = p.bot ? d : d / 2;
    if (w < mateD) {
      mateD = w;
      mate = p;
    }
  }
  if (mate && rollFor(mind, `rescue:${mate.id}`, mate.bot ? BOT.rescueChanceBot : BOT.rescueChanceHuman, now, random)) {
    return { kind: "rescue", id: mate.id };
  }
  // A CRS dragging someone nearby, or right on a teammate (or on the bot).
  let foe: BotSeenCrs | undefined;
  let foeD = Infinity;
  for (const c of world.crs) {
    if (c.down) continue;
    const d = dist(self, c);
    if (d > BOT.helpRange) continue;
    let busy = c.grabbing !== null || d <= BOT.brawlRange;
    if (!busy) {
      for (const p of world.protesters) {
        if (p.id !== mind.id && p.status === PlayerStatus.Free && dist(p, c) <= BOT.brawlRange) {
          busy = true;
          break;
        }
      }
    }
    if (busy && d < foeD) {
      foeD = d;
      foe = c;
    }
  }
  if (foe && rollFor(mind, `fight:${foe.id}`, BOT.fightChance, now, random)) return { kind: "fight", id: foe.id };
  // A pavé lying close by.
  let item: Vec2 | undefined;
  for (const it of world.items) if (dist(self, it) <= BOT.fetchRange && (!item || dist(self, it) < dist(self, item))) item = it;
  if (item && rollFor(mind, `fetch:${Math.round(item.x)},${Math.round(item.z)}`, BOT.fetchChance, now, random)) {
    return { kind: "fetch", x: item.x, z: item.z };
  }
  return MARCH;
}

/** Walk towards a point with the CRS navigation; stand when there. */
function walkTo(mind: BotMind, world: BotWorld, x: number, z: number, near: number): Vec2 {
  if (Math.hypot(x - world.self.x, z - world.self.z) <= near) {
    mind.input.x = 0;
    mind.input.z = 0;
    mind.path = null;
  } else steerTo(mind, x, z, world.nav);
  return { x: mind.input.x, z: mind.input.z };
}

/**
 * One think (#59): pick what to do (with the reaction delay before anything
 * new), do one step of it, hop or dodge if worth it. Sets `mind.thinkAt` for
 * the next one. A bot that can't act (grabbed, KO, down, carried) stands and
 * lets go of interact.
 */
export function thinkBot(mind: BotMind, world: BotWorld): BotIntent {
  const { self, now, random } = world;
  mind.thinkAt = now + BOT.thinkInterval;
  forgetOldRolls(mind, now);
  const out = idle();
  if (!self.canAct || isDown(mind.body)) {
    mind.plan = MARCH;
    mind.pending = null;
    mind.input.x = 0;
    mind.input.z = 0;
    return out;
  }

  // The reaction delay: anything new waits a moment; going back to the march is at once.
  const desired = chooseBotPlan(mind, world);
  if (!samePlan(desired, mind.plan)) {
    if (desired.kind === "march") {
      mind.plan = MARCH;
      mind.pending = null;
    } else if (mind.pending && samePlan(desired, mind.pending)) {
      if (now >= mind.pendingAt) {
        mind.plan = desired;
        mind.pending = null;
      }
    } else {
      mind.pending = desired;
      mind.pendingAt = now + BOT.reactionMin + (BOT.reactionMax - BOT.reactionMin) * random();
    }
  } else if (desired.kind === "fetch" || desired.kind === "flee") mind.plan = desired;

  out.move = runPlan(mind, world, out);

  // Stuck against something (a bin, a fallen CRS): try a hop.
  const before = mind.stuckCount;
  detectStuck(mind, now);
  const stuck = mind.stuckCount > before;
  if (out.move.x !== 0 || out.move.z !== 0) {
    const hurdle = hurdleAhead(self, out.move, world.hurdles);
    if (stuck || (hurdle && rollFor(mind, `hop:${Math.round(hurdle.x)},${Math.round(hurdle.z)}`, BOT.hopChance, now, random))) out.jump = true;
  }
  // A CRS right there (not one it is going for), or gas: maybe a dodge, along the walk.
  if (self.gassed && mind.plan.kind === "flee" && rollFor(mind, "dodge:gas", BOT.dodgeChance, now, random)) out.dodge = true;
  for (const c of world.crs) {
    if (c.down || c.grabbing !== null || dist(self, c) - c.radius > BOT.dodgeRange) continue;
    if (mind.plan.kind === "fight" && mind.plan.id === c.id) continue;
    if (rollFor(mind, `dodge:${c.id}`, BOT.dodgeChance, now, random)) out.dodge = true;
    break;
  }
  return out;
}

/** One step of the current plan; falls back to the march when its target is gone or done. */
function runPlan(mind: BotMind, world: BotWorld, out: BotIntent): Vec2 {
  const { self } = world;
  const plan = mind.plan;
  switch (plan.kind) {
    case "rescue": {
      const mate = world.protesters.find((p) => p.id === plan.id);
      if (!mate || mate.status !== PlayerStatus.Grabbed) break;
      // Hold interact the whole way: the rescue starts as soon as it is in range (like a player holding E).
      out.rescueHold = true;
      return walkTo(mind, world, mate.x, mate.z, RESCUE_RANGE * 0.6);
    }
    case "fight": {
      const c = world.crs.find((k) => k.id === plan.id);
      if (!c || c.down) break;
      if (dist(self, c) - c.radius <= MELEE_RANGE * 0.8) {
        out.face = { x: c.x, z: c.z };
        out.attack = true;
        mind.input.x = 0;
        mind.input.z = 0;
        return { x: 0, z: 0 };
      }
      return walkTo(mind, world, c.x, c.z, 0);
    }
    case "throw": {
      const c = world.crs.find((k) => k.id === plan.id);
      if (!c || c.down || !self.carrying) break;
      if (dist(self, c) <= BOT.throwRange) {
        out.throwAt = { x: c.x, z: c.z };
        return { x: 0, z: 0 };
      }
      return walkTo(mind, world, c.x, c.z, 0);
    }
    case "fetch": {
      if (self.carrying) break;
      const still = world.items.some((it) => Math.hypot(it.x - plan.x, it.z - plan.z) < 0.5);
      if (!still) break;
      if (Math.hypot(plan.x - self.x, plan.z - self.z) <= PICKUP_RANGE * 0.8) {
        out.pickUp = true;
        return { x: 0, z: 0 };
      }
      return walkTo(mind, world, plan.x, plan.z, 0);
    }
    case "flee": {
      if (!self.gassed) break;
      // Straight out: it only lasts a moment, and walls stop it like anything else.
      const dx = plan.x - self.x;
      const dz = plan.z - self.z;
      const l = Math.hypot(dx, dz);
      if (l < 1e-6) break;
      mind.input.x = dx / l;
      mind.input.z = dz / l;
      return { x: mind.input.x, z: mind.input.z };
    }
    case "march":
      break;
  }
  if (plan.kind !== "march") mind.plan = MARCH;
  const goal = marchGoal(mind, world);
  return walkTo(mind, world, goal.x, goal.z, BOT.arriveRadius);
}

/** The nearest hurdle right ahead along `move` (its edge within BOT.hopAhead, roughly in line), or undefined. */
export function hurdleAhead(self: Vec2, move: Vec2, hurdles: readonly BotCircle[]): BotCircle | undefined {
  const ml = Math.hypot(move.x, move.z);
  if (ml < 1e-6) return undefined;
  const mx = move.x / ml;
  const mz = move.z / ml;
  let best: BotCircle | undefined;
  let bestD = Infinity;
  for (const h of hurdles) {
    const dx = h.x - self.x;
    const dz = h.z - self.z;
    const along = dx * mx + dz * mz;
    if (along <= 0) continue;
    const side = Math.abs(dx * mz - dz * mx);
    if (side > h.r + PLAYER_RADIUS) continue;
    const gap = Math.hypot(dx, dz) - h.r - PLAYER_RADIUS;
    if (gap <= BOT.hopAhead && gap < bestD) {
      bestD = gap;
      best = h;
    }
  }
  return best;
}
