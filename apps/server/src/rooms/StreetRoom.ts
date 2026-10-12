import { Room, type Client } from "@colyseus/core";
import {
  CRS_COUNT,
  ClientMessage,
  DEBUG_DAMAGE,
  MELEE_CRS_DAMAGE,
  MAX_PLAYERS,
  PROP_TYPES,
  MELEE_PROP_DAMAGE,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  Phase,
  PlayerStatus,
  STREET_LEVEL,
  ServerMessage,
  TICK_RATE,
  dodgeDirection,
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
  type KnockdownMode,
  type LobbyJoinOptions,
  type MoveInput,
  type PropSlot,
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
    this.state.players.delete(client.sessionId);
    this.moveInputs.delete(client.sessionId);
    this.meleeCooldowns.remove(client.sessionId);
    this.dodgeCooldowns.remove(client.sessionId);
    this.bodies.remove(client.sessionId);
    // Systems that point at a player (a CRS grab #5, a rescue #10) see unknown ids as no-ops.
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
      this.moveInputs.set(sessionId, { x: 0, z: 0 });
    });
    this.props.reset(this.state.props);
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

  /** A teammate frees a grabbed protester (#10). */
  rescuePlayer(id: string): boolean {
    const player = this.state.players.get(id);
    return player ? this.healths.rescue(id, player, this.now) : false;
  }

  /** May act (attack #4, throw #8, dodge #9, rescue #10): free and not knocked down. */
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
      const res = this.props.damage(hit.id, MELEE_PROP_DAMAGE, this.state.props.get(hit.id));
      if (!res) continue;
      const event: HitEvent = { by: id, kind: "prop", target: hit.id, x: hit.point.x, z: hit.point.z, broke: res.broke };
      this.broadcast(ServerMessage.Hit, event);
      if (res.broke) {
        this.dropPaves(res.slot);
        // The prop's new shape changes where bots can walk.
        this.crs.worldChanged();
      }
    }
    // CRS (#5): pushed away from the swinger, every third quick hit knocks one
    // over, and at 0 HP it is out. A knocked-down or out CRS lets go of its grab
    // on its next tick. #10 (rescue) adds its own handling for grabbing CRS here.
    for (const hit of meleeHits(player, this.crs.meleeTargets(), SWING_OBSTACLES)) {
      const res = this.crs.hit(hit.id, player.x, player.z, MELEE_CRS_DAMAGE, this.now);
      if (!res) continue;
      const event: HitEvent = { by: id, kind: "crs", target: hit.id, x: hit.point.x, z: hit.point.z, broke: res.out };
      this.broadcast(ServerMessage.Hit, event);
      const imp = res.impulse;
      if (imp.strength > 0) {
        const push: ImpulseEvent = { id: hit.id, dirX: imp.dirX, dirZ: imp.dirZ, strength: imp.strength, down: imp.knockedDown };
        this.broadcast(ServerMessage.Impulse, push);
      }
    }
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
   * A prop just broke: it drops PROP_TYPES[kind].paves pavés (#4). Hook for #8,
   * which owns pavés as ground items and their pickup: spawn them here.
   */
  private dropPaves(slot: PropSlot) {
    const count = PROP_TYPES[slot.kind].paves;
    console.log(`[street ${this.roomId}] ${slot.id} broke (${count} pavé(s) to drop, #8)`);
  }

  /**
   * One fixed tick. Order matters and is fixed here:
   * 1. Rescues (#10) must be applied before step 2, so a rescue landing on the
   *    last tick of a drag wins over the arrest.
   * 2. Protesters: health timers (a drag that ends becomes an arrest), then movement.
   * 3. CRS (#5): think, move, hit, grab, drag. A bot whose protester was just
   *    arrested, rescued or disconnected goes back to work here.
   */
  private step(dt: number) {
    if (this.state.phase !== Phase.Playing) return;
    this.now += dt;
    this.state.players.forEach((player, sessionId) => {
      if (this.healths.tick(sessionId, player, this.now) === "respawned") this.placeAtRear(sessionId, player);
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
