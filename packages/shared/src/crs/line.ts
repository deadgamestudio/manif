/**
 * Shield lines (#6): a group of CRS standing shoulder to shoulder across the
 * street, facing the cortège. The line advances slowly, its shields are solid
 * to protesters, it shoves whoever leans on it, and it breaks apart when hit
 * hard enough in a short time or when protesters get behind it. Broken, its
 * members chase like any other bot (#5), for a while (#131): after
 * LINE_CHASE_TIME, or once a member landed LINE_CHASE_HITS swings, they walk
 * back to a spot ahead of the cortège (`regroupSpot`) and the line forms
 * again there once LINE_REFORM_MIN of them stand in place. A re-formed line
 * is an ordinary line: it advances, shoves, breaks and regroups again.
 *
 * Plain functions over a plain `ShieldLine` record, like the brain: the room
 * steps lines before the bots (so members have a fresh slot to walk to) and
 * applies shoves through `CrsHost.shove`. Members are ordinary `CrsBot`s whose
 * behaviour (see `lineBehaviour`) holds their slot instead of chasing.
 *
 * #12 spawns lines (`CrsSquad.spawnLine`); #13 can give a line its own unit
 * type, since members are bots of any kind.
 */
import { PlayerStatus } from "../health/index.js";
import {
  circleOverlaps,
  isDown,
  moveCircle,
  resolveCircle,
  type CircleShape,
  type CollisionWorld,
  type Vec2,
} from "../physics/index.js";
import { inRect, progressAt, type Level } from "../level/index.js";
import type { ShopRoom } from "../prop/index.js";
import { PLAYER_RADIUS } from "../player/index.js";
import { DEFAULT_BEHAVIOUR, cancelWindup, steerTo, tryThrowGas, type CrsBehaviour, type CrsBot, type CrsContext, type CrsHost } from "./brain.js";
import {
  CRS_STATS,
  CrsKind,
  CrsStatus,
  LINE_BREAK_DAMAGE,
  LINE_BREAK_DOWNED,
  LINE_BREAK_WINDOW,
  LINE_CHASE_HITS,
  LINE_CHASE_TIME,
  LINE_ENGAGE_RANGE,
  LINE_FLANK_COUNT,
  LINE_FLANK_DEPTH,
  LINE_FLANK_REACH,
  LINE_FLANK_TIME,
  LINE_MAX_ADVANCE,
  LINE_REAR_OFFSET,
  LINE_REFORM_MIN,
  LINE_REGROUP_AHEAD,
  LINE_REGROUP_CLEAR,
  LINE_REGROUP_RETRY,
  LINE_REGROUP_SEARCH,
  LINE_REGROUP_SPREAD,
  LINE_REGROUP_STEP,
  LINE_REGROUP_TIMEOUT,
  LINE_SHIELD_RADIUS,
  LINE_SHOVE_IMPULSE,
  LINE_SHOVE_INTERVAL,
  LINE_SHOVE_REACH,
  LINE_SHOVES_TO_FLOOR,
  LINE_SLOT_REFRESH,
  LINE_SLOT_TOLERANCE,
  LINE_SPACING,
  LINE_SPEED,
  LINE_START_CLEARANCE,
  LINE_STRAGGLER_TIME,
} from "./constants.js";
import type { ProtesterView } from "./targeting.js";

/** Why a line broke apart. */
export type LineBreak = "damage" | "downed" | "flanked" | "empty";

/** Server-side state of one line. Nothing here is synced; members show it through `Crs.formation`. */
export interface ShieldLine {
  readonly id: string;
  /** The bots in the line. Members taken out are dropped on the next step. */
  readonly members: CrsBot[];
  /** Middle of the front rank. Moves along `facing` as the line advances. */
  readonly centre: Vec2;
  /** Unit direction the shields face: towards the cortège. The line advances this way. */
  readonly facing: Vec2;
  /** Where the line formed. */
  readonly origin: Vec2;
  /** How far from `origin` it may advance (#12 can change it). */
  maxAdvance: number;
  /** True while in formation; false once broken, until it re-forms (#131). */
  formed: boolean;
  brokenBy: LineBreak | null;
  /** Room time it last broke (#131): its members chase for LINE_CHASE_TIME from then. */
  brokenAt: number;
  /** Baton swings each member landed since the break (#131), by bot id. */
  readonly landed: Map<string, number>;
  /** Members done chasing and walking back to their slot at `centre` (#131), by bot id. */
  readonly returning: Set<string>;
  /** Walking back (#131): `centre` and `facing` are where it re-forms, picked at this room time. Null otherwise. */
  regroupAt: number | null;
  /** No spot found (#131): look again from this room time. */
  regroupRetryAt: number;
  /** How many times it re-formed (#131), for the room's log. */
  reforms: number;
  /** Where each member stands, by bot id (front or rear rank). */
  readonly slots: Map<string, Vec2>;
  /** Room time of the next slot refresh against the level. */
  refreshAt: number;
  /** No room for any slot just ahead (a wall across the street): the line holds. */
  blocked: boolean;
  /** Room time each member left its slot, for stragglers. */
  readonly lateSince: Map<string, number>;
  /** Damage that landed on members (server-resolved hits, #4 and #8), oldest first. */
  readonly hits: { at: number; amount: number }[];
  /** Room time protesters started standing behind the line, or null. */
  flankSince: number | null;
  /** Room time of the next allowed shove. */
  shoveReadyAt: number;
  /** Shoves in a row per protester, and when the last one landed. */
  readonly shoveStreak: Map<string, { count: number; at: number }>;
}

/**
 * A slot must also be clear this far ahead (along the facing), so slots can
 * glide forward with the line between two refreshes (LINE_SPEED *
 * LINE_SLOT_REFRESH = 0.3) without entering a wall, and the line re-lays its
 * slots around an obstacle before reaching it.
 */
const SLOT_LOOKAHEAD = 0.5;
/** A spot sampled every this many units across the street, looking for room for the slots. */
const SLOT_SCAN_STEP = 0.1;
/** Slots keep this much clearance from walls on top of the member's radius. */
const SLOT_MARGIN = 0.05;
/** A member within this of its slot stops walking (no jitter). */
const SLOT_STOP = 0.02;
/** Farther than this from its slot, a member pathfinds (steerTo) instead of walking straight. */
const SLOT_DIRECT = 2.5;

/** Unit vector across the line (the facing turned a quarter to the right). */
function acrossOf(facing: Vec2): Vec2 {
  return { x: -facing.z, z: facing.x };
}

/**
 * Slot positions for a line of `count` members centred at `centre`, facing
 * `facing`: `spacing` apart, across the facing, ordered left to right along
 * `acrossOf(facing)`. Computed against the level: the line only uses the
 * clear stretch of street around the centre (between two walls), shifts
 * sideways to stay in it, and drops slots that do not fit. Never places a
 * slot overlapping anything for a body of `radius`, nor SLOT_LOOKAHEAD
 * ahead of it. Empty when the centre's whole neighbourhood is blocked.
 */
export function lineSlots(
  world: CollisionWorld,
  centre: Vec2,
  facing: Vec2,
  count: number,
  radius: number = CRS_STATS[CrsKind.Crs].radius,
  spacing: number = LINE_SPACING,
): Vec2[] {
  if (count <= 0) return [];
  const across = acrossOf(facing);
  const r = radius + SLOT_MARGIN;
  const ax = facing.x * SLOT_LOOKAHEAD;
  const az = facing.z * SLOT_LOOKAHEAD;
  const free = (t: number) => {
    const x = centre.x + across.x * t;
    const z = centre.z + across.z * t;
    return !circleOverlaps(world, x, z, r) && !circleOverlaps(world, x + ax, z + az, r);
  };
  const reach = count * spacing;
  // The clear spot nearest the centre, then the clear stretch around it.
  let start: number | null = null;
  for (let k = 0; k * SLOT_SCAN_STEP <= reach && start === null; k++) {
    const d = k * SLOT_SCAN_STEP;
    if (free(d)) start = d;
    else if (k > 0 && free(-d)) start = -d;
  }
  if (start === null) return [];
  let lo = start;
  let hi = start;
  while (hi - start < reach && free(hi + SLOT_SCAN_STEP)) hi += SLOT_SCAN_STEP;
  while (start - lo < reach && free(lo - SLOT_SCAN_STEP)) lo -= SLOT_SCAN_STEP;
  const fits = Math.floor((hi - lo) / spacing + 1e-9) + 1;
  const n = Math.min(count, fits);
  const half = ((n - 1) * spacing) / 2;
  // Centred on the line's centre when there is room, else pushed off the wall.
  const mid = Math.max(lo + half, Math.min(hi - half, 0));
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const t = mid - half + i * spacing;
    out.push({ x: centre.x + across.x * t, z: centre.z + across.z * t });
  }
  return out;
}

/**
 * How far a line formed at `centre`, facing `facing`, may advance: `limit`,
 * cut so it stops LINE_START_CLEARANCE short of the level's start zone (the
 * zone's nearest edge along the facing). 0 if it is already that close.
 */
export function maxAdvanceFor(level: Level, centre: Vec2, facing: Vec2, limit = LINE_MAX_ADVANCE): number {
  const s = level.start;
  let near = Infinity;
  for (const x of [s.minX, s.maxX]) {
    for (const z of [s.minZ, s.maxZ]) near = Math.min(near, (x - centre.x) * facing.x + (z - centre.z) * facing.z);
  }
  return Math.max(0, Math.min(limit, near - LINE_START_CLEARANCE));
}

export function createShieldLine(id: string, members: CrsBot[], centre: Vec2, facing: Vec2, maxAdvance = LINE_MAX_ADVANCE): ShieldLine {
  const len = Math.hypot(facing.x, facing.z) || 1;
  return {
    id,
    members: [...members],
    centre: { x: centre.x, z: centre.z },
    facing: { x: facing.x / len, z: facing.z / len },
    origin: { x: centre.x, z: centre.z },
    maxAdvance,
    formed: true,
    brokenBy: null,
    brokenAt: 0,
    landed: new Map(),
    returning: new Set(),
    regroupAt: null,
    regroupRetryAt: 0,
    reforms: 0,
    slots: new Map(),
    refreshAt: 0,
    blocked: false,
    lateSince: new Map(),
    hits: [],
    flankSince: null,
    shoveReadyAt: 0,
    shoveStreak: new Map(),
  };
}

/** Where a point sits across the line (left to right), relative to its centre. */
function lateral(line: ShieldLine, p: Vec2): number {
  return (p.x - line.centre.x) * -line.facing.z + (p.z - line.centre.z) * line.facing.x;
}

/** How far ahead of the line a point is, along its facing (negative: behind it). */
export function aheadOf(line: ShieldLine, p: Vec2): number {
  return (p.x - line.centre.x) * line.facing.x + (p.z - line.centre.z) * line.facing.z;
}

/**
 * Recompute the slots against the world and hand them out. Members keep their
 * left-to-right order (no crossing); when the street has fewer slots than
 * members, the contiguous group of members closest to the slots takes them
 * and the others form a rear rank behind the front one. When nothing fits
 * (a wall across the street ahead), keeps the current slots and returns
 * false: the line holds there.
 */
export function assignSlots(line: ShieldLine, world: CollisionWorld): boolean {
  const members = line.members.filter((m) => m.status !== CrsStatus.Out);
  const radius = Math.max(0, ...members.map((m) => m.stats.radius));
  const front = lineSlots(world, line.centre, line.facing, members.length, radius || undefined);
  if (front.length === 0) return false;
  line.slots.clear();
  const sorted = [...members].sort((a, b) => lateral(line, a.body) - lateral(line, b.body) || (a.id < b.id ? -1 : 1));
  const n = front.length;
  let best = 0;
  let bestCost = Infinity;
  for (let off = 0; off + n <= sorted.length; off++) {
    let cost = 0;
    for (let i = 0; i < n; i++) {
      const m = sorted[off + i]!;
      const s = front[i]!;
      cost += Math.hypot(m.body.x - s.x, m.body.z - s.z);
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = off;
    }
  }
  for (let i = 0; i < n; i++) line.slots.set(sorted[best + i]!.id, front[i]!);
  // Rear rank: behind the nearest front slot, or behind the centre if that is blocked.
  const rear = sorted.filter((_, i) => i < best || i >= best + n);
  rear.forEach((m, k) => {
    const s = front[Math.min(n - 1, Math.round((k * (n - 1)) / Math.max(1, rear.length - 1)))] ?? line.centre;
    let x = s.x - line.facing.x * LINE_REAR_OFFSET;
    let z = s.z - line.facing.z * LINE_REAR_OFFSET;
    if (circleOverlaps(world, x, z, m.stats.radius)) {
      const p = resolveCircle(world, x, z, m.stats.radius);
      x = p.x;
      z = p.z;
    }
    line.slots.set(m.id, { x, z });
  });
  return true;
}

/** Total damage that landed on the line in the last `window` seconds. Drops older hits. */
export function damageInWindow(line: ShieldLine, now: number, window = LINE_BREAK_WINDOW): number {
  while (line.hits.length > 0 && now - line.hits[0]!.at > window) line.hits.shift();
  let sum = 0;
  for (const h of line.hits) sum += h.amount;
  return sum;
}

/** A server-resolved hit (a swing #4, a pavé #8) landed on a member: it counts towards breaking the line. */
export function recordLineHit(line: ShieldLine, amount: number, now: number): void {
  if (!line.formed || !(amount > 0)) return;
  line.hits.push({ at: now, amount });
}

/** Members dazed or on the floor right now. */
export function downedMembers(line: ShieldLine): number {
  let n = 0;
  for (const m of line.members) if (m.status === CrsStatus.Stunned || (m.status !== CrsStatus.Out && isDown(m.body))) n++;
  return n;
}

/**
 * How many free protesters stand behind the line (past its centre along the
 * facing by more than LINE_FLANK_DEPTH, and less than LINE_FLANK_REACH), and
 * how many it takes to flank it: LINE_FLANK_COUNT, or every free protester if
 * fewer are free, so a lone player can flank too.
 */
export function flankCount(line: ShieldLine, protesters: Iterable<ProtesterView>): { behind: number; needed: number } {
  let behind = 0;
  let free = 0;
  for (const p of protesters) {
    if (p.status !== PlayerStatus.Free) continue;
    free++;
    const d = aheadOf(line, p);
    if (d < -LINE_FLANK_DEPTH && d > -LINE_FLANK_REACH) behind++;
  }
  return { behind, needed: free === 0 ? Infinity : Math.min(LINE_FLANK_COUNT, free) };
}

/** Why the line should break now, or null. Updates the flank timer. */
export function checkBreak(line: ShieldLine, protesters: Iterable<ProtesterView>, now: number): LineBreak | null {
  if (line.members.length === 0) return "empty";
  if (damageInWindow(line, now) >= LINE_BREAK_DAMAGE) return "damage";
  if (downedMembers(line) >= LINE_BREAK_DOWNED) return "downed";
  const { behind, needed } = flankCount(line, protesters);
  if (behind >= needed) {
    if (line.flankSince === null) line.flankSince = now;
    if (now - line.flankSince >= LINE_FLANK_TIME) return "flanked";
  } else line.flankSince = null;
  return null;
}

/**
 * Break the line: members drop their slots and chase from the next tick
 * (`lineBehaviour` stops giving orders), until they regroup (#131).
 */
export function breakLine(line: ShieldLine, why: LineBreak, now = 0): void {
  if (!line.formed) return;
  line.formed = false;
  line.brokenBy = why;
  line.brokenAt = now;
  line.landed.clear();
  line.returning.clear();
  line.regroupAt = null;
  line.regroupRetryAt = 0;
  line.slots.clear();
  line.lateSince.clear();
  for (const m of line.members) {
    m.path = null;
    m.targetId = null;
    m.retargetAt = 0;
  }
}

/** Whether a member of a broken line is done chasing (#131): LINE_CHASE_TIME after the break, or once it landed LINE_CHASE_HITS swings or a grab. */
export function doneChasing(line: ShieldLine, bot: CrsBot, now: number): boolean {
  if (line.formed) return false;
  return now - line.brokenAt >= LINE_CHASE_TIME || (line.landed.get(bot.id) ?? 0) >= LINE_CHASE_HITS || bot.grabbedAt > line.brokenAt;
}

/** What `regroupSpot` checks a spot against, besides the level. */
export interface RegroupQuery {
  /** How many members the line has left (not out). */
  members: number;
  /** The members' body radius. */
  radius?: number;
  /** This round's shop rooms (#84): no slot inside one. */
  rooms?: readonly ShopRoom[];
  /** No free protester across the street within LINE_REGROUP_CLEAR of the spot. */
  protesters?: Iterable<ProtesterView>;
  /** Centres of the other lines (formed or regrouping): none within LINE_REGROUP_SPREAD. */
  others?: readonly Vec2[];
}

/** Unit vector along the march (from the start towards the Préfecture, the CRS side), or null for a level without one. */
function marchAxis(level: Level): Vec2 | null {
  const { from, to } = level.progress;
  const len = Math.hypot(to.x - from.x, to.z - from.z);
  return len > 0 ? { x: (to.x - from.x) / len, z: (to.z - from.z) / len } : null;
}

/** How far a line reaches along the street either side of its centre: the rear rank behind, the slot lookahead in front, plus a margin. */
const LINE_DEPTH = LINE_REAR_OFFSET + 1;

/**
 * Whether both sides of the street have a building facade all along a line
 * at `centre` (#131): a line across a side street's mouth would leave it open.
 * A level without facades has no side streets to worry about.
 */
function betweenFacades(level: Level, centre: Vec2): boolean {
  if (level.facades.length === 0) return true;
  const lo = centre.z - LINE_DEPTH;
  const hi = centre.z + LINE_DEPTH;
  for (const side of [-1, 1] as const) {
    if (!level.facades.some((f) => f.side === side && f.minZ <= lo && f.maxZ >= hi)) return false;
  }
  return true;
}

/** No free protester anywhere across the street within LINE_REGROUP_CLEAR of `centre`, measured along the march `axis`. */
function clearOfProtesters(centre: Vec2, axis: Vec2, protesters: Iterable<ProtesterView> | undefined): boolean {
  if (!protesters) return true;
  for (const p of protesters) {
    if (p.status !== PlayerStatus.Free) continue;
    if (Math.abs((p.x - centre.x) * axis.x + (p.z - centre.z) * axis.z) < LINE_REGROUP_CLEAR) return false;
  }
  return true;
}

/**
 * Where a broken line re-forms (#131): on the street's centre line, at least
 * LINE_REGROUP_AHEAD ahead of the cortège's `front` (progress 0..1) towards
 * the CRS side, at the nearest spot from there (looking LINE_REGROUP_SEARCH
 * farther, never into the Préfecture's forecourt) that is valid:
 *
 * - LINE_START_CLEARANCE from the start zone, like any line;
 * - between two facades, not across a side street (`betweenFacades`);
 * - its slots (`lineSlots` against `world`) fit at least LINE_REFORM_MIN
 *   members (all of them when fewer are left), none inside a shop room;
 * - clear of free protesters and of the other lines.
 *
 * The first spot where every member fits wins; with none, the one that fits
 * the most. Null when nothing qualifies (the cortège is near the end).
 */
export function regroupSpot(level: Level, world: CollisionWorld, front: number, q: RegroupQuery): Vec2 | null {
  const axis = marchAxis(level);
  if (!axis || q.members <= 0) return null;
  const { from, to } = level.progress;
  const len = Math.hypot(to.x - from.x, to.z - from.z);
  const facing = { x: -axis.x, z: -axis.z };
  const needed = Math.min(LINE_REFORM_MIN, q.members);
  const start = Math.max(0, front) * len + LINE_REGROUP_AHEAD;
  let best: Vec2 | null = null;
  let bestN = 0;
  for (let d = start; d <= start + LINE_REGROUP_SEARCH && d <= len; d += LINE_REGROUP_STEP) {
    const c = { x: from.x + axis.x * d, z: from.z + axis.z * d };
    if (inRect(level.destination, c.x, c.z)) break;
    if (maxAdvanceFor(level, c, facing, Infinity) <= 0 || !betweenFacades(level, c)) continue;
    if (q.others?.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < LINE_REGROUP_SPREAD)) continue;
    if (!clearOfProtesters(c, axis, q.protesters)) continue;
    const slots = lineSlots(world, c, facing, q.members, q.radius);
    if (slots.length < needed) continue;
    if (q.rooms?.some((r) => slots.some((s) => inRect(r.rect, s.x, s.z)))) continue;
    if (slots.length >= q.members) return c;
    if (slots.length > bestN) {
      bestN = slots.length;
      best = c;
    }
  }
  return best;
}

/** Members of a line that are not out. */
function aliveMembers(line: ShieldLine): number {
  let n = 0;
  for (const m of line.members) if (m.status !== CrsStatus.Out) n++;
  return n;
}

/** Give up on the current regroup spot: everyone chases again until a new one is found, from `now + retry`. */
function dropRegroup(line: ShieldLine, now: number, retry: number): void {
  line.regroupAt = null;
  line.returning.clear();
  line.slots.clear();
  line.regroupRetryAt = now + retry;
}

/**
 * One tick of a broken line (#131). Members done chasing (`doneChasing`)
 * walk back to their slot on a spot picked by `regroupSpot` (picked again
 * when they took LINE_REGROUP_TIMEOUT or the cortège got past it); the
 * others chase on. Once LINE_REFORM_MIN of the walkers (every member left,
 * when fewer) stand on their slots with no protester in the way, the line
 * forms there and every member, walker or chaser, holds a slot again.
 * Without `ctx.level` and `ctx.front`, a broken line just chases.
 */
function stepRegroup(line: ShieldLine, ctx: CrsContext, host: CrsHost, others: readonly ShieldLine[], result: LineStepResult): void {
  const level = ctx.level;
  const front = ctx.front;
  const axis = level ? marchAxis(level) : null;
  if (!level || front === undefined || !axis || line.members.length === 0) return;
  const now = ctx.now;
  const world = ctx.avoid ?? ctx.world;
  if (line.regroupAt !== null) {
    const late = now - line.regroupAt > LINE_REGROUP_TIMEOUT;
    const passed = progressAt(level, line.centre.x, line.centre.z) <= front;
    if (late || passed) dropRegroup(line, now, 0);
  }
  if (line.regroupAt === null) {
    let due = false;
    for (const m of line.members) if (m.status !== CrsStatus.Out && doneChasing(line, m, now)) due = true;
    if (!due || now < line.regroupRetryAt) return;
    const radius = Math.max(0, ...line.members.map((m) => m.stats.radius));
    const centres: Vec2[] = [];
    for (const o of others) if (o !== line && (o.formed || o.regroupAt !== null)) centres.push(o.centre);
    const spot = regroupSpot(level, world, front, {
      members: aliveMembers(line),
      radius: radius || undefined,
      rooms: ctx.rooms,
      protesters: host.protesters(),
      others: centres,
    });
    if (!spot) {
      dropRegroup(line, now, LINE_REGROUP_RETRY);
      return;
    }
    line.centre.x = spot.x;
    line.centre.z = spot.z;
    line.facing.x = -axis.x;
    line.facing.z = -axis.z;
    line.regroupAt = now;
    line.refreshAt = 0;
    result.regroupTo = { x: spot.x, z: spot.z };
  }
  for (const m of line.members) {
    if (m.status === CrsStatus.Out || line.returning.has(m.id) || !doneChasing(line, m, now)) continue;
    // Off duty: no grab winding up on the way back, no target.
    line.returning.add(m.id);
    cancelWindup(m, now, false);
    m.targetId = null;
    m.path = null;
  }
  if (now >= line.refreshAt) {
    line.refreshAt = now + LINE_SLOT_REFRESH;
    // Something landed on the spot since (a fire, a prop): look for another next tick.
    if (!assignSlots(line, world)) {
      dropRegroup(line, now, 0);
      return;
    }
  }
  const needed = Math.min(LINE_REFORM_MIN, aliveMembers(line));
  let inPlace = 0;
  for (const m of line.members) {
    if (!line.returning.has(m.id) || m.status !== CrsStatus.Active || isDown(m.body)) continue;
    const slot = line.slots.get(m.id);
    if (slot && Math.hypot(slot.x - m.body.x, slot.z - m.body.z) <= LINE_SLOT_TOLERANCE) inPlace++;
  }
  if (needed > 0 && inPlace >= needed && clearOfProtesters(line.centre, axis, host.protesters())) {
    reformLine(line, level, now);
    result.reformed = true;
  }
}

/** The line forms again where it stands (#131): a fresh line in every way, which can advance, shove, break and regroup again. */
export function reformLine(line: ShieldLine, level: Level, now: number): void {
  line.formed = true;
  line.brokenBy = null;
  line.origin.x = line.centre.x;
  line.origin.z = line.centre.z;
  line.maxAdvance = maxAdvanceFor(level, line.centre, line.facing);
  line.hits.length = 0;
  line.flankSince = null;
  line.shoveReadyAt = now;
  line.shoveStreak.clear();
  line.lateSince.clear();
  line.landed.clear();
  line.returning.clear();
  line.regroupAt = null;
  line.refreshAt = 0;
  line.blocked = false;
  line.reforms++;
  for (const m of line.members) {
    m.targetId = null;
    m.path = null;
  }
}

/**
 * A member walking back to re-form (#131): along a path, facing where it
 * walks, while far from its slot; then like a member holding it.
 */
function walkBack(line: ShieldLine, bot: CrsBot, ctx: CrsContext): void {
  const slot = line.slots.get(bot.id);
  if (slot && Math.hypot(slot.x - bot.body.x, slot.z - bot.body.z) > SLOT_DIRECT) {
    steerTo(bot, slot.x, slot.z, ctx);
    if (bot.input.x !== 0 || bot.input.z !== 0) bot.rotation = Math.atan2(bot.input.x, bot.input.z);
    return;
  }
  holdSlot(line, bot, ctx);
}

/** A member that stands its ground with a raised shield: in a formed line, not out, not on the floor. */
export function isShieldUp(line: ShieldLine, bot: CrsBot): boolean {
  return line.formed && bot.status !== CrsStatus.Out && !isDown(bot.body);
}

/** Collision circles of the raised shields, for protesters to bump into. */
export function shieldCircles(line: ShieldLine, out: CircleShape[] = []): CircleShape[] {
  for (const m of line.members) if (isShieldUp(line, m)) out.push({ x: m.body.x, z: m.body.z, r: LINE_SHIELD_RADIUS });
  return out;
}

/** What `stepLine` did this tick, for the room to announce. */
export interface LineStepResult {
  /** The line broke this tick, and why. */
  broke: LineBreak | null;
  /** Members that shoved someone this tick. */
  shovedBy: string[];
  /** The broken line formed again this tick (#131). */
  reformed: boolean;
  /** Its members started walking back to this spot this tick (#131). */
  regroupTo: Vec2 | null;
}

/**
 * One fixed tick of a line, before its members step: drop members taken out,
 * check whether it breaks, refresh the slots, advance, shove.
 *
 * It advances (moving every slot along the facing) only while a free
 * protester is within LINE_ENGAGE_RANGE, it has not gone LINE_MAX_ADVANCE
 * yet, and every member that matters is in place: members stunned or down
 * don't hold it back, and neither does one out of place for
 * LINE_STRAGGLER_TIME (stuck on a car, pinned against a protester).
 * A member pinned against a protester who is against a wall lags behind its
 * slot, so the line stops there for a while instead of crushing through.
 */
export function stepLine(line: ShieldLine, ctx: CrsContext, host: CrsHost, others: readonly ShieldLine[] = []): LineStepResult {
  const result: LineStepResult = { broke: null, shovedBy: [], reformed: false, regroupTo: null };
  const now = ctx.now;
  for (let i = line.members.length - 1; i >= 0; i--) {
    const m = line.members[i]!;
    if (m.status === CrsStatus.Out || !ctx.bots.includes(m)) {
      line.members.splice(i, 1);
      line.slots.delete(m.id);
      line.lateSince.delete(m.id);
      line.returning.delete(m.id);
      line.landed.delete(m.id);
    }
  }
  if (!line.formed) {
    stepRegroup(line, ctx, host, others, result);
    return result;
  }

  const why = checkBreak(line, host.protesters(), now);
  if (why) {
    breakLine(line, why, now);
    result.broke = why;
    return result;
  }

  if (now >= line.refreshAt) {
    line.blocked = !assignSlots(line, ctx.avoid ?? ctx.world);
    line.refreshAt = now + LINE_SLOT_REFRESH;
  }

  // In place?
  let ready = line.slots.size > 0 && !line.blocked;
  for (const m of line.members) {
    const slot = line.slots.get(m.id);
    if (!slot) continue;
    const near = Math.hypot(slot.x - m.body.x, slot.z - m.body.z) <= LINE_SLOT_TOLERANCE;
    if (near) {
      line.lateSince.delete(m.id);
      continue;
    }
    let since = line.lateSince.get(m.id);
    if (since === undefined) {
      since = now;
      line.lateSince.set(m.id, now);
    }
    const working = m.status === CrsStatus.Active && !isDown(m.body);
    if (working && now - since < LINE_STRAGGLER_TIME) ready = false;
  }

  if (ready && canAdvance(line, host.protesters())) {
    const step = Math.min(LINE_SPEED * ctx.dt, line.maxAdvance - advanced(line));
    if (step > 0) {
      const dx = line.facing.x * step;
      const dz = line.facing.z * step;
      line.centre.x += dx;
      line.centre.z += dz;
      for (const slot of line.slots.values()) {
        slot.x += dx;
        slot.z += dz;
      }
    }
  }

  if (now >= line.shoveReadyAt) result.shovedBy = shove(line, host, now);
  return result;
}

/** Distance advanced from where the line formed, along its facing. */
export function advanced(line: ShieldLine): number {
  return (line.centre.x - line.origin.x) * line.facing.x + (line.centre.z - line.origin.z) * line.facing.z;
}

/** A free protester within LINE_ENGAGE_RANGE, and room left to advance. */
function canAdvance(line: ShieldLine, protesters: Iterable<ProtesterView>): boolean {
  if (advanced(line) >= line.maxAdvance) return false;
  for (const p of protesters) {
    if (p.status !== PlayerStatus.Free) continue;
    if (Math.hypot(p.x - line.centre.x, p.z - line.centre.z) <= LINE_ENGAGE_RANGE) return true;
  }
  return false;
}

/**
 * Every free protester touching a raised shield is pushed away from the line
 * (along its facing), without damage. The LINE_SHOVES_TO_FLOOR-th shove in a
 * row on the same protester floors them. Starts the shove cooldown only when
 * someone was shoved, so walking into an idle line bounces at once.
 * Returns the members that shoved.
 */
function shove(line: ShieldLine, host: CrsHost, now: number): string[] {
  const by: string[] = [];
  const reach = LINE_SHIELD_RADIUS + PLAYER_RADIUS + LINE_SHOVE_REACH;
  for (const p of host.protesters()) {
    if (p.status !== PlayerStatus.Free) continue;
    let member: CrsBot | null = null;
    for (const m of line.members) {
      if (!isShieldUp(line, m) || m.status !== CrsStatus.Active) continue;
      if (Math.hypot(p.x - m.body.x, p.z - m.body.z) <= reach) {
        member = m;
        break;
      }
    }
    if (!member) continue;
    const last = line.shoveStreak.get(p.id);
    const count = last && now - last.at <= LINE_SHOVE_INTERVAL * 1.5 ? last.count + 1 : 1;
    const floor = count >= LINE_SHOVES_TO_FLOOR;
    line.shoveStreak.set(p.id, { count: floor ? 0 : count, at: now });
    host.shove(member.id, p.id, line.facing.x, line.facing.z, LINE_SHOVE_IMPULSE, floor);
    if (!by.includes(member.id)) by.push(member.id);
  }
  if (by.length > 0) line.shoveReadyAt = now + LINE_SHOVE_INTERVAL;
  return by;
}

/**
 * Walk `bot` to its slot: straight there and slowing down on arrival when
 * close, along a path (steerTo) when far or blocked. Faces the line's facing.
 */
export function holdSlot(line: ShieldLine, bot: CrsBot, ctx: CrsContext): void {
  const slot = line.slots.get(bot.id);
  bot.rotation = Math.atan2(line.facing.x, line.facing.z);
  if (!slot) {
    bot.input.x = 0;
    bot.input.z = 0;
    return;
  }
  const dx = slot.x - bot.body.x;
  const dz = slot.z - bot.body.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= SLOT_STOP) {
    bot.input.x = 0;
    bot.input.z = 0;
    return;
  }
  if (dist > SLOT_DIRECT || !ctx.nav.segmentWalkable(bot.body, slot)) {
    steerTo(bot, slot.x, slot.z, ctx);
    bot.rotation = Math.atan2(line.facing.x, line.facing.z);
    return;
  }
  // Slow down to land on the slot instead of overshooting it.
  const k = Math.min(1, dist / (bot.stats.speed * ctx.dt)) / dist;
  bot.input.x = dx * k;
  bot.input.z = dz * k;
}

/** The member of a formed line that throws tear gas (#7): the one in the middle of the list, so the line keeps one thrower as members fall. */
export function lineThrower(line: ShieldLine): CrsBot | undefined {
  return line.members[Math.floor(line.members.length / 2)];
}

/**
 * Behaviour of a line member: while the line is formed it holds its slot and
 * never swings or grabs (its thrower lobs tear gas, #7); once broken it is a
 * plain chasing bot (#5), whose swings are counted (#131), until it is done
 * chasing and walks back to re-form, attacking nobody on the way.
 */
export function lineBehaviour(line: ShieldLine, base: CrsBehaviour = DEFAULT_BEHAVIOUR): CrsBehaviour {
  return {
    updateTarget: base.updateTarget,
    act: (bot, target, ctx, host) => {
      const ready = bot.batonReadyAt;
      const stand = base.act(bot, target, ctx, host);
      // A swing restarts the baton cooldown (#131: a few of them and it goes back to re-form).
      if (!line.formed && bot.batonReadyAt !== ready) line.landed.set(bot.id, (line.landed.get(bot.id) ?? 0) + 1);
      return stand;
    },
    drag: base.drag,
    orders: (bot, ctx, host) => {
      if (!line.formed) {
        if (!line.returning.has(bot.id)) return false;
        walkBack(line, bot, ctx);
        return true;
      }
      holdSlot(line, bot, ctx);
      // Tear gas (#7): one member lobs canisters over the shields, without leaving its slot.
      if (lineThrower(line) === bot && isShieldUp(line, bot)) tryThrowGas(bot, ctx, host);
      return true;
    },
  };
}

/** A raised shield a protester collides with: the member's body and how far its shield reaches. */
export interface ShieldContact {
  /** The member's body; moved back when it would crush a protester into a wall. */
  body: Vec2;
  /** The member's own collision radius against the world. */
  bodyRadius: number;
  /** The shield's reach (LINE_SHIELD_RADIUS). */
  radius: number;
  /** The line's facing: where a protester dead in the middle of a member is pushed. */
  facing: Vec2;
}

/**
 * Push a protester at `p` (radius `r`) out of raised shields, then back out
 * of the world: walls win, so nobody ends up inside a building. If a shield
 * still overlaps them after that (pinned between the shield and a wall), the
 * member is the one pushed back, collided with the world: the line stops
 * there, it never crushes anyone through a wall. Mutates `p` and the members'
 * bodies; returns true if anything moved.
 *
 * Run after the bots step (members walk into protesters). Protesters walking
 * into shields are already stopped by their own step, which collides against
 * the shields as circles (see the room).
 */
export function resolveShieldContacts(world: CollisionWorld, p: Vec2, r: number, shields: readonly ShieldContact[]): boolean {
  let moved = false;
  for (let pass = 0; pass < 3; pass++) {
    let touched = false;
    for (const s of shields) {
      const dx = p.x - s.body.x;
      const dz = p.z - s.body.z;
      const min = r + s.radius;
      const d = Math.hypot(dx, dz);
      if (d >= min - 1e-9) continue;
      touched = true;
      if (d < 1e-6) {
        p.x = s.body.x + s.facing.x * min;
        p.z = s.body.z + s.facing.z * min;
      } else {
        p.x = s.body.x + (dx / d) * min;
        p.z = s.body.z + (dz / d) * min;
      }
    }
    if (!touched) break;
    moved = true;
    const res = resolveCircle(world, p.x, p.z, r);
    p.x = res.x;
    p.z = res.z;
  }
  if (!moved) return false;
  // Still overlapping a shield: pinned against a wall. The member gives way.
  for (const s of shields) {
    const dx = s.body.x - p.x;
    const dz = s.body.z - p.z;
    const min = r + s.radius;
    const d = Math.hypot(dx, dz);
    if (d >= min - 1e-9) continue;
    const nx = d < 1e-6 ? -s.facing.x : dx / d;
    const nz = d < 1e-6 ? -s.facing.z : dz / d;
    const push = min - d;
    const res = moveCircle(world, s.body, nx * push, nz * push, s.bodyRadius);
    s.body.x = res.x;
    s.body.z = res.z;
  }
  return true;
}
