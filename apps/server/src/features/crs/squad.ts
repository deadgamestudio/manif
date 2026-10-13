import type { MapSchema } from "@colyseus/schema";
import {
  applyImpulse,
  CRS_RESPAWN_DELAY,
  CRS_SPAWN_CLEARANCE,
  CRS_STATS,
  CrsKind,
  CrsStatus,
  LINE_SHIELD_RADIUS,
  LINE_SIZE,
  MAX_CRS,
  NavGrid,
  createCrsBot,
  createShieldLine,
  hitCrs,
  isShieldUp,
  lineBehaviour,
  lineSlots,
  maxAdvanceFor,
  recordLineHit,
  stepLine,
  isDown,
  burnCrs,
  pickSpawn,
  stepCrs,
  strikeCrs,
  stunCrs,
  vanDoors,
  type CircleShape,
  type CollisionWorld,
  type CrsBehaviour,
  type CrsBot,
  type CrsContext,
  type CrsHitResult,
  type CrsHost,
  type ImpulseResult,
  type LineStepResult,
  type ShieldContact,
  type ShieldLine,
  type Level,
  type MeleeTarget,
  type Vec2,
} from "@manif/shared";
import { Crs } from "./schema.js";

/** Rotation changes smaller than this are not sent (radians). */
const ROTATION_EPSILON = 0.01;

/**
 * Server-side police bots (#5). Holds each bot's full state (target, path,
 * timers, body) and mirrors the synced fields into `state.crs`. The AI itself
 * is the pure `stepCrs` from @manif/shared; the room supplies a `CrsHost` for
 * the effects on protesters.
 *
 * Spawning: `spawn` puts one bot at a point, under the MAX_CRS cap. The
 * round (#12) calls `spawn` and `spawnLine` itself for its waves and keeps
 * `reinforceTo` at 0. With `reinforceTo` above 0, a bot taken out is replaced
 * after CRS_RESPAWN_DELAY, keeping that many lone bots on the street.
 *
 * Shield lines (#6): `spawnLine` puts a whole line across the street. Its
 * members are ordinary bots with the line's behaviour (hold your slot) until
 * it breaks; then they chase like the others. Line members are not counted by
 * `reinforceTo` and are not replaced when taken out.
 */
export class CrsSquad {
  /** Keep this many bots on the street by replacing those taken out. 0 turns it off (#12). */
  reinforceTo = 0;
  private readonly bots: CrsBot[] = [];
  private readonly byId = new Map<string, CrsBot>();
  private readonly nav: NavGrid;
  private readonly vans: Vec2[];
  private readonly ctx: CrsContext;
  /** Room times when a replacement is due. */
  private respawnAt: number[] = [];
  private counter = 0;
  private readonly lines: ShieldLine[] = [];
  /** The line each line member belongs to (kept after the line breaks). */
  private readonly lineOf = new Map<string, ShieldLine>();
  private lineCounter = 0;
  /** One behaviour per line, shared by its members. */
  private readonly lineBehaviours = new WeakMap<ShieldLine, CrsBehaviour>();
  /** Reused every tick: the raised shields protesters collide with. */
  private readonly contacts: ShieldContact[] = [];
  /** What bots keep away from without it being solid (#16: fire zones), as a world (same bounds). */
  private hazards: CollisionWorld | null = null;
  /** The world plus the hazards: the navigation grid and shield line slots are laid against it. */
  private readonly avoid: { -readonly [K in keyof CollisionWorld]: CollisionWorld[K] };

  constructor(
    private readonly level: Level,
    private readonly world: CollisionWorld,
    private readonly views: MapSchema<Crs>,
    private readonly behaviour?: CrsBehaviour,
  ) {
    // One grid for every unit type, cleared for the widest of them.
    const clearance = Math.max(...Object.values(CRS_STATS).map((s) => s.radius));
    this.avoid = { ...world };
    this.nav = new NavGrid(this.avoid, clearance);
    this.vans = vanDoors(level);
    this.ctx = { world, avoid: this.avoid, nav: this.nav, vans: this.vans, bots: this.bots, now: 0, dt: 0 };
  }

  get size(): number {
    return this.bots.length;
  }

  get(id: string): Readonly<CrsBot> | undefined {
    return this.byId.get(id);
  }

  /** The collision world changed (a prop broke): re-rasterize the navigation grid. */
  worldChanged(): void {
    const h = this.hazards;
    this.avoid.bounds = this.world.bounds;
    this.avoid.boxes = h && h.boxes.length > 0 ? [...this.world.boxes, ...h.boxes] : this.world.boxes;
    this.avoid.circles = h && h.circles.length > 0 ? [...this.world.circles, ...h.circles] : this.world.circles;
    this.nav.rebuild(this.avoid);
  }

  /**
   * Places bots keep away from although they are not solid (#16: the fire
   * zones), or null for none. Bots path around them and shield lines lay
   * their slots clear of them, from the next tick. Rebuilds the grid.
   */
  setHazards(hazards: CollisionWorld | null): void {
    this.hazards = hazards;
    this.worldChanged();
    // A fire lit or gone on someone's route: everyone re-paths on their next step.
    for (const bot of this.bots) bot.path = null;
  }

  /** Remove every bot. */
  clear(): void {
    this.bots.length = 0;
    this.byId.clear();
    this.views.clear();
    this.respawnAt = [];
    this.lines.length = 0;
    this.lineOf.clear();
  }

  /**
   * Form a shield line (#6) of up to `size` bots centred on (x, z), facing
   * the cortège (the start of the street) unless `facing` says otherwise. The
   * slots come from the level around that point, so a narrow street gets a
   * shorter line. Each member appears on its slot. Null when no slot fits or
   * at the MAX_CRS cap; a line may be shorter than `size` near the cap.
   */
  spawnLine(x: number, z: number, size = LINE_SIZE, facing?: Vec2, kind: CrsKind = CrsKind.Crs): ShieldLine | null {
    const dir = facing ?? this.towardsCortege();
    const slots = lineSlots(this.avoid, { x, z }, dir, size, CRS_STATS[kind].radius);
    const members: CrsBot[] = [];
    for (const slot of slots) {
      const bot = this.spawn(slot.x, slot.z, kind);
      if (!bot) break;
      bot.rotation = Math.atan2(dir.x, dir.z);
      members.push(bot);
    }
    if (members.length === 0) return null;
    // Never closer than LINE_START_CLEARANCE to the start zone (#12 can lower it further).
    const line = createShieldLine(`line-${++this.lineCounter}`, members, { x, z }, dir, maxAdvanceFor(this.level, { x, z }, dir));
    this.lines.push(line);
    for (const bot of members) {
      this.lineOf.set(bot.id, line);
      const view = this.views.get(bot.id);
      if (view) this.mirror(bot, view);
    }
    return line;
  }

  /** Every shield line, formed or broken. */
  get shieldLines(): readonly ShieldLine[] {
    return this.lines;
  }

  /**
   * The raised shields protesters collide with this tick (#6): members of a
   * formed line that are standing. Moving a contact's body moves the bot.
   */
  shieldContacts(): readonly ShieldContact[] {
    this.contacts.length = 0;
    for (const line of this.lines) {
      if (!line.formed) continue;
      for (const bot of line.members) {
        if (!isShieldUp(line, bot)) continue;
        this.contacts.push({ body: bot.body, bodyRadius: bot.stats.radius, radius: LINE_SHIELD_RADIUS, facing: line.facing });
      }
    }
    return this.contacts;
  }

  /**
   * CRS lying on the ground (#45): knocked down or out. Protesters walking
   * bump into them and hop over them (the circles are `hoppable`), and they
   * give way when they squeeze someone against a wall or a prop (`soft`). Appended
   * to `out` as circles of the bot's radius. Bots ignore each other, as before.
   */
  fallenCircles(out: CircleShape[]): CircleShape[] {
    for (const bot of this.bots) {
      if (bot.status !== CrsStatus.Out && !isDown(bot.body)) continue;
      out.push({ x: bot.body.x, z: bot.body.z, r: bot.stats.radius, hoppable: true, soft: true });
    }
    return out;
  }

  /** From the Préfecture end towards the start: where the cortège comes from. */
  private towardsCortege(): Vec2 {
    const { from, to } = this.level.progress;
    const dx = from.x - to.x;
    const dz = from.z - to.z;
    const len = Math.hypot(dx, dz) || 1;
    return { x: dx / len, z: dz / len };
  }

  /** Add one bot at (x, z), facing the start of the street. Null at the MAX_CRS cap. */
  spawn(x: number, z: number, kind: CrsKind = CrsKind.Crs): CrsBot | null {
    if (this.bots.length >= MAX_CRS) return null;
    const id = `crs-${++this.counter}`;
    // Facing +Z: towards the start, where the cortège comes from.
    const bot = createCrsBot(id, kind, x, z, 0, this.ctx.now);
    this.bots.push(bot);
    this.byId.set(id, bot);
    const view = new Crs();
    view.kind = kind;
    // Set explicitly: mirror() skips a rotation that has not changed, and an unset float32 reads undefined on clients.
    view.rotation = bot.rotation;
    this.mirror(bot, view);
    this.views.set(id, view);
    return bot;
  }

  /**
   * DEBUG (#45, dev only): a bot lying out cold at (x, z) for `seconds`, then
   * removed like any bot taken out. For scripted hop tests. Null at the cap.
   */
  spawnFallen(x: number, z: number, now: number, seconds: number): CrsBot | null {
    const bot = this.spawn(x, z);
    if (!bot) return null;
    bot.status = CrsStatus.Out;
    bot.statusUntil = now + seconds;
    bot.body.downTime = seconds;
    const view = this.views.get(bot.id);
    if (view) this.mirror(bot, view);
    return bot;
  }

  /** What a protester's swing can land on: every bot not out, as a circle. */
  *meleeTargets(): Generator<MeleeTarget> {
    for (const bot of this.bots) {
      if (bot.status === CrsStatus.Out) continue;
      yield { id: bot.id, shape: { type: "circle", x: bot.body.x, z: bot.body.z, r: bot.stats.radius } };
    }
  }

  /** A protester's melee (#4) lands on bot `id`, swung from (fromX, fromZ). Null for an unknown or out bot. */
  hit(id: string, fromX: number, fromZ: number, damage: number, now: number): CrsHitResult | null {
    const bot = this.byId.get(id);
    if (!bot) return null;
    const hpBefore = bot.hp;
    const res = hitCrs(bot, fromX, fromZ, damage, now);
    this.recordLineDamage(bot, hpBefore, damage, now);
    const view = this.views.get(id);
    if (res && view) this.mirror(bot, view);
    return res;
  }

  /**
   * A thrown item (#8) lands on bot `id`, flying along (dirX, dirZ): damage,
   * knockback along the throw and a stun (see `strikeCrs`). Null for an
   * unknown or out bot. The room broadcasts the result.
   */
  strike(id: string, dirX: number, dirZ: number, damage: number, impulse: number, stun: number, now: number): CrsHitResult | null {
    const bot = this.byId.get(id);
    if (!bot) return null;
    const hpBefore = bot.hp;
    const res = strikeCrs(bot, dirX, dirZ, damage, impulse, stun, now);
    this.recordLineDamage(bot, hpBefore, damage, now);
    const view = this.views.get(id);
    if (res && view) this.mirror(bot, view);
    return res;
  }

  /**
   * A server-resolved hit landed on a line member: it counts towards breaking
   * its line (#6). A hit on a bot already at 0 HP does not count.
   */
  private recordLineDamage(bot: CrsBot, hpBefore: number, damage: number, now: number): void {
    const line = this.lineOf.get(bot.id);
    if (line && hpBefore > 0) recordLineHit(line, Math.min(hpBefore, damage), now);
  }

  /** Every bot, out or not (read-only: fire #16 checks who stands in it). */
  get all(): readonly Readonly<CrsBot>[] {
    return this.bots;
  }

  /**
   * Fire damage on bot `id` (#16): HP off, no push, no stun. Returns true if
   * it took the bot out. Counts towards breaking its shield line like any hit.
   */
  burn(id: string, damage: number, now: number): boolean {
    const bot = this.byId.get(id);
    if (!bot) return false;
    const hpBefore = bot.hp;
    const out = burnCrs(bot, damage, now);
    this.recordLineDamage(bot, hpBefore, damage, now);
    const view = this.views.get(id);
    if (view) this.mirror(bot, view);
    return out;
  }

  /** The synced view of bot `id`, for the fields other features write (fire #16: `onFire`). */
  view(id: string): Crs | undefined {
    return this.views.get(id);
  }

  /** Stun bot `id` (a pavé, #8). It lets go of any grab on its next tick. */
  stun(id: string, now: number, duration?: number): boolean {
    const bot = this.byId.get(id);
    if (!bot || !stunCrs(bot, now, duration)) return false;
    const view = this.views.get(id);
    if (view) this.mirror(bot, view);
    return true;
  }

  /** The bot holding protester `protesterId`, if any (#10). */
  holderOf(protesterId: string): string | null {
    for (const bot of this.bots) {
      if (bot.status === CrsStatus.Grabbing && bot.grabbedId === protesterId) return bot.id;
    }
    return null;
  }

  /**
   * Push bot `id` (#10: knocked back when a rescue pulls its protester away).
   * A heavy push floors it, so it lets go and lies down for a moment. Null for
   * an unknown or out bot. The room broadcasts the result.
   */
  push(id: string, dirX: number, dirZ: number, strength: number): ImpulseResult | null {
    const bot = this.byId.get(id);
    if (!bot || bot.status === CrsStatus.Out) return null;
    const res = applyImpulse(bot.body, dirX, dirZ, strength);
    const view = this.views.get(id);
    if (view) this.mirror(bot, view);
    return res;
  }

  /**
   * One fixed tick for every bot, after the protesters have moved. Bots that
   * have been out long enough are removed (and a replacement scheduled).
   * `protesters` is where replacements avoid spawning.
   */
  step(now: number, dt: number, host: CrsHost, protesters: () => Vec2[], onLine?: (line: ShieldLine, res: LineStepResult) => void): void {
    this.ctx.now = now;
    this.ctx.dt = dt;
    for (let i = this.bots.length - 1; i >= 0; i--) {
      const bot = this.bots[i]!;
      if (bot.status === CrsStatus.Out && now >= bot.statusUntil) this.remove(i, now);
    }
    // Lines first (#6): breaks, slots, advance and shoves, so members walk to a fresh slot.
    for (const line of this.lines) {
      const res = stepLine(line, this.ctx, host);
      if (onLine && (res.broke !== null || res.shovedBy.length > 0)) onLine(line, res);
    }
    for (let i = this.lines.length - 1; i >= 0; i--) {
      if (this.lines[i]!.members.length === 0) this.lines.splice(i, 1);
    }
    for (const bot of this.bots) {
      stepCrs(bot, this.ctx, host, this.behaviourOf(bot));
      const view = this.views.get(bot.id);
      if (view) this.mirror(bot, view);
    }
    this.reinforce(now, protesters);
  }

  /** A line member follows its line's orders (until it breaks); every other bot the squad's behaviour. */
  private behaviourOf(bot: CrsBot): CrsBehaviour | undefined {
    const line = this.lineOf.get(bot.id);
    if (!line) return this.behaviour;
    let b = this.lineBehaviours.get(line);
    if (!b) {
      b = lineBehaviour(line, this.behaviour);
      this.lineBehaviours.set(line, b);
    }
    return b;
  }

  private remove(index: number, now: number): void {
    const bot = this.bots[index]!;
    this.bots.splice(index, 1);
    this.byId.delete(bot.id);
    this.views.delete(bot.id);
    const inLine = this.lineOf.delete(bot.id);
    // Line members are not replaced: #12 sends new lines.
    if (this.reinforceTo > 0 && !inLine) this.respawnAt.push(now + CRS_RESPAWN_DELAY);
  }

  /** Bots that are not part of a line (formed or broken): what `reinforceTo` counts. */
  private get loneBots(): number {
    return this.bots.length - this.lineOf.size;
  }

  private reinforce(now: number, protesters: () => Vec2[]): void {
    if (this.respawnAt.length === 0) return;
    const due = this.respawnAt.filter((t) => now >= t).length;
    if (due === 0) return;
    this.respawnAt = this.respawnAt.filter((t) => now < t);
    const people = protesters();
    for (let i = 0; i < due && this.loneBots < this.reinforceTo; i++) {
      const p = pickSpawn(this.level.crsSpawns, people, CRS_SPAWN_CLEARANCE);
      if (p) this.spawn(p.x, p.z);
    }
  }

  /** Copy the synced fields, only where they changed, so a still bot costs nothing in the patch. */
  private mirror(bot: CrsBot, view: Crs): void {
    if (view.x !== bot.body.x) view.x = bot.body.x;
    if (view.z !== bot.body.z) view.z = bot.body.z;
    if (Math.abs(view.rotation - bot.rotation) > ROTATION_EPSILON) view.rotation = bot.rotation;
    if (view.hp !== bot.hp) view.hp = bot.hp;
    if (view.status !== bot.status) view.status = bot.status;
    const down = isDown(bot.body);
    if (view.down !== down) view.down = down;
    const formation = this.lineOf.get(bot.id)?.formed === true && bot.status !== CrsStatus.Out;
    if (view.formation !== formation) view.formation = formation;
  }

  /** Mirror every bot now (after the room moved some, e.g. a member pushed back by a pinned protester). */
  syncViews(): void {
    for (const bot of this.bots) {
      const view = this.views.get(bot.id);
      if (view) this.mirror(bot, view);
    }
  }
}
