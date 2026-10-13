import { Room, type Client } from "@colyseus/core";
import {
  CRS_COUNT,
  ClientMessage,
  DEBUG_DAMAGE,
  MELEE_CRS_DAMAGE,
  MAX_PLAYERS,
  PROP_TYPES,
  RESCUE_CRS_IMPULSE,
  RESCUE_PROTESTER_IMPULSE,
  MELEE_PROP_DAMAGE,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  Phase,
  PlayerStatus,
  STREET_LEVEL,
  ServerMessage,
  THROWABLE_TYPES,
  TICK_RATE,
  ThrowableKind,
  aimDirection,
  dodgeDirection,
  dropSpots,
  isItemKind,
  pickRescueTarget,
  propShape,
  levelWorld,
  meleeHits,
  nameOrDefault,
  normalizeMove,
  pickHost,
  resolveCircle,
  respawnPoint,
  spawnPoint,
  type HitEvent,
  type ImpulseEvent,
  type InteractPayload,
  type KnockdownMode,
  type LobbyJoinOptions,
  type MoveInput,
  type Projectile,
  type ProjectileTarget,
  type PropSlot,
  type ThrowPayload,
  type CrsHitResult,
  type CrsHost,
  type ProtesterView,
  type SwingEvent,
  type Vec2,
} from "@manif/shared";
import { Bodies, DEBUG_KNOCKBACK_ENABLED, planDebugKnockback } from "../features/physics/index.js";
import { DEBUG_HEALTH_ENABLED, Healths, parseDebugHealth } from "../features/health/index.js";
import { MeleeCooldowns } from "../features/melee/index.js";
import { DodgeCooldowns } from "../features/dodge/index.js";
import { Player } from "../features/player/index.js";
import { Props } from "../features/prop/index.js";
import { CrsSquad } from "../features/crs/index.js";
import { Rescues } from "../features/rescue/index.js";
import { Throwables } from "../features/throwable/index.js";
import { StreetState } from "./state.js";

// The level is static shared data, imported by the client too. It is not synced.
const LEVEL = STREET_LEVEL;
/** What blocks a swing: the static walls and obstacles only, not props (#4). */
const SWING_OBSTACLES = levelWorld(LEVEL);
const NO_INPUT: MoveInput = { x: 0, z: 0 };

/**
 * One lobby, then one street. Created by `client.create()` and joined by code
 * with `client.joinById()`; it marks itself private so `joinOrCreate` never
 * drops strangers in. The room id is the lobby code.
 */
export class StreetRoom extends Room<{ state: StreetState }> {
  /** Latest move direction per session. Server-only, not synced. */
  private moveInputs = new Map<string, MoveInput>();
  /**
   * Breakable props (#4): HP per prop, synced as `state.props`. Owns this room's
   * collision world (static level + props in their current shape), which the
   * bodies step against, so a broken prop's new shape applies on the next tick.
   */
  private props = new Props(LEVEL);
  /** Velocity, down and immunity timers per session (#2). Server-only; only `down` is synced. */
  private bodies = new Bodies(this.props.world, PLAYER_RADIUS, PLAYER_SPEED);
  /** Last swing time per session (#4). Server-only, like moveInputs. */
  private meleeCooldowns = new MeleeCooldowns();
  /** Last dodge time per session (#9). Server-only; only `dodging` is synced. */
  private dodgeCooldowns = new DodgeCooldowns();
  /** HP, status and their timers per session (#3). Server-only; hp, status and stateLeft are synced. */
  private healths = new Healths();
  /** Who is holding interact and pulling which grabbed teammate (#10). Server-only; progress is synced on the grabbed player. */
  private rescues = new Rescues();
  /**
   * Room time in seconds: advances by the fixed dt each tick while playing.
   * Every health timer uses it (never Date.now()), so they pause with the sim.
   */
  private now = 0;

  override maxClients = MAX_PLAYERS;
  override state = new StreetState();

  /**
   * Police bots (#5): full bot state server-side, synced fields in `state.crs`.
   * They walk the same collision world as the protesters.
   */
  private crs = new CrsSquad(LEVEL, this.props.world, this.state.crs);
  /**
   * Throwables (#8): items on the ground and in flight, synced as
   * `state.items` and `state.projectiles`. The room applies what a hit does.
   */
  private throwables = new Throwables(this.state.items, this.state.projectiles);
  /** What the bots see of each protester, reused across ticks (see `crsHost`). */
  private protesterViews = new Map<string, ProtesterView>();
  /** The room as the bots see it: effects on protesters go through the same hooks as every other system. */
  private crsHost: CrsHost = {
    protesters: () => this.allProtesterViews(),
    protester: (id) => this.protesterView(id),
    canBeHurt: (id) => this.healths.canBeHurt(id, this.now),
    batonHit: (by, id, dirX, dirZ, amount, impulse) => {
      const swing: SwingEvent = { id: by };
      this.broadcast(ServerMessage.Swing, swing);
      this.damagePlayer(id, amount);
      this.applyImpulse(id, dirX, dirZ, impulse);
    },
    grab: (id, duration) => this.grabPlayer(id, duration),
    // Same transition as a rescue (#10): the protester is free again.
    release: (id) => {
      this.rescuePlayer(id);
    },
    drag: (id, x, z) => {
      const player = this.state.players.get(id);
      if (player) this.bodies.drag(id, player, x, z);
    },
  };

  /** Arrival order per session, for host hand-over. Server-only. */
  private joinOrder = new Map<string, number>();
  private joinCounter = 0;

  override messages = {
    // Input only: the client says where it wants to go, the server moves it.
    // Re-normalize so a tampered client can't move faster than PLAYER_SPEED.
    // Still recorded while knocked down or not free, so the held direction applies on getting up
    // or respawning; step() ignores it until then.
    [ClientMessage.Move]: (client: Client, message: unknown) => {
      if (this.state.phase !== Phase.Playing) return;
      const m = (message ?? {}) as Partial<MoveInput>;
      this.moveInputs.set(client.sessionId, normalizeMove(Number(m.x), Number(m.z)));
    },

    // Swing (#4). No payload is read: the server swings from its own position
    // and facing, and owns the cooldown, so a tampered client gains nothing.
    [ClientMessage.Attack]: (client: Client) => {
      if (this.state.phase !== Phase.Playing) return;
      this.attack(client);
    },

    // Dodge (#9). No payload: the server uses the held move direction (or the
    // facing) and owns the cooldown and the state checks.
    [ClientMessage.Dodge]: (client: Client) => {
      if (this.state.phase !== Phase.Playing) return;
      this.dodge(client.sessionId);
    },

    // Throw the carried item (#8) along the aim. Only a direction: the server
    // re-normalizes it, checks the thrower, and flies the projectile itself.
    [ClientMessage.Throw]: (client: Client, message: unknown) => {
      if (this.state.phase !== Phase.Playing) return;
      this.throwItem(client, message);
    },

    // Interact (E), on press and on release. No target: the server picks it (#10 rescue, else #8 pick-up).
    [ClientMessage.Interact]: (client: Client, message: unknown) => {
      if (this.state.phase !== Phase.Playing) return;
      const held = (message as Partial<InteractPayload> | null)?.held === true;
      this.interact(client.sessionId, held);
    },

    // Game rule: only the host starts, and only from the lobby.
    [ClientMessage.Start]: (client: Client) => {
      if (client.sessionId !== this.state.hostId || this.state.phase !== Phase.Lobby) return;
      this.startMarch();
    },

    // DEBUG (#2): dev-only knockback trigger, until CRS (#5) can be hit (melee #4 hits props only). Not registered in production.
    ...(DEBUG_KNOCKBACK_ENABLED && {
      [ClientMessage.DebugKnockback]: (client: Client, message: unknown) => {
        if (this.state.phase !== Phase.Playing) return;
        const self = this.state.players.get(client.sessionId);
        if (!self) return;
        const plan = planDebugKnockback(client.sessionId, self, this.state.players.entries(), message);
        if (plan) this.applyImpulse(plan.targetId, plan.dirX, plan.dirZ, plan.strength);
      },
    }),

    // DEBUG (#3): dev-only "hurt me" / "grab me", until CRS (#5) exist.
    ...(DEBUG_HEALTH_ENABLED && {
      [ClientMessage.DebugHealth]: (client: Client, message: unknown) => {
        if (this.state.phase !== Phase.Playing) return;
        const action = parseDebugHealth(message);
        if (action === "damage") this.damagePlayer(client.sessionId, DEBUG_DAMAGE);
        else if (action === "grab") this.grabPlayer(client.sessionId);
      },
    }),
  };

  override onCreate() {
    // Invite only: reachable by joinById(code), never by joinOrCreate/join.
    void this.setPrivate(true);
    this.props.reset(this.state.props);
    this.setFixedTimestep((ctx) => this.step(ctx.dt), TICK_RATE);
  }

  override onJoin(client: Client, options?: LobbyJoinOptions) {
    const player = new Player();
    player.name = nameOrDefault(options?.name);
    this.placeAtSpawn(client.sessionId, player);
    this.healths.reset(client.sessionId, player);
    this.state.players.set(client.sessionId, player);
    this.moveInputs.set(client.sessionId, { x: 0, z: 0 });
    this.joinOrder.set(client.sessionId, this.joinCounter++);
    // The creator is the first to join, so becomes host.
    if (!this.state.hostId) this.state.hostId = client.sessionId;
    // A late joiner while playing simply spawns in the street (at the rear once #12 exists).
    console.log(
      `[street ${this.roomId}] join ${client.sessionId} "${player.name}" (${this.clients.length}/${MAX_PLAYERS})`,
    );
  }

  override onLeave(client: Client) {
    // What they carried falls where they stood (#8).
    const leaving = this.state.players.get(client.sessionId);
    if (leaving && isItemKind(leaving.carrying)) this.throwables.drop(leaving.carrying, leaving.x, leaving.z);
    this.state.players.delete(client.sessionId);
    this.moveInputs.delete(client.sessionId);
    this.meleeCooldowns.remove(client.sessionId);
    this.dodgeCooldowns.remove(client.sessionId);
    // A rescue aimed at this player ends on the next tick (unknown target).
    this.rescues.remove(client.sessionId);
    this.bodies.remove(client.sessionId);
    // Systems that point at a player (a CRS grab #5) see unknown ids as no-ops.
    this.healths.remove(client.sessionId);
    this.protesterViews.delete(client.sessionId);
    this.joinOrder.delete(client.sessionId);
    if (this.state.hostId === client.sessionId) {
      this.state.hostId = pickHost(Array.from(this.joinOrder, ([id, joinedAt]) => ({ id, joinedAt })));
      if (this.state.hostId) console.log(`[street ${this.roomId}] host -> ${this.state.hostId}`);
    }
    console.log(`[street ${this.roomId}] leave ${client.sessionId}`);
  }

  /** Lobby -> street, everyone at once. #12 replaces this with the round lifecycle. */
  private startMarch() {
    this.state.players.forEach((player, sessionId) => {
      this.placeAtSpawn(sessionId, player);
      this.healths.reset(sessionId, player);
      player.rescue = 0;
      player.carrying = ThrowableKind.None;
      this.moveInputs.set(sessionId, { x: 0, z: 0 });
    });
    this.rescues.clear();
    this.props.reset(this.state.props);
    this.throwables.reset(LEVEL.items);
    this.crs.worldChanged();
    this.meleeCooldowns.clear();
    this.dodgeCooldowns.clear();
    // CRS (#5): the first wave on the level's spawn points, and replacements
    // for those taken out. #12 replaces this with waves that grow with progress.
    this.crs.clear();
    this.crs.reinforceTo = CRS_COUNT;
    this.crs.spawnAtStart(CRS_COUNT);
    this.state.phase = Phase.Playing;
    console.log(`[street ${this.roomId}] start (${this.state.players.size} players)`);
  }

  /** Random point in the start zone, already pushed clear of obstacles, facing the Préfecture. */
  private placeAtSpawn(sessionId: string, player: Player) {
    const spawn = spawnPoint(LEVEL, PLAYER_RADIUS);
    this.bodies.place(sessionId, player, spawn.x, spawn.z);
    player.rotation = Math.PI;
  }

  /**
   * Push a body (#2): the one call every hit uses (melee #4, batons #5, pavés
   * #8, thrown teammates #11). Below KNOCKDOWN_THRESHOLD it only pushes; at or
   * above it also knocks down, unless the body is already down or in get-up
   * immunity. Announced to every client with ServerMessage.Impulse.
   */
  applyImpulse(id: string, dirX: number, dirZ: number, strength: number, mode?: KnockdownMode) {
    const player = this.state.players.get(id);
    // Arrested protesters are in the van, out of reach.
    if (!player || player.status === PlayerStatus.Arrested) return null;
    const res = this.bodies.impulse(id, player, dirX, dirZ, strength, mode);
    if (!res || res.strength === 0) return res;
    const event: ImpulseEvent = { id, dirX: res.dirX, dirZ: res.dirZ, strength: res.strength, down: res.knockedDown };
    this.broadcast(ServerMessage.Impulse, event);
    return res;
  }

  /**
   * Hurt a protester (#3): the one call every damage source uses (melee #4,
   * baton #5, gas #7). Ignored while KO, arrested or just respawned; at 0 HP a
   * free protester goes KO, then is arrested. Returns true if it did anything.
   * Pair it with applyImpulse for the knockback.
   */
  damagePlayer(id: string, amount: number): boolean {
    const player = this.state.players.get(id);
    return player ? this.healths.damage(id, player, amount, this.now) : false;
  }

  /** A CRS grabs a free protester (#5); arrested when `duration` (default GRAB_DURATION) ends unless rescued. */
  grabPlayer(id: string, duration?: number): boolean {
    const player = this.state.players.get(id);
    return player ? this.healths.grab(id, player, this.now, duration) : false;
  }

  /**
   * A grabbed protester is free again (#10), with a short grab immunity: pulled
   * out by a teammate (see `pullFree`), or let go by a CRS that was stunned or
   * floored. Only the state change; the knockback is the caller's.
   */
  rescuePlayer(id: string): boolean {
    const player = this.state.players.get(id);
    return player ? this.healths.rescue(id, player, this.now) : false;
  }

  /** May act (attack #4, throw and pick up #8, dodge #9, rescue #10): free and not knocked down. */
  hasControl(id: string): boolean {
    return this.healths.canAct(id) && this.bodies.hasControl(id);
  }

  /**
   * One swing (#4). Only a protester with control (free, not knocked down)
   * swings, at most once per MELEE_COOLDOWN. The server picks the targets from
   * its own positions and facing: everything in the arc, in reach and not
   * behind a wall. A swing at nothing changes no state; it is still shown.
   */
  private attack(client: Client) {
    const id = client.sessionId;
    const player = this.state.players.get(id);
    if (!player || !this.hasControl(id)) return;
    if (!this.meleeCooldowns.tryStart(id, this.now)) return;

    // The swinger already played it locally.
    const swing: SwingEvent = { id };
    this.broadcast(ServerMessage.Swing, swing, { except: client });

    for (const hit of meleeHits(player, this.props.targets(), SWING_OBSTACLES)) {
      this.damageProp(id, hit.id, MELEE_PROP_DAMAGE, hit.point.x, hit.point.z);
    }
    // CRS (#5): pushed away from the swinger, every third quick hit knocks one
    // over, and at 0 HP it is out. A knocked-down or out CRS lets go of its grab
    // on its next tick: the other way to free a grabbed teammate (#10), with the
    // same grab immunity as a rescue (CrsHost.release -> rescuePlayer).
    for (const hit of meleeHits(player, this.crs.meleeTargets(), SWING_OBSTACLES)) {
      const res = this.crs.hit(hit.id, player.x, player.z, MELEE_CRS_DAMAGE, this.now);
      if (res) this.announceCrsHit(id, hit.id, res, hit.point.x, hit.point.z);
    }
  }

  /** A swing or a thrown item lands on a prop: HP off, the hit announced, and if it broke, its pavés dropped. */
  private damageProp(by: string, propId: string, amount: number, x: number, z: number) {
    const res = this.props.damage(propId, amount, this.state.props.get(propId));
    if (!res) return;
    const event: HitEvent = { by, kind: "prop", target: propId, x, z, broke: res.broke };
    this.broadcast(ServerMessage.Hit, event);
    if (res.broke) {
      this.dropPaves(res.slot);
      // The prop's new shape changes where bots can walk.
      this.crs.worldChanged();
    }
  }

  /** Tell everyone a CRS was hit (to flash it) and pushed (to tip it the right way). */
  private announceCrsHit(by: string, crsId: string, res: CrsHitResult, x: number, z: number) {
    const event: HitEvent = { by, kind: "crs", target: crsId, x, z, broke: res.out };
    this.broadcast(ServerMessage.Hit, event);
    const imp = res.impulse;
    if (imp.strength > 0) {
      const push: ImpulseEvent = { id: crsId, dirX: imp.dirX, dirZ: imp.dirZ, strength: imp.strength, down: imp.knockedDown };
      this.broadcast(ServerMessage.Impulse, push);
    }
  }

  /**
   * Throw the carried item (#8). Only a protester with control (free, not
   * knocked down) and something in hand throws. The aim is re-normalized; a
   * zero aim throws along the facing. The projectile starts at the server's
   * own copy of the thrower's position, and the thrower turns to face the throw.
   */
  private throwItem(client: Client, message: unknown) {
    const id = client.sessionId;
    const player = this.state.players.get(id);
    if (!player || !this.hasControl(id) || !isItemKind(player.carrying)) return;
    const m = (message ?? {}) as Partial<ThrowPayload>;
    const dir = aimDirection(Number(m.x), Number(m.z), player.rotation);
    if (!this.throwables.launch(id, player.carrying, player.x, player.z, dir.x, dir.z)) return;
    player.carrying = ThrowableKind.None;
    player.rotation = Math.atan2(dir.x, dir.z);
    // The thrower already played the arm swing locally.
    const swing: SwingEvent = { id };
    this.broadcast(ServerMessage.Swing, swing, { except: client });
  }

  /** A thrown item stopped on a prop or a CRS (#8): the row in THROWABLE_TYPES says what it does. */
  private projectileHit(p: Projectile, target: ProjectileTarget<"prop" | "crs">) {
    const type = THROWABLE_TYPES[p.kind];
    if (target.kind === "prop") {
      this.damageProp(p.by, target.id, type.propDamage, p.x, p.z);
      return;
    }
    // Damage, knockback along the throw (a heavy one floors it) and a stun: a
    // grabbing CRS lets go on its next tick, with the rescue's grab immunity.
    const res = this.crs.strike(target.id, p.dirX, p.dirZ, type.crsDamage, type.knockback, type.stun, this.now);
    if (res) this.announceCrsHit(p.by, target.id, res, p.x, p.z);
  }

  /** What a projectile can hit this tick: intact props and every CRS not out. Protesters never (no friendly fire). */
  private projectileTargets(): ProjectileTarget<"prop" | "crs">[] {
    const out: ProjectileTarget<"prop" | "crs">[] = [];
    for (const t of this.props.targets()) out.push({ id: t.id, kind: "prop", shape: t.shape });
    for (const t of this.crs.meleeTargets()) out.push({ id: t.id, kind: "crs", shape: t.shape });
    return out;
  }

  /**
   * One dodge (#9): a short burst at DODGE_SPEED_FACTOR times walking speed,
   * along the held move direction or the facing. Only a protester with control
   * (free, not knocked down) dodges, at most once per DODGE_COOLDOWN, counted
   * from the start of the last one. A grabbed protester cannot dodge out of the
   * grab: only a rescue (#10) frees them. Returns true if the dodge started.
   */
  dodge(id: string): boolean {
    const player = this.state.players.get(id);
    if (!player || !this.hasControl(id)) return false;
    if (!this.dodgeCooldowns.ready(id, this.now)) return false;
    const dir = dodgeDirection(this.moveInputs.get(id) ?? NO_INPUT, player.rotation);
    if (!this.bodies.dodge(id, player, dir.x, dir.z)) return false;
    this.dodgeCooldowns.start(id, this.now);
    return true;
  }

  /**
   * Interact key (E) pressed or released. On a press, a grabbed teammate in
   * RESCUE_RANGE has priority (#10): the press starts holding, and the rescue
   * itself runs in `step` for as long as the key stays down. Otherwise (#8)
   * the press picks up the nearest item within PICKUP_RANGE, empty-handed
   * and with control only.
   * Holding is recorded even with nobody in range, so pressing E and then
   * walking up to a grabbed teammate works too.
   */
  interact(id: string, held: boolean) {
    const player = this.state.players.get(id);
    if (!player) return;
    this.rescues.hold(id, held);
    if (!held || player.carrying !== ThrowableKind.None || !this.hasControl(id)) return;
    const self = this.protesterView(id);
    if (!self || pickRescueTarget(self, this.allProtesterViews()) !== null) return;
    const kind = this.throwables.pickUp(player, player.carrying);
    if (kind !== ThrowableKind.None) player.carrying = kind;
  }

  /**
   * A teammate's rescue finished (#10): the protester is free, the CRS holding
   * them is knocked over (so it lets go and lies there a moment) and the
   * protester stumbles away from it. False if they were no longer grabbed.
   */
  private pullFree(targetId: string): boolean {
    const holder = this.crs.holderOf(targetId);
    if (!this.rescuePlayer(targetId)) return false;
    const player = this.state.players.get(targetId);
    const bot = holder === null ? undefined : this.crs.get(holder);
    if (!player || !bot || holder === null) return true;
    let dx = bot.body.x - player.x;
    let dz = bot.body.z - player.z;
    if (Math.hypot(dx, dz) < 1e-6) {
      dx = Math.sin(bot.rotation);
      dz = Math.cos(bot.rotation);
    }
    const res = this.crs.push(holder, dx, dz, RESCUE_CRS_IMPULSE);
    if (res && res.strength > 0) {
      const push: ImpulseEvent = { id: holder, dirX: res.dirX, dirZ: res.dirZ, strength: res.strength, down: res.knockedDown };
      this.broadcast(ServerMessage.Impulse, push);
    }
    this.applyImpulse(targetId, -dx, -dz, RESCUE_PROTESTER_IMPULSE);
    return true;
  }

  /**
   * A prop just broke: it drops PROP_TYPES[kind].paves pavés (#4, #8) on its
   * street side, clear of its broken shape and everything else.
   */
  private dropPaves(slot: PropSlot) {
    const count = PROP_TYPES[slot.kind].paves;
    const shape = propShape(slot, false);
    if (count <= 0 || !shape) return;
    for (const spot of dropSpots(shape, count, this.props.world)) this.throwables.drop(ThrowableKind.Pave, spot.x, spot.z);
  }

  /**
   * One fixed tick. Order matters and is fixed here:
   * 1. Rescues (#10) are applied before step 2, so a rescue landing on the
   *    last tick of a drag wins over the arrest (locked by the tests in
   *    packages/shared/src/rescue/rescue.test.ts).
   * 2. Protesters: health timers (a drag that ends becomes an arrest), then
   *    movement. One no longer free drops what they carry (#8).
   * 3. Thrown items (#8) fly, after the protesters moved and before the CRS,
   *    so a stunned bot lets go on this very tick.
   * 4. CRS (#5): think, move, hit, grab, drag. A bot whose protester was just
   *    arrested, rescued or disconnected goes back to work here.
   */
  private step(dt: number) {
    if (this.state.phase !== Phase.Playing) return;
    this.now += dt;
    this.rescues.step(
      dt,
      (id) => this.protesterView(id),
      () => this.allProtesterViews(),
      (id) => this.hasControl(id),
      (targetId) => this.pullFree(targetId),
    );
    this.state.players.forEach((player, sessionId) => {
      if (this.healths.tick(sessionId, player, this.now) === "respawned") this.placeAtRear(sessionId, player);
      // Grabbed, KO or arrested: the item in hand falls where they are (#8).
      if (player.carrying !== ThrowableKind.None) this.throwables.release(player);
      // The ring over a grabbed protester (#10); 0 once free, arrested or gone.
      const rescue = player.status === PlayerStatus.Grabbed ? this.rescues.percent(sessionId) : 0;
      if (player.rescue !== rescue) player.rescue = rescue;
      // Only free protesters walk; the others keep their knockback slide (a KO'd body still flies).
      const free = this.healths.canMove(sessionId);
      // Grabbed or KO mid-dodge (#9): the burst stops at once.
      if (!free && player.dodging) this.bodies.endDodge(sessionId, player);
      const input = free ? (this.moveInputs.get(sessionId) ?? NO_INPUT) : NO_INPUT;
      // Walk (or dodge) from the held input (ignored while down) plus knockback
      // velocity, collided against the street (sub-stepped, bounces off walls).
      const res = this.bodies.step(sessionId, player, input, dt);
      // A head-on dodge into a wall or prop bonks (#9): tip the avatar backwards like a hit.
      if (res?.bonk) {
        const event: ImpulseEvent = { id: sessionId, dirX: res.bonk.x, dirZ: res.bonk.z, strength: res.bonk.speed, down: player.down };
        this.broadcast(ServerMessage.Impulse, event);
      }
    });
    this.throwables.step(
      dt,
      this.props.world,
      () => this.projectileTargets(),
      (p, target) => this.projectileHit(p, target),
    );
    this.crs.step(this.now, dt, this.crsHost, () => this.freeProtesterPositions());
  }

  /** The bots' view of one protester, refreshed from the synced state (no allocation once seen). */
  private protesterView(id: string): ProtesterView | undefined {
    const player = this.state.players.get(id);
    if (!player) {
      this.protesterViews.delete(id);
      return undefined;
    }
    let view = this.protesterViews.get(id);
    if (!view) {
      view = { id, x: 0, z: 0, status: PlayerStatus.Free, down: false };
      this.protesterViews.set(id, view);
    }
    view.x = player.x;
    view.z = player.z;
    view.status = player.status;
    view.down = player.down;
    return view;
  }

  private *allProtesterViews(): Generator<ProtesterView> {
    for (const id of this.state.players.keys()) {
      const view = this.protesterView(id);
      if (view) yield view;
    }
  }

  /** Free protesters' positions, so replacement CRS don't spawn on top of anyone. */
  private freeProtesterPositions(): Vec2[] {
    const out: Vec2[] = [];
    this.state.players.forEach((p) => {
      if (p.status === PlayerStatus.Free) out.push({ x: p.x, z: p.z });
    });
    return out;
  }

  /** Respawn at the rear of the cortège: behind the rearmost free protester, clear of obstacles (#3). */
  private placeAtRear(sessionId: string, player: Player) {
    const free: Vec2[] = [];
    this.state.players.forEach((other, id) => {
      if (id !== sessionId && other.status === PlayerStatus.Free) free.push({ x: other.x, z: other.z });
    });
    const spot = respawnPoint(LEVEL, PLAYER_RADIUS, free);
    // respawnPoint knows the static level only: also step clear of intact props.
    const p = resolveCircle(this.props.world, spot.x, spot.z, PLAYER_RADIUS);
    this.bodies.place(sessionId, player, p.x, p.z);
    player.rotation = Math.PI;
  }
}
