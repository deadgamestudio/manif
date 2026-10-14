import type { MapSchema } from "@colyseus/schema";
import {
  applyImpulse,
  BAC_BEHAVIOUR,
  BRAVM_BEHAVIOUR,
  CrsMount,
  HEAVY_IMPULSE,
  bacStalkAt,
  canRemount,
  crsRadius,
  isRiding,
  leaveBike,
  mountBike,
  remount,
  resolveCircle,
  revealBac,
  stepBike,
  stepWreck,
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
  isSplatted,
  isStinky,
  CRS_EFFECTS,
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
  type CrsEffect,
  type CrsHitResult,
  type CrsHost,
  type ImpulseResult,
  type KnockdownMode,
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
 *
 * Unit types (#13): `spawnBac` slips a plain-clothes BAC into the cortège
 * (disguised until `revealBac`: any hit, push, stun, splat or burn reveals
 * it at once), `spawnBravm` brings a BRAV-M bike. The squad does the bike's
 * bookkeeping: the passenger it drops and picks up again, riders knocked off
 * or getting off when blocked, the wreck left behind, a bike that rides off.
 */
export class CrsSquad {
  /** Keep this many bots on the street by replacing those taken out. 0 turns it off (#12). */
  reinforceTo = 0;
  private readonly bots: CrsBot[] = [];
  private readonly byId = new Map<string, CrsBot>();
  private readonly nav: NavGrid;
  private readonly vans: Vec2[];
  private readonly ctx: CrsContext;
  /** The same as `ctx` with the bikes' own grid, cleared for a bike (#13). */
  private readonly bikeCtx: CrsContext;
  private readonly bikeNav: NavGrid;
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
  /** A behaviour per unit kind set from outside (#17: the pompiers', run by the brigade). */
  private readonly unitBehaviours = new Map<CrsKind, CrsBehaviour>();
  /** Scratch for `pathLength`. */
  private readonly scratch: Vec2 = { x: 0, z: 0 };

  constructor(
    private readonly level: Level,
    private readonly world: CollisionWorld,
    private readonly views: MapSchema<Crs>,
    private readonly behaviour?: CrsBehaviour,
    /** A knockback the squad gave a bot on its own (#13: riders knocked off a bike, the wreck), for the room to announce. */
    private readonly onImpulse?: (id: string, res: ImpulseResult) => void,
  ) {
    // One grid for every unit on foot, cleared for the widest of them.
    const clearance = Math.max(...Object.values(CRS_STATS).map((s) => s.radius));
    this.avoid = { ...world };
    this.nav = new NavGrid(this.avoid, clearance);
    // And one for the bikes (#13), wider: a bike never paths through a gap it can't fit.
    const bikeClearance = Math.max(clearance, ...Object.values(CRS_STATS).map((s) => s.bike?.radius ?? 0));
    this.bikeNav = new NavGrid(this.avoid, bikeClearance);
    this.vans = vanDoors(level);
    this.ctx = { world, avoid: this.avoid, nav: this.nav, vans: this.vans, bots: this.bots, now: 0, dt: 0 };
    this.bikeCtx = { ...this.ctx, nav: this.bikeNav };
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
    this.bikeNav.rebuild(this.avoid);
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

  /** Bots of `kind` follow `behaviour` (#17: the pompiers follow the brigade's orders). */
  setBehaviour(kind: CrsKind, behaviour: CrsBehaviour): void {
    this.unitBehaviours.set(kind, behaviour);
  }

  /**
   * How far a bot on foot would walk from `from` to `to` (#17: which fire a
   * pompier can reach): the length of its path around walls, props and fire
   * zones. Null when there is no path (blocked, or behind a fire). Both ends
   * snap to the nearest walkable spot, like the bots' own paths.
   */
  pathLength(from: Vec2, to: Vec2): number | null {
    const path = this.nav.findPath(from, to);
    if (path === null) return null;
    let len = 0;
    let x = from.x;
    let z = from.z;
    for (const cell of path) {
      this.nav.centre(cell, this.scratch);
      len += Math.hypot(this.scratch.x - x, this.scratch.z - z);
      x = this.scratch.x;
      z = this.scratch.z;
    }
    return len;
  }

  /** Bot `id` leaves the street on its own (#17: a pompier getting back on its truck): removed on the next step, never replaced. */
  retire(id: string): void {
    const bot = this.byId.get(id);
    if (bot) bot.gone = true;
  }

  /** Water on bot `id` (#17): the tomato and the stink wash off. Returns true if there was something to wash. */
  wash(id: string): boolean {
    const bot = this.byId.get(id);
    if (!bot) return false;
    const now = this.ctx.now;
    const dirty = isSplatted(bot, now) || isStinky(bot, now);
    if (!dirty) return false;
    bot.splatUntil = Math.min(bot.splatUntil, now);
    bot.stinkUntil = Math.min(bot.stinkUntil, now);
    bot.backOffUntil = Math.min(bot.backOffUntil, now);
    const view = this.views.get(id);
    if (view) this.mirror(bot, view);
    return true;
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
        this.contacts.push({ body: bot.body, bodyRadius: crsRadius(bot.kind, bot.mount), radius: LINE_SHIELD_RADIUS, facing: line.facing });
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
      out.push({ x: bot.body.x, z: bot.body.z, r: crsRadius(bot.kind, bot.mount), hoppable: true, soft: true });
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
    view.revealed = bot.revealed;
    // Set explicitly: mirror() skips a rotation that has not changed, and an unset float32 reads undefined on clients.
    view.rotation = bot.rotation;
    this.mirror(bot, view);
    this.views.set(id, view);
    return bot;
  }

  /**
   * A BAC in plain clothes (#13) at (x, z), going by `name` (a protester's
   * default name) until it reveals itself. It blends in for a random time
   * (`disguise.blendMin`..`blendMax`), or `blend` seconds when given (dev
   * tests). Null at the MAX_CRS cap.
   */
  spawnBac(x: number, z: number, name: string, blend?: number): CrsBot | null {
    const bot = this.spawn(x, z, CrsKind.Bac);
    if (!bot) return null;
    const d = bot.stats.disguise;
    if (d) bot.stalkAt = blend !== undefined ? this.ctx.now + blend : bacStalkAt(d, this.ctx.now);
    const view = this.views.get(bot.id);
    if (view) {
      view.name = name;
      this.mirror(bot, view);
    }
    return bot;
  }

  /** A BRAV-M bike with its two riders (#13) at (x, z), about to charge; it rides back there to leave. Null at the cap. */
  spawnBravm(x: number, z: number): CrsBot | null {
    const bot = this.spawn(x, z, CrsKind.BravM);
    if (!bot) return null;
    mountBike(bot, this.ctx.now);
    const view = this.views.get(bot.id);
    if (view) this.mirror(bot, view);
    return bot;
  }

  /** BAC (#13): anything that hurts or moves it gives it away. Mirrored by the caller. */
  private unmask(bot: CrsBot, now: number): void {
    revealBac(bot, now);
  }

  /**
   * After a hit, push or burn on a ridden bike (#13): knocked down or at 0
   * HP, both riders fall off. The bot becomes the driver on foot (down, with
   * its full rider HP, so not out), the passenger tumbles off beside it, and
   * the empty bike skids away along the hit. Returns true if it happened.
   */
  private crashIfHit(bot: CrsBot, now: number): boolean {
    if (!isRiding(bot) || (bot.status !== CrsStatus.Out && !isDown(bot.body))) return false;
    const vx = bot.body.vx;
    const vz = bot.body.vz;
    const speed = Math.hypot(vx, vz);
    const dirX = speed > 1e-6 ? vx / speed : -Math.sin(bot.rotation);
    const dirZ = speed > 1e-6 ? vz / speed : -Math.cos(bot.rotation);
    const x = bot.body.x;
    const z = bot.body.z;
    const hadPassenger = leaveBike(bot, now, true);
    if (hadPassenger) {
      // Off the other side, tumbling sideways.
      const p = this.spawnRider(x - dirZ * 0.6, z + dirX * 0.6, bot.rotation);
      if (p) {
        const res = applyImpulse(p.body, dirX - dirZ, dirZ + dirX, HEAVY_IMPULSE, "always");
        this.onImpulse?.(p.id, res);
        const view = this.views.get(p.id);
        if (view) this.mirror(p, view);
      }
    }
    this.spawnWreck(x, z, bot.rotation, now, dirX, dirZ);
    return true;
  }

  /** A BRAV-M rider on foot at (x, z), clear of the world. Null at the cap. */
  private spawnRider(x: number, z: number, rotation: number): CrsBot | null {
    const r = CRS_STATS[CrsKind.BravM].radius;
    const at = resolveCircle(this.world, x, z, r);
    const bot = this.spawn(at.x, at.z, CrsKind.BravM);
    if (bot) bot.rotation = rotation;
    return bot;
  }

  /**
   * The empty bike (#13): lies there for `wreckTime`, skidding along (dirX,
   * dirZ) when knocked over. Purely for show: none at the cap.
   */
  private spawnWreck(x: number, z: number, rotation: number, now: number, dirX: number, dirZ: number, skid = true): void {
    const bike = CRS_STATS[CrsKind.BravM].bike;
    if (!bike) return;
    const at = resolveCircle(this.world, x, z, bike.radius);
    const wreck = this.spawn(at.x, at.z, CrsKind.BravM);
    if (!wreck) return;
    wreck.mount = CrsMount.Wreck;
    wreck.rotation = rotation;
    wreck.status = CrsStatus.Out;
    wreck.statusUntil = now + bike.wreckTime;
    wreck.body.downTime = bike.wreckTime;
    if (skid) {
      const res = applyImpulse(wreck.body, dirX, dirZ, bike.wreckSkid, "never");
      this.onImpulse?.(wreck.id, res);
    }
    const view = this.views.get(wreck.id);
    if (view) this.mirror(wreck, view);
  }

  /** Blocked for too long (#13): both riders step off and go on on foot; the bike stays lying there. */
  private dismount(bot: CrsBot, now: number): void {
    const x = bot.body.x;
    const z = bot.body.z;
    const hadPassenger = leaveBike(bot, now, false);
    if (hadPassenger) this.spawnRider(x - Math.cos(bot.rotation) * 0.9, z + Math.sin(bot.rotation) * 0.9, bot.rotation);
    this.spawnWreck(x, z, bot.rotation, now, 0, 0, false);
  }

  /** The bike stopped by its target (#13): the passenger hops off towards it, with `dropTime` to land a hit or a grab. */
  private dropPassenger(bike: CrsBot, targetId: string | null, now: number): void {
    const ride = bike.ride;
    const stats = CRS_STATS[CrsKind.BravM];
    if (!ride || !stats.bike) return;
    bike.mount = CrsMount.Solo;
    const fx = Math.sin(bike.rotation);
    const fz = Math.cos(bike.rotation);
    const off = stats.bike.radius + stats.radius + 0.1;
    const p = this.spawnRider(bike.body.x + fx * off, bike.body.z + fz * off, bike.rotation);
    if (!p) {
      // No room under the cap: nobody to drop, the raid is off.
      bike.mount = CrsMount.Duo;
      ride.phase = "leave";
      ride.phaseAt = now;
      return;
    }
    ride.passengerId = p.id;
    p.bikeId = bike.id;
    p.missionUntil = now + stats.bike.dropTime;
    p.targetId = targetId;
    p.retargetAt = now + stats.retargetInterval;
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
      yield { id: bot.id, shape: { type: "circle", x: bot.body.x, z: bot.body.z, r: crsRadius(bot.kind, bot.mount) } };
    }
  }

  /** A protester's melee (#4) lands on bot `id`, swung from (fromX, fromZ). Null for an unknown or out bot. */
  hit(id: string, fromX: number, fromZ: number, damage: number, now: number): CrsHitResult | null {
    const bot = this.byId.get(id);
    if (!bot) return null;
    const hpBefore = bot.hp;
    const res = hitCrs(bot, fromX, fromZ, damage, now);
    this.recordLineDamage(bot, hpBefore, damage, now);
    if (res) {
      this.unmask(bot, now);
      // Knocked off a bike (#13): the riders are down, not out.
      if (this.crashIfHit(bot, now)) res.out = false;
    }
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
    if (res) {
      this.unmask(bot, now);
      if (this.crashIfHit(bot, now)) res.out = false;
    }
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
    let out = burnCrs(bot, damage, now);
    this.recordLineDamage(bot, hpBefore, damage, now);
    if (damage > 0 && bot.status !== CrsStatus.Out) this.unmask(bot, now);
    if (out && this.crashIfHit(bot, now)) out = false;
    const view = this.views.get(id);
    if (view) this.mirror(bot, view);
    return out;
  }

  /** The synced view of bot `id`, for the fields other features write (fire #16: `onFire`). */
  view(id: string): Crs | undefined {
    return this.views.get(id);
  }

  /**
   * A thrown item's status on bot `id` (#15: a tomato splats, a dog poo
   * stinks) for `duration` from `now`. A second one refreshes the timer. False
   * for an unknown or out bot.
   */
  affect(id: string, effect: CrsEffect, duration: number, now: number): boolean {
    const bot = this.byId.get(id);
    // A pompier (#17): a tomato or a poo leaves nothing on it (it still gets knocked over by the throw).
    if (!bot || bot.stats.invulnerable === true) return false;
    // A BRAV-M riding along (#13): the wind of the ride blows the stink away.
    if (effect === "stink" && bot.stats.stinkProofRiding === true && isRiding(bot)) return false;
    if (!CRS_EFFECTS[effect](bot, now, duration)) return false;
    this.unmask(bot, now);
    this.ctx.now = now;
    const view = this.views.get(id);
    if (view) this.mirror(bot, view);
    return true;
  }

  /** Stun bot `id` (a pavé, #8). It lets go of any grab on its next tick. */
  stun(id: string, now: number, duration?: number): boolean {
    const bot = this.byId.get(id);
    if (!bot || !stunCrs(bot, now, duration)) return false;
    this.unmask(bot, now);
    const view = this.views.get(id);
    if (view) this.mirror(bot, view);
    return true;
  }

  /**
   * Protester `protesterId` left the street (#59: a bot making room for a
   * human who joined): every bot holding them lets go at once (back to work,
   * with its usual grab cooldown) and every bot chasing them looks for
   * someone else. Without it they'd notice on their next step anyway; this
   * makes it immediate, so no CRS walks to the van holding nobody.
   */
  forget(protesterId: string): void {
    for (const bot of this.bots) {
      if (bot.grabbedId === protesterId) {
        bot.grabbedId = null;
        bot.dragVan = -1;
        if (bot.status === CrsStatus.Grabbing) bot.status = CrsStatus.Active;
        bot.grabReadyAt = this.ctx.now + bot.stats.grabCooldown;
        bot.path = null;
      }
      // A grab winding up on them (#70) just stops.
      if (bot.windupId === protesterId) bot.windupId = null;
      if (bot.targetId === protesterId) {
        bot.targetId = null;
        bot.retargetAt = 0;
        bot.path = null;
      }
      if (bot.ignoreId === protesterId) bot.ignoreId = null;
    }
  }

  /** The squad's navigation grid (#59: protester bots walk it too), fire zones included, rebuilt when a prop breaks. */
  get navGrid(): NavGrid {
    return this.nav;
  }

  /**
   * The van protester `protesterId` is being dragged to (#70): an index into
   * `levelVans` (and `vanDoors`), or -1 when nobody drags them or the bot has no van.
   */
  dragVanOf(protesterId: string): number {
    for (const bot of this.bots) {
      if (bot.status === CrsStatus.Grabbing && bot.grabbedId === protesterId) return bot.dragVan;
    }
    return -1;
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
  push(id: string, dirX: number, dirZ: number, strength: number, mode?: KnockdownMode): ImpulseResult | null {
    const bot = this.byId.get(id);
    if (!bot || bot.status === CrsStatus.Out) return null;
    const res = applyImpulse(bot.body, dirX, dirZ, strength, mode);
    if (res.strength > 0) {
      this.unmask(bot, this.ctx.now);
      this.crashIfHit(bot, this.ctx.now);
    }
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
    this.bikeCtx.now = now;
    this.bikeCtx.dt = dt;
    for (let i = this.bots.length - 1; i >= 0; i--) {
      const bot = this.bots[i]!;
      if (bot.gone) this.remove(i, now, false);
      else if (bot.status === CrsStatus.Out && now >= bot.statusUntil) this.remove(i, now);
    }
    // Lines first (#6): breaks, slots, advance and shoves, so members walk to a fresh slot.
    for (const line of this.lines) {
      const res = stepLine(line, this.ctx, host);
      if (onLine && (res.broke !== null || res.shovedBy.length > 0)) onLine(line, res);
    }
    for (let i = this.lines.length - 1; i >= 0; i--) {
      if (this.lines[i]!.members.length === 0) this.lines.splice(i, 1);
    }
    // A copy: a bike may drop a passenger or leave a wreck mid-loop (they start next tick).
    for (const bot of this.bots.slice()) {
      if (bot.mount === CrsMount.Wreck) stepWreck(this.world, bot, dt);
      else if (isRiding(bot)) this.stepRider(bot, now, host);
      else stepCrs(bot, this.ctx, host, this.behaviourOf(bot));
      const view = this.views.get(bot.id);
      if (view) this.mirror(bot, view);
    }
    this.remountPassengers(now);
    this.reinforce(now, protesters);
  }

  /** One tick of a ridden bike (#13), and what the squad does about it. */
  private stepRider(bot: CrsBot, now: number, host: CrsHost): void {
    // Floored or emptied since its last tick (a slip, a fire): the riders fall off.
    if (this.crashIfHit(bot, now)) return;
    const event = stepBike(bot, this.bikeCtx, host);
    if (event?.type === "drop") this.dropPassenger(bot, event.targetId, now);
    else if (event?.type === "dismount") this.dismount(bot, now);
  }

  /** Passengers back at their waiting bike (#13) get on: one bot again, riding off. */
  private remountPassengers(now: number): void {
    for (let i = this.bots.length - 1; i >= 0; i--) {
      const p = this.bots[i]!;
      if (p.bikeId === null) continue;
      const bike = this.byId.get(p.bikeId);
      if (!bike || !canRemount(p, bike, now)) continue;
      this.remove(i, now, false);
      remount(bike, now);
      const view = this.views.get(bike.id);
      if (view) this.mirror(bike, view);
    }
  }

  /** A line member follows its line's orders (until it breaks); a BAC or a BRAV-M its unit's (#13), a pompier the brigade's (#17); every other bot the squad's behaviour. */
  private behaviourOf(bot: CrsBot): CrsBehaviour | undefined {
    const line = this.lineOf.get(bot.id);
    if (!line) {
      const own = this.unitBehaviours.get(bot.kind);
      if (own) return own;
      if (bot.kind === CrsKind.Bac) return BAC_BEHAVIOUR;
      if (bot.kind === CrsKind.BravM) return BRAVM_BEHAVIOUR;
      return this.behaviour;
    }
    let b = this.lineBehaviours.get(line);
    if (!b) {
      b = lineBehaviour(line, this.behaviour);
      this.lineBehaviours.set(line, b);
    }
    return b;
  }

  /** Remove the bot at `index`. `replace`: false for a bot that left on its own (#13), never replaced. */
  private remove(index: number, now: number, replace = true): void {
    const bot = this.bots[index]!;
    this.bots.splice(index, 1);
    this.byId.delete(bot.id);
    this.views.delete(bot.id);
    const inLine = this.lineOf.delete(bot.id);
    // Line members are not replaced: #12 sends new lines. Nor are other unit types (#13): the waves send them.
    if (replace && this.reinforceTo > 0 && !inLine && bot.kind === CrsKind.Crs) this.respawnAt.push(now + CRS_RESPAWN_DELAY);
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
    // Whole HP on the wire (a uint8): a bot protester's half-damage swing (#59) leaves a fraction server-side.
    const hp = Math.ceil(bot.hp - 1e-9);
    if (view.hp !== hp) view.hp = hp;
    if (view.status !== bot.status) view.status = bot.status;
    const down = isDown(bot.body);
    if (view.down !== down) view.down = down;
    const formation = this.lineOf.get(bot.id)?.formed === true && bot.status !== CrsStatus.Out;
    if (view.formation !== formation) view.formation = formation;
    // #15: the timers stay here; only whether each is on is synced.
    const splatted = isSplatted(bot, this.ctx.now);
    if (view.splatted !== splatted) view.splatted = splatted;
    const stinky = isStinky(bot, this.ctx.now);
    if (view.stinky !== stinky) view.stinky = stinky;
    // #13: the BAC's disguise and what a BRAV-M rides.
    if (view.revealed !== bot.revealed) view.revealed = bot.revealed;
    if (view.mount !== bot.mount) view.mount = bot.mount;
    // #70: the grab's tell; the target and the timer stay here.
    const windup = bot.windupId !== null;
    if (view.windup !== windup) view.windup = windup;
  }

  /** Mirror every bot now (after the room moved some, e.g. a member pushed back by a pinned protester). */
  syncViews(): void {
    for (const bot of this.bots) {
      const view = this.views.get(bot.id);
      if (view) this.mirror(bot, view);
    }
  }
}
