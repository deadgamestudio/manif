import { Room, type Client } from "@colyseus/core";
import {
  CARRY_DROP_PUSH,
  CARRY_SPEED_FACTOR,
  CRS_BURN_DAMAGE,
  CRS_BURN_DAMAGE_INTERVAL,
  CRS_SPAWN_CLEARANCE,
  ClientMessage,
  DEBUG_DAMAGE,
  MELEE_CRS_DAMAGE,
  MAX_PLAYERS,
  PROP_TYPES,
  RESCUE_CRS_IMPULSE,
  RESCUE_PROTESTER_IMPULSE,
  RESCUE_TIME,
  MELEE_PROP_DAMAGE,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  Phase,
  SLIP_IMPULSE,
  SlipGuards,
  carrySpeedOf,
  isAirborne,
  isDown,
  isImmune,
  type SlipBody,
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
  ROUND_WAVES,
  RoundResult,
  CrsKind,
  WAVE_BRAVM_AHEAD,
  crsRadius,
  disguiseName,
  unitStageAt,
  clearSpawnPoint,
  createRound,
  frontProgress,
  roundOutcome,
  startRound,
  stepRound,
  syncedProgress,
  syncedSeconds,
  waveChaserPoints,
  waveLinePoint,
  wavesDue,
  pickFireAction,
  CrsStatus,
  PICKUP_RANGE,
  TEAMMATE_CRS_DAMAGE,
  TEAMMATE_CRS_KNOCKBACK,
  TEAMMATE_CRS_STUN,
  TEAMMATE_PROP_DAMAGE,
  TEAMMATE_REBOUND,
  carryDropReason,
  dropDirection,
  flightContacts,
  nearestItem,
  pickCarryTarget,
  pickInteract,
  teammateLaunch,
  type CarrySubject,
  type InteractChoice,
  type BurningView,
  type FireAction,
  type LightableView,
  type RoundEndEvent,
  type RoundWave,
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
  type ShoveEvent,
  type SwingEvent,
  type CollisionWorld,
  type CircleShape,
  type Vec2,
  DODGE_COOLDOWN,
  GRAB_DURATION,
  archetypeOf,
  archetypeStats,
  canPickArchetype,
  filmFactor,
  propDamageOf,
  spreadAim,
  type ArchetypeStats,
  type AuraSubject,
  type PickArchetypePayload,
  RENAME_COOLDOWN_MS,
  checkRename,
  renameAllowedAt,
  type RenamePayload,
  type RenameRefusedEvent,
} from "@manif/shared";
import { Bodies, DEBUG_KNOCKBACK_ENABLED, planDebugKnockback } from "../features/physics/index.js";
import { DEBUG_HEALTH_ENABLED, Healths, parseDebugHealth } from "../features/health/index.js";
import { MeleeCooldowns } from "../features/melee/index.js";
import { DodgeCooldowns } from "../features/dodge/index.js";
import { JumpCooldowns } from "../features/jump/index.js";
import { Player } from "../features/player/index.js";
import { Props } from "../features/prop/index.js";
import { CrsSquad } from "../features/crs/index.js";
import { Rescues } from "../features/rescue/index.js";
import { Throwables } from "../features/throwable/index.js";
import { Gas } from "../features/gas/index.js";
import { Fires } from "../features/fire/index.js";
import { Carries } from "../features/carry/index.js";
import { FireBrigade, type BrigadeHost, type HoseTarget } from "../features/pompier/index.js";
import { DEBUG_ROUND_ENABLED, RoundStats, parseDebugRound } from "../features/round/index.js";
import { HealAuras } from "../features/archetype/index.js";
import { StreetState } from "./state.js";

// The level is static shared data, imported by the client too. It is not synced.
const LEVEL = STREET_LEVEL;
/** What blocks a swing: the static walls and obstacles only, not props (#4). */
const SWING_OBSTACLES = levelWorld(LEVEL);
const NO_INPUT: MoveInput = { x: 0, z: 0 };
/** The props that can ever burn (#16), with their shape: what a held interact may light. */
const FLAMMABLE: readonly LightableView[] = LEVEL.propSlots.flatMap((slot) => {
  const shape = PROP_TYPES[slot.kind].flammable ? propShape(slot, false) : null;
  return shape ? [{ id: slot.id, shape }] : [];
});

/**
 * One lobby and its street, round after round (#12): `waiting` (the lobby
 * screen) -> host starts -> `marching` -> win or lose -> `ended` (results) ->
 * the street is reset -> `waiting` again. Created by `client.create()` and joined by code
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
  /** Last hop time per session (#45). Server-only; only `airborne` is synced. */
  private jumpCooldowns = new JumpCooldowns();
  /** HP, status and their timers per session (#3). Server-only; hp, status and stateLeft are synced. */
  private healths = new Healths();
  /** Who is holding interact and pulling which grabbed teammate (#10). Server-only; progress is synced on the grabbed player. */
  private rescues = new Rescues();
  /**
   * Room time in seconds: advances by the fixed dt each tick while playing.
   * Every health timer uses it (never Date.now()), so they pause with the sim.
   */
  private now = 0;
  /**
   * The round (#12): phase, timers, result and which waves fired. Pure state
   * stepped by `stepRound`; phase, whole seconds and result are mirrored into Schema.
   */
  private round = createRound();
  /** Per-player numbers for the end screen (#12). Server-only, sent once at the end. */
  private roundStats = new RoundStats();
  /** The cortège's front this round, 0..1 (the last value while nobody is free). Synced as `state.progress`. */
  private front = 0;
  /** DEBUG (#12, dev only): this round cannot end. Cleared by the next start. */
  private roundHeld = false;

  override maxClients = MAX_PLAYERS;
  override state = new StreetState();

  /**
   * Police bots (#5): full bot state server-side, synced fields in `state.crs`.
   * They walk the same collision world as the protesters.
   */
  private crs = new CrsSquad(LEVEL, this.props.world, this.state.crs, undefined, (id, res) => {
    // Riders knocked off a bike, the wreck skidding away (#13): every client tips them the right way.
    if (res.strength === 0) return;
    const event: ImpulseEvent = { id, dirX: res.dirX, dirZ: res.dirZ, strength: res.strength, down: res.knockedDown };
    this.broadcast(ServerMessage.Impulse, event);
  });
  /**
   * Throwables (#8): items on the ground and in flight, synced as
   * `state.items` and `state.projectiles`. The room applies what a hit does.
   */
  private throwables = new Throwables(this.state.items, this.state.projectiles);
  /**
   * Tear gas (#7): canisters and clouds, synced as `state.canisters` and
   * `state.gas`, and who is coughing. The room applies the damage and the slow.
   */
  private gas = new Gas(this.state.gas, this.state.canisters);
  /**
   * Fire (#16): burning props synced as `state.fires`, who is on fire (players
   * and CRS, `onFire`) and who holds interact to light or pat out. The room
   * applies the damage, the panic speed and the props' HP.
   */
  private fires = new Fires(LEVEL.propSlots, this.state.fires);
  /** Who carries whom, and the teammates in a throw's flight (#11). Server-only; `carriedBy` is synced on the carried player. */
  private carry = new Carries();
  /**
   * Pompiers (#17): fire trucks synced as `state.trucks`; their crews are bots
   * in the CRS squad (`CrsKind.Pompier`), so they count towards MAX_CRS.
   * The room applies what their water does.
   */
  private brigade = new FireBrigade(LEVEL, this.crs, this.props.world, SWING_OBSTACLES, this.state.trucks);
  /** Scratch for the hose (#17), reused every tick. */
  private hoseTargets: HoseTarget[] = [];
  /** The room as the brigade sees it (#17). */
  private brigadeHost: BrigadeHost = {
    fires: () => this.fires.burning(),
    protesters: () => {
      const out = this.hoseTargets;
      out.length = 0;
      this.state.players.forEach((p, id) => {
        if (p.status !== PlayerStatus.Arrested) out.push({ id, x: p.x, z: p.z, onFire: p.onFire });
      });
      return out;
    },
    pushProtester: (id, dirX, dirZ, strength) => {
      const res = this.applyImpulse(id, dirX, dirZ, strength);
      if (res && res.strength > 0) this.roundStats.add(id, "hosed");
    },
    pushBot: (id, dirX, dirZ, strength) => {
      const res = this.crs.push(id, dirX, dirZ, strength);
      if (res && res.strength > 0) {
        const event: ImpulseEvent = { id, dirX: res.dirX, dirZ: res.dirZ, strength: res.strength, down: res.knockedDown };
        this.broadcast(ServerMessage.Impulse, event);
      }
    },
    extinguish: (id) => this.extinguishProp(id),
    putOutBody: (id) => this.putOutBody(id),
    log: (message) => console.log(`[street ${this.roomId}] ${message}`),
  };
  /** Who last slipped on which dog poo (#15), so getting up on one doesn't floor you again. Server-only. */
  private slips = new SlipGuards();
  /** Scratch for the slip checks (#15), reused every tick. */
  private slipBody: SlipBody = { x: 0, z: 0, airborne: false, down: false, immune: false };
  /** Scratch for the fire actions (#16), reused every tick. */
  private burningViews: BurningView[] = [];
  private lightable: LightableView[] = [];
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
      // A hop (#45) dodges the baton: airborne when the swing resolves (after
      // this tick's protester step), the swing is seen but does nothing. The
      // bot's baton cooldown is spent all the same. A grab still lands.
      if (this.bodies.isAirborne(id)) return;
      this.damagePlayer(id, amount);
      this.applyImpulse(id, dirX, dirZ, impulse);
    },
    // Splatted (#15): the swing is seen, and hits nothing.
    batonMiss: (by) => {
      const swing: SwingEvent = { id: by };
      this.broadcast(ServerMessage.Swing, swing);
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
    // A shield line's shove (#6): knockback away from the line, no damage. Only the
    // last of several shoves in a row floors (the others never do, whatever the strength).
    shove: (_by, id, dirX, dirZ, strength, floor) => {
      this.applyImpulse(id, dirX, dirZ, strength, floor ? "always" : "never");
    },
    // Tear gas (#7): the bot picked the spot from the room's own positions; the room caps clouds and throws.
    throwGas: (by, from, to) => {
      if (!this.gas.launch(by, from, to, this.now)) return false;
      const swing: SwingEvent = { id: by };
      this.broadcast(ServerMessage.Swing, swing);
      return true;
    },
  };
  /**
   * What protesters step against (#6): the room's world plus the raised
   * shields of CRS lines as circles. Rebuilt each tick, only when a line is up.
   */
  private crowdWorld: { -readonly [K in keyof CollisionWorld]: CollisionWorld[K] } = { ...this.props.world };
  private crowdCircles: CircleShape[] = [];

  /** The CGT's heal aura (#14): the fraction of an HP each protester is owed. Server-only. */
  private heals = new HealAuras();
  /** Scratch for the heal aura (#14), reused every tick. */
  private auraHealers: AuraSubject[] = [];
  private auraTargets: AuraSubject[] = [];

  /** Arrival order per session, for host hand-over. Server-only. */
  private joinOrder = new Map<string, number>();
  private joinCounter = 0;
  /** When each player's last rename was processed (#61), wall-clock ms, for the rate limit. Server-only. */
  private lastRename = new Map<string, number>();

  override messages = {
    // Input only: the client says where it wants to go, the server moves it.
    // Re-normalize so a tampered client can't move faster than PLAYER_SPEED.
    // Still recorded while knocked down or not free, so the held direction applies on getting up
    // or respawning; step() ignores it until then.
    [ClientMessage.Move]: (client: Client, message: unknown) => {
      if (this.state.phase !== Phase.Marching) return;
      const m = (message ?? {}) as Partial<MoveInput>;
      this.moveInputs.set(client.sessionId, normalizeMove(Number(m.x), Number(m.z)));
    },

    // Swing (#4). No payload is read: the server swings from its own position
    // and facing, and owns the cooldown, so a tampered client gains nothing.
    [ClientMessage.Attack]: (client: Client) => {
      if (this.state.phase !== Phase.Marching) return;
      this.attack(client);
    },

    // Dodge (#9). No payload: the server uses the held move direction (or the
    // facing) and owns the cooldown and the state checks.
    [ClientMessage.Dodge]: (client: Client) => {
      if (this.state.phase !== Phase.Marching) return;
      this.dodge(client.sessionId);
    },

    // Hop (#45). No payload: the server owns the cooldown and the state checks.
    // An old cached client never sends it (Space still hits there): nothing breaks.
    [ClientMessage.Jump]: (client: Client) => {
      if (this.state.phase !== Phase.Marching) return;
      this.jump(client.sessionId);
    },

    // Throw the carried item (#8), or the carried teammate (#11), along the aim. Only a
    // direction: the server re-normalizes it, checks the thrower, and flies the throw itself.
    [ClientMessage.Throw]: (client: Client, message: unknown) => {
      if (this.state.phase !== Phase.Marching) return;
      this.throwItem(client, message);
    },

    // Interact (E), on press and on release. No target: the server picks it (see `interact`).
    [ClientMessage.Interact]: (client: Client, message: unknown) => {
      if (this.state.phase !== Phase.Marching) return;
      const held = (message as Partial<InteractPayload> | null)?.held === true;
      this.interact(client.sessionId, held);
    },

    // Archetype pick (#14): only the id, only in the lobby. Locked from the start of the march
    // until the street is back to `waiting`; an unknown id picks the default. Duplicates are fine.
    [ClientMessage.PickArchetype]: (client: Client, message: unknown) => {
      if (!canPickArchetype(this.state.phase)) return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const archetype = archetypeOf((message as Partial<PickArchetypePayload> | null)?.archetype);
      if (player.archetype === archetype) return;
      player.archetype = archetype;
      // Its max HP at once; the start of the march resets everyone again anyway.
      this.healths.reset(client.sessionId, player, archetypeStats(archetype).maxHp);
      console.log(`[street ${this.roomId}] ${client.sessionId} picks archetype ${archetype}`);
    },

    // Rename (#61): lobby only, one per RENAME_COOLDOWN_MS per player (extra messages dropped),
    // cleaned and checked against everyone else's name by the shared rule. Empty or taken: the
    // sender alone hears why, the name stays. Host and join order are untouched.
    [ClientMessage.Rename]: (client: Client, message: unknown) => {
      if (this.state.phase !== Phase.Waiting) return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const now = Date.now();
      if (!renameAllowedAt(now, this.lastRename.get(client.sessionId), RENAME_COOLDOWN_MS)) return;
      this.lastRename.set(client.sessionId, now);
      const raw = (message as Partial<RenamePayload> | null)?.name;
      const players = Array.from(this.state.players.entries(), ([id, p]) => ({ id, name: p.name }));
      const check = checkRename(raw, this.state.phase, client.sessionId, players);
      if (check.ok) {
        console.log(`[street ${this.roomId}] ${client.sessionId} renames "${player.name}" -> "${check.name}"`);
        player.name = check.name;
      } else if (check.reason === "empty" || check.reason === "taken") {
        const refused: RenameRefusedEvent = { reason: check.reason };
        client.send(ServerMessage.RenameRefused, refused);
      }
    },

    // Game rule: only the host starts, and only from `waiting` (the lobby screen).
    [ClientMessage.Start]: (client: Client) => {
      if (client.sessionId !== this.state.hostId || this.state.phase !== Phase.Waiting) return;
      this.startMarch();
    },

    // DEBUG (#2): dev-only knockback trigger, until CRS (#5) can be hit (melee #4 hits props only). Not registered in production.
    ...(DEBUG_KNOCKBACK_ENABLED && {
      [ClientMessage.DebugKnockback]: (client: Client, message: unknown) => {
        if (this.state.phase !== Phase.Marching) return;
        const self = this.state.players.get(client.sessionId);
        if (!self) return;
        const plan = planDebugKnockback(client.sessionId, self, this.state.players.entries(), message);
        if (plan) this.applyImpulse(plan.targetId, plan.dirX, plan.dirZ, plan.strength);
      },
    }),

    // DEBUG (#3): dev-only "hurt me" / "grab me", until CRS (#5) exist.
    ...(DEBUG_HEALTH_ENABLED && {
      [ClientMessage.DebugHealth]: (client: Client, message: unknown) => {
        if (this.state.phase !== Phase.Marching) return;
        const action = parseDebugHealth(message);
        if (action === "damage") this.damagePlayer(client.sessionId, DEBUG_DAMAGE);
        else if (action === "grab") this.grabPlayer(client.sessionId);
      },
    }),

    // DEBUG (#12): dev-only jump down the street or round timer cut, to test waves, the win and the timeout.
    ...(DEBUG_ROUND_ENABLED && {
      [ClientMessage.DebugRound]: (client: Client, message: unknown) => {
        if (this.state.phase !== Phase.Marching) return;
        const cmd = parseDebugRound(message);
        if (cmd?.action === "time") this.round.timeLeft = cmd.seconds;
        else if (cmd?.action === "teleport") this.debugTeleport(client.sessionId, cmd.progress);
        else if (cmd?.action === "hold") this.roundHeld = true;
        // #13: no bots on the street, but the waves still to come still come (unlike `calm`).
        else if (cmd?.action === "clear") {
          this.crs.clear();
          this.brigade.clear();
        } else if (cmd?.action === "calm") {
          this.crs.clear();
          this.brigade.clear();
          this.round.fired = ROUND_WAVES.map(() => true);
        } else if (cmd?.action === "fallen") {
          const self = this.state.players.get(client.sessionId);
          if (self) {
            const d = cmd.distance;
            this.crs.spawnFallen(self.x + Math.sin(self.rotation) * d, self.z + Math.cos(self.rotation) * d, this.now, cmd.seconds);
          }
        } else if (cmd?.action === "crs") {
          const self = this.state.players.get(client.sessionId);
          if (self) {
            const d = cmd.distance;
            const x = self.x + Math.sin(self.rotation) * d;
            const z = self.z + Math.cos(self.rotation) * d;
            // #13: any unit type; a BAC with its disguise (and a set blend time, for scripted tests).
            if (cmd.kind === CrsKind.Bac) this.crs.spawnBac(x, z, this.pickDisguiseName(), cmd.blend);
            else if (cmd.kind === CrsKind.BravM) this.crs.spawnBravm(x, z);
            // #17: pompiers come off a truck, never on their own.
            else if (cmd.kind === CrsKind.Pompier) return;
            else this.crs.spawn(x, z);
          }
        } else if (cmd?.action === "water") {
          const self = this.state.players.get(client.sessionId);
          if (self) this.extinguishAt(self.x, self.z, cmd.radius);
        } else if (cmd?.action === "brigade") this.brigade.tune(cmd);
      },
    }),
  };

  override onCreate() {
    // Invite only: reachable by joinById(code), never by joinOrCreate/join.
    void this.setPrivate(true);
    // A fresh room looks exactly like the street after a reset (#12).
    this.resetStreet();
    this.setFixedTimestep((ctx) => this.step(ctx.dt), TICK_RATE);
  }

  override onJoin(client: Client, options?: LobbyJoinOptions) {
    const player = new Player();
    player.name = nameOrDefault(options?.name);
    this.healths.reset(client.sessionId, player);
    this.state.players.set(client.sessionId, player);
    // Mid-round (#12): a fresh protester at the rear of the cortège; it counts
    // towards the win threshold from now on. Before a round: the start zone.
    if (this.state.phase === Phase.Waiting) this.placeAtSpawn(client.sessionId, player);
    else this.placeAtRear(client.sessionId, player);
    this.moveInputs.set(client.sessionId, { x: 0, z: 0 });
    this.joinOrder.set(client.sessionId, this.joinCounter++);
    // The creator is the first to join, so becomes host.
    if (!this.state.hostId) this.state.hostId = client.sessionId;
    console.log(
      `[street ${this.roomId}] join ${client.sessionId} "${player.name}" (${this.clients.length}/${MAX_PLAYERS})`,
    );
  }

  override onLeave(client: Client) {
    // What they carried falls where they stood (#8); so does a carried teammate (#11).
    const leaving = this.state.players.get(client.sessionId);
    if (leaving && isItemKind(leaving.carrying)) this.throwables.drop(leaving.carrying, leaving.x, leaving.z);
    this.endCarry(client.sessionId);
    // Mid-flight (#11): the flight goes with the body; nothing else points at it.
    this.carry.remove(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.moveInputs.delete(client.sessionId);
    this.meleeCooldowns.remove(client.sessionId);
    this.dodgeCooldowns.remove(client.sessionId);
    this.jumpCooldowns.remove(client.sessionId);
    // A rescue aimed at this player ends on the next tick (unknown target).
    this.rescues.remove(client.sessionId);
    this.bodies.remove(client.sessionId);
    // Systems that point at a player (a CRS grab #5) see unknown ids as no-ops.
    this.healths.remove(client.sessionId);
    this.gas.remove(client.sessionId);
    this.fires.remove(client.sessionId);
    this.protesterViews.delete(client.sessionId);
    this.joinOrder.delete(client.sessionId);
    this.lastRename.delete(client.sessionId);
    this.heals.remove(client.sessionId);
    this.roundStats.remove(client.sessionId);
    this.slips.remove(client.sessionId);
    this.brigade.remove(client.sessionId);
    if (this.state.hostId === client.sessionId) {
      this.state.hostId = pickHost(Array.from(this.joinOrder, ([id, joinedAt]) => ({ id, joinedAt })));
      if (this.state.hostId) console.log(`[street ${this.roomId}] host -> ${this.state.hostId}`);
    }
    console.log(`[street ${this.roomId}] leave ${client.sessionId}`);
  }

  /** Waiting -> marching (#12), everyone at once from a clean street, with the opening wave. */
  private startMarch() {
    this.resetStreet();
    if (!startRound(this.round)) return;
    // #17: the dev-only brigade tuning lasts one round.
    this.brigade.resetTuning();
    this.roundHeld = false;
    this.roundStats.clear();
    this.updateFront();
    this.syncRound();
    console.log(`[street ${this.roomId}] start (${this.state.players.size} players)`);
  }

  /**
   * The whole street back to a fresh room (#12): no CRS, gas, items in flight
   * or grabs; props whole; the level's pavés back on the ground; every
   * protester in the start zone with full HP, clear of the props put back, and
   * no cooldown, rescue or held input left over. Used when a round ends and
   * again when the next one starts.
   */
  private resetStreet() {
    this.rescues.clear();
    // Nobody carried or flying (#11).
    this.carry.clear();
    this.props.reset(this.state.props);
    this.fires.reset();
    this.crs.clear();
    // No fire truck or pompier left (#17).
    this.brigade.clear();
    this.crs.reinforceTo = 0;
    // No fire left for the bots to avoid; rebuilds their grid for the props put back.
    this.crs.setHazards(null);
    this.fires.takeChanged();
    this.throwables.reset(LEVEL.items);
    // Dog poo (#15): nobody remembers slipping.
    this.slips.clear();
    this.gas.reset();
    this.meleeCooldowns.clear();
    this.dodgeCooldowns.clear();
    // Hops (#45): the cooldowns here, the timers with the bodies (placeAtSpawn makes fresh ones, on the ground).
    this.jumpCooldowns.clear();
    this.heals.clear();
    this.state.players.forEach((player, sessionId) => {
      this.placeAtSpawn(sessionId, player);
      // Every stat comes from the archetype picked in the lobby (#14); only max HP is kept per player (in health).
      this.healths.reset(sessionId, player, archetypeStats(player.archetype).maxHp);
      player.rescue = 0;
      player.carrying = ThrowableKind.None;
      player.gassed = false;
      player.onFire = false;
      player.fireHold = 0;
      player.carriedBy = "";
      this.moveInputs.set(sessionId, { x: 0, z: 0 });
    });
    this.front = 0;
    this.state.progress = 0;
  }

  /**
   * The cortège's front (#12) after the protesters moved: synced as a 0..100
   * bar, and every wave whose threshold it crossed fires (once per round).
   */
  private updateFront() {
    const front = frontProgress(LEVEL, this.state.players.values());
    if (front !== null) this.front = front;
    const bar = syncedProgress(this.front);
    if (this.state.progress !== bar) this.state.progress = bar;
    for (const wave of wavesDue(ROUND_WAVES, this.round.fired, this.front)) this.spawnWave(wave);
  }

  /**
   * One reinforcement wave (#12): its shield line on the nearest line point far
   * enough ahead (or, with none left, its bots as chasers), then the other unit
   * types of its stage (#13, UNIT_STAGES), then its chasers on the CRS points
   * ahead of the front, clear of protesters. MAX_CRS cuts it short.
   */
  private spawnWave(wave: RoundWave) {
    let chasers = wave.chasers ?? 0;
    let line = "";
    if (wave.line) {
      const p = waveLinePoint(LEVEL, this.front);
      const formed = p ? this.crs.spawnLine(p.x, p.z, wave.line) : null;
      if (formed && p) line = ` + line of ${formed.members.length} at z=${p.z}`;
      else chasers += wave.line;
    }
    const people: Vec2[] = [];
    this.state.players.forEach((p) => people.push({ x: p.x, z: p.z }));
    // The unit mix (#13), before the chasers so the cap cuts plain CRS first: BAC slipped in
    // at the rear of the cortège, BRAV-M bikes from further ahead.
    const stage = unitStageAt(wave.at);
    let bacs = 0;
    for (let i = 0; i < stage.bac; i++) if (this.spawnBac()) bacs++;
    let bikes = 0;
    for (const pt of waveChaserPoints(LEVEL, this.front, stage.bravm, people, CRS_SPAWN_CLEARANCE, WAVE_BRAVM_AHEAD)) {
      if (this.crs.spawnBravm(pt.x, pt.z)) bikes++;
    }
    let spawned = 0;
    for (const pt of waveChaserPoints(LEVEL, this.front, chasers, people, CRS_SPAWN_CLEARANCE)) {
      if (this.crs.spawn(pt.x, pt.z)) spawned++;
    }
    const extra = bacs + bikes > 0 ? ` + ${bacs} BAC + ${bikes} BRAV-M` : "";
    console.log(`[street ${this.roomId}] wave at ${wave.at}: ${spawned} chasers${line}${extra} (${this.crs.size} bots)`);
  }

  /** A BAC (#13) at the rear of the cortège, where a late protester would show up, clear of obstacles. */
  private spawnBac() {
    const free: Vec2[] = [];
    this.state.players.forEach((p) => {
      if (p.status === PlayerStatus.Free) free.push({ x: p.x, z: p.z });
    });
    const r = crsRadius(CrsKind.Bac);
    const spot = respawnPoint(LEVEL, r, free);
    const p = resolveCircle(this.props.world, spot.x, spot.z, r);
    return this.crs.spawnBac(p.x, p.z, this.pickDisguiseName());
  }

  /** A default protester name (#13) for a BAC's placard, one nobody on the street already goes by. */
  private pickDisguiseName(): string {
    const used = new Set<string>();
    this.state.players.forEach((p) => used.add(p.name));
    this.state.crs.forEach((c) => {
      if (c.name) used.add(c.name);
    });
    return disguiseName(used);
  }

  /**
   * The round clock (#12), every tick while marching or ended: checks the win
   * and lose conditions (see `roundOutcome` for the order), ends the round, and
   * after the end screen resets the street back to `waiting`.
   */
  private stepRoundClock(dt: number) {
    const event = stepRound(this.round, dt, (timeLeft) =>
      this.roundHeld ? RoundResult.None : roundOutcome(LEVEL, Array.from(this.state.players.values()), timeLeft),
    );
    if (event === "ended") this.endRound();
    else if (event === "reset") {
      this.resetStreet();
      console.log(`[street ${this.roomId}] reset -> waiting`);
    }
    this.syncRound();
  }

  /** The march is over: everyone gets the result and the numbers once. The street freezes until the reset. */
  private endRound() {
    this.rescues.clear();
    const event: RoundEndEvent = {
      result: this.round.result,
      seconds: Math.round(this.round.elapsed),
      players: Array.from(this.state.players.entries(), ([id, p]) => ({ id, name: p.name, archetype: p.archetype, ...this.roundStats.get(id) })),
    };
    this.broadcast(ServerMessage.RoundEnd, event);
    console.log(`[street ${this.roomId}] end: result ${event.result} after ${event.seconds} s, progress ${this.state.progress}`);
  }

  /** Mirror the round into Schema, only what changed: the countdown moves once a second. */
  private syncRound() {
    const s = this.state;
    if (s.phase !== this.round.phase) s.phase = this.round.phase;
    if (s.result !== this.round.result) s.result = this.round.result;
    const left = syncedSeconds(this.round.timeLeft);
    if (s.timeLeft !== left) s.timeLeft = left;
  }

  /** DEBUG (#12): put yourself mid-street at `progress` (1 is the middle of the Préfecture zone), clear of obstacles. */
  private debugTeleport(id: string, progress: number) {
    const player = this.state.players.get(id);
    if (!player) return;
    const { from, to } = LEVEL.progress;
    const d = LEVEL.destination;
    const x = progress >= 1 ? (d.minX + d.maxX) / 2 : from.x + (to.x - from.x) * progress;
    const z = progress >= 1 ? (d.minZ + d.maxZ) / 2 : from.z + (to.z - from.z) * progress;
    const p = resolveCircle(this.props.world, x, z, PLAYER_RADIUS);
    this.bodies.place(id, player, p.x, p.z);
  }

  /** Random point in the start zone, clear of obstacles and of the props as they stand, facing the Préfecture. */
  private placeAtSpawn(sessionId: string, player: Player) {
    const spawn = clearSpawnPoint(LEVEL, this.props.world, PLAYER_RADIUS);
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
    // A carrier or a carried teammate who is hit, even lightly: the carry ends at once (#11).
    if (this.carry.inCarry(id)) this.endCarry(id);
    const res = this.bodies.impulse(id, player, dirX, dirZ, strength, mode);
    if (!res || res.strength === 0) return res;
    if (res.knockedDown) this.roundStats.add(id, "knockdowns");
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
    if (!player || !this.healths.damage(id, player, amount, this.now)) return false;
    // Hurt while holding interact on a fire action (#16): it starts again from 0.
    this.fires.interrupt(id);
    return true;
  }

  /**
   * A CRS grabs a free protester (#5); arrested when `duration` (default
   * GRAB_DURATION) ends unless rescued. The drag lasts longer for an
   * archetype's `grabTime` (#14), and longer still with a bobo filming nearby.
   */
  grabPlayer(id: string, duration?: number): boolean {
    const player = this.state.players.get(id);
    // Held overhead or flying through the air (#11): out of a CRS's reach.
    if (!player || this.carry.isCarried(id) || this.carry.isFlying(id)) return false;
    const drag = (duration ?? GRAB_DURATION) * this.statsOf(id).grabTime * this.filmedFactor(player);
    if (!this.healths.grab(id, player, this.now, drag)) return false;
    // A grabbed carrier drops their teammate at once.
    this.endCarry(id);
    return true;
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

  /** Protester `id`'s archetype stats (#14), from the id they picked and the shared table. The default's for an unknown id. */
  private statsOf(id: string): ArchetypeStats {
    return archetypeStats(this.state.players.get(id)?.archetype);
  }

  /** The filming aura (#14) at `at`: the best of the free bobos in reach (no stacking), 1 with none. */
  private filmedFactor(at: Vec2): number {
    const filmers: AuraSubject[] = [];
    this.state.players.forEach((p, pid) => {
      const stats = archetypeStats(p.archetype);
      if (stats.filmAura > 1 && p.status === PlayerStatus.Free) filmers.push({ id: pid, x: p.x, z: p.z, stats });
    });
    return filmers.length > 0 ? filmFactor(at, filmers) : 1;
  }

  /**
   * The heal aura (#14), once a tick: every free protester below their max HP
   * near a free CGT gets HP back, at the best rate in reach (no stacking).
   */
  private stepHealAuras(dt: number) {
    const healers = this.auraHealers;
    const targets = this.auraTargets;
    healers.length = 0;
    targets.length = 0;
    this.state.players.forEach((p, id) => {
      if (p.status !== PlayerStatus.Free) return;
      const stats = archetypeStats(p.archetype);
      if (stats.healAura > 0) healers.push({ id, x: p.x, z: p.z, stats });
      if (p.hp < stats.maxHp) targets.push({ id, x: p.x, z: p.z, stats });
    });
    for (const [id, hp] of this.heals.step(targets, healers, dt)) {
      const player = this.state.players.get(id);
      if (player) this.healths.heal(id, player, hp, this.now);
    }
  }

  /** May act (attack #4, throw and pick up #8, dodge #9, rescue #10): free, not knocked down and not carried (#11). */
  hasControl(id: string): boolean {
    return this.healths.canAct(id) && this.bodies.hasControl(id) && !this.carry.isCarried(id);
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
    // A carrier's hands are full (#11): the click throws instead (the client sends a throw).
    if (!player || !this.hasControl(id) || this.carry.isCarrying(id)) return;
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
    // The black bloc's hits count double (#14): every prop hit goes through here, swing, throw or thrown teammate.
    const res = this.props.damage(propId, propDamageOf(amount, this.statsOf(by).propDamage), this.state.props.get(propId));
    if (!res) return;
    const event: HitEvent = { by, kind: "prop", target: propId, x, z, broke: res.broke };
    this.broadcast(ServerMessage.Hit, event);
    if (res.broke) {
      this.roundStats.add(by, "propsBroken");
      this.dropItems(res.slot);
      // The prop's new shape changes where bots can walk.
      this.crs.worldChanged();
    }
  }

  /** Tell everyone a CRS was hit (to flash it) and pushed (to tip it the right way). */
  private announceCrsHit(by: string, crsId: string, res: CrsHitResult, x: number, z: number) {
    if (res.out) this.roundStats.add(by, "crsOut");
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
    if (!player || !this.hasControl(id)) return;
    const m = (message ?? {}) as Partial<ThrowPayload>;
    // Carrying a teammate (#11): they are what flies.
    const mate = this.carry.carriedOf(id);
    if (mate !== null) {
      this.throwTeammate(client, player, mate, Number(m.x), Number(m.z));
      return;
    }
    if (!isItemKind(player.carrying)) return;
    // The archetype's arm (#14): how far it flies, and how far off the aim it may wobble.
    const stats = this.statsOf(id);
    const dir = spreadAim(aimDirection(Number(m.x), Number(m.z), player.rotation), stats.throwSpread, Math.random());
    if (!this.throwables.launch(id, player.carrying, player.x, player.z, dir.x, dir.z, stats.throwRange)) return;
    player.carrying = ThrowableKind.None;
    player.rotation = Math.atan2(dir.x, dir.z);
    // The thrower already played the arm swing locally.
    const swing: SwingEvent = { id };
    this.broadcast(ServerMessage.Swing, swing, { except: client });
  }

  /**
   * Throw the carried teammate (#11) along the aim: they leave the carrier's
   * hands as a knocked-down body in the air (`launchBody`), from the carrier's
   * spot, and hit CRS and props on the way (`stepFlights`). The carrier turns
   * to face the throw.
   */
  private throwTeammate(client: Client, player: Player, mateId: string, aimX: number, aimZ: number) {
    const id = client.sessionId;
    const mate = this.state.players.get(mateId);
    const l = teammateLaunch(aimX, aimZ, player.rotation);
    this.carry.release(id);
    if (!mate) return;
    mate.carriedBy = "";
    const facing = Math.atan2(l.dirX, l.dirZ);
    this.bodies.hold(mateId, mate, player.x, player.z, facing);
    const res = this.bodies.launch(mateId, mate, l.dirX, l.dirZ, l.speed, l.flight, l.down);
    if (!res) return;
    this.carry.startFlight(mateId, id, mate.x, mate.z, res.dirX, res.dirZ);
    player.rotation = facing;
    this.roundStats.add(id, "teammatesThrown");
    this.roundStats.add(mateId, "knockdowns");
    // The flailing flight: every client's ragdoll kicks along the throw.
    const event: ImpulseEvent = { id: mateId, dirX: res.dirX, dirZ: res.dirZ, strength: res.strength, down: true };
    this.broadcast(ServerMessage.Impulse, event);
    const swing: SwingEvent = { id };
    this.broadcast(ServerMessage.Swing, swing, { except: client });
  }

  /**
   * End the carry `id` is in (#11), either side: the carried teammate lands
   * where they are (on the carrier's spot) and stumbles off with a small push,
   * along `dir` or in a random direction. A no-op outside a carry.
   */
  private endCarry(id: string, dir?: Vec2) {
    const pair = this.carry.release(id);
    if (!pair) return;
    const mateId = pair[1];
    const mate = this.state.players.get(mateId);
    if (!mate) return;
    mate.carriedBy = "";
    const d = dir ?? dropDirection(Math.random());
    this.applyImpulse(mateId, d.x, d.z, CARRY_DROP_PUSH, "never");
  }

  /** Pick up teammate `mateId` (#11), chosen by `interactChoice`. */
  private pickUpTeammate(id: string, mateId: string) {
    const mate = this.state.players.get(mateId);
    if (!mate || !this.carry.pickUp(id, mateId, this.now)) return;
    mate.carriedBy = id;
    // Whatever they were doing stops: a hold on E, a rescue in progress.
    this.rescues.hold(mateId, false);
    this.fires.hold(mateId, false);
    const player = this.state.players.get(id);
    if (player) this.bodies.hold(mateId, mate, player.x, player.z, player.rotation);
  }

  /**
   * A thrown item hit a prop or a CRS (#8): the row in THROWABLE_TYPES says
   * what it does. A trottinette (#15) calls this for every CRS it bowls
   * through, once each.
   */
  private projectileHit(p: Projectile, target: ProjectileTarget<"prop" | "crs">) {
    const type = THROWABLE_TYPES[p.kind];
    if (target.kind === "prop") {
      if (type.propDamage > 0) this.damageProp(p.by, target.id, type.propDamage, p.x, p.z);
      return;
    }
    // Damage, knockback along the throw (a heavy one floors it) and a stun: a
    // grabbing CRS lets go on its next tick, with the rescue's grab immunity.
    // A tomato or a poo does none of that; the hit still flashes the bot.
    const bot = this.crs.get(target.id);
    const at = bot ? bot.body : p;
    const res = this.crs.strike(target.id, p.dirX, p.dirZ, type.crsDamage, type.knockback, type.stun, this.now);
    if (res) this.announceCrsHit(p.by, target.id, res, at.x, at.z);
    // Its status (#15): a splatted visor, a stink. A second one refreshes the timer.
    if (type.effect !== null && this.crs.affect(target.id, type.effect, type.effectTime, this.now)) this.roundStats.add(p.by, "splats");
  }

  /** What a projectile can hit this tick: intact props and every CRS not out. Protesters never (no friendly fire). */
  private projectileTargets(): ProjectileTarget<"prop" | "crs">[] {
    const out: ProjectileTarget<"prop" | "crs">[] = [];
    for (const t of this.props.targets()) out.push({ id: t.id, kind: "prop", shape: t.shape });
    // A trottinette (#15) goes through CRS, never through props.
    for (const t of this.crs.meleeTargets()) out.push({ id: t.id, kind: "crs", shape: t.shape, pierceable: true });
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
    if (!this.dodgeCooldowns.ready(id, this.now, DODGE_COOLDOWN * this.statsOf(id).dodgeCooldown)) return false;
    const dir = dodgeDirection(this.moveInputs.get(id) ?? NO_INPUT, player.rotation);
    if (!this.bodies.dodge(id, player, dir.x, dir.z)) return false;
    this.dodgeCooldowns.start(id, this.now);
    return true;
  }

  /**
   * One hop (#45): JUMP_DURATION in the air, passing over bins and fallen CRS
   * (never cars, walls or shield lines), and a baton swing misses meanwhile.
   * Only a protester with control (free, not knocked down) and not dodging
   * hops, at most once per JUMP_COOLDOWN, counted from the start of the last
   * one. Carrying a pavé is fine. Returns true if the hop started.
   */
  jump(id: string): boolean {
    const player = this.state.players.get(id);
    // A carrier stays on the ground (#11): too heavy to hop. So does someone lugging a trottinette (#15).
    if (!player || !this.hasControl(id) || this.carry.isCarrying(id) || carrySpeedOf(player.carrying) < 1) return false;
    if (!this.jumpCooldowns.ready(id, this.now)) return false;
    if (!this.bodies.jump(id, player)) return false;
    this.jumpCooldowns.start(id, this.now);
    return true;
  }

  /**
   * Interact key (E) pressed or released. What a press does is `pickInteract`
   * (#11), one priority for the server and the client hints:
   * 1. A carrier puts their teammate down, in front of them (#11), and nothing else.
   * 2. A grabbed teammate in RESCUE_RANGE (#10): the press starts holding, and
   *    the rescue itself runs in `step` for as long as the key stays down.
   * 3. A burning teammate to pat out (#16, a hold too).
   * 4. The nearest item within PICKUP_RANGE is picked up (#8), empty-handed only.
   * 5. A free teammate in CARRY_RANGE is picked up (#11), empty-handed only
   *    (after an item: reaching for a pavé never lifts a friend by mistake).
   * 6. Holding on next to a bin or a car lights it (#16, see `fireAction`).
   * Holding is recorded even with nobody in range, so pressing E and then
   * walking up to a grabbed teammate works too. Nothing without control.
   */
  interact(id: string, held: boolean) {
    const player = this.state.players.get(id);
    if (!player) return;
    if (held && this.carry.isCarrying(id)) {
      this.rescues.hold(id, false);
      this.fires.hold(id, false);
      if (this.hasControl(id)) this.endCarry(id, { x: Math.sin(player.rotation), z: Math.cos(player.rotation) });
      return;
    }
    this.rescues.hold(id, held);
    // Fire (#16): patting out a burning teammate, or lighting a prop, is a hold that runs in `step`.
    this.fires.hold(id, held);
    if (!held || !this.hasControl(id)) return;
    const choice = this.interactChoice(id);
    if (choice?.kind === "carry") this.pickUpTeammate(id, choice.target);
    else if (choice?.kind === "pickUp") {
      const kind = this.throwables.pickUp(player, player.carrying);
      if (kind !== ThrowableKind.None) player.carrying = kind;
    }
  }

  /** What an interact press by `id` does right now (see `interact`), or null. */
  private interactChoice(id: string): InteractChoice | null {
    const player = this.state.players.get(id);
    const self = this.protesterView(id);
    const me = this.carrySubject(id);
    if (!player || !self || !me) return null;
    const others: CarrySubject[] = [];
    for (const pid of this.state.players.keys()) {
      const s = this.carrySubject(pid);
      if (s) others.push(s);
    }
    return pickInteract({
      carryingTeammate: this.carry.isCarrying(id),
      rescue: pickRescueTarget(self, this.allProtesterViews()),
      fire: this.fireAction(id),
      teammate: pickCarryTarget(me, others),
      item: player.carrying === ThrowableKind.None ? nearestItem(player, this.throwables.ground.entries(), PICKUP_RANGE) : null,
    });
  }

  /** Protester `id` as the carry rules see them (#11). */
  private carrySubject(id: string): CarrySubject | undefined {
    const p = this.state.players.get(id);
    if (!p) return undefined;
    return {
      id,
      x: p.x,
      z: p.z,
      status: p.status,
      down: p.down,
      onFire: p.onFire,
      item: p.carrying,
      carried: this.carry.isCarried(id),
      carrying: this.carry.isCarrying(id),
    };
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
   * A prop just broke: it drops PROP_TYPES[kind].drops items of its
   * `dropKind` (pavés #4, #8; tomatoes from a market stall #15) on its street
   * side, clear of its broken shape and everything else.
   */
  private dropItems(slot: PropSlot) {
    const type = PROP_TYPES[slot.kind];
    const shape = propShape(slot, false);
    if (type.drops <= 0 || !shape) return;
    for (const spot of dropSpots(shape, type.drops, this.props.world)) this.throwables.drop(type.dropKind, spot.x, spot.z);
  }

  /**
   * Dog poo on the ground (#15): every protester who steps on one slips and
   * falls along the way they were going (a knock-down, so the ragdoll plays),
   * unless in the air, already down or just up (see `SlipGuards`). Not free
   * (grabbed, KO, arrested) or carried: no slip, but stepping off still counts.
   */
  private slipProtesters(poos: readonly [string, Vec2][]) {
    this.state.players.forEach((player, id) => {
      const body = this.bodies.get(id);
      if (!body) return;
      const b = this.slipBody;
      b.x = body.x;
      b.z = body.z;
      b.airborne = isAirborne(body) || this.carry.isCarried(id);
      b.down = isDown(body) || player.status !== PlayerStatus.Free;
      b.immune = isImmune(body);
      if (this.slips.check(id, b, poos) === null) return;
      const input = this.moveInputs.get(id) ?? NO_INPUT;
      const moving = input.x !== 0 || input.z !== 0;
      const res = this.applyImpulse(
        id,
        moving ? input.x : Math.sin(player.rotation),
        moving ? input.z : Math.cos(player.rotation),
        SLIP_IMPULSE,
        "always",
      );
      if (res?.knockedDown) this.roundStats.add(id, "slips");
    });
  }

  /** Dog poo (#15): CRS slip on it too, and let go of whoever they were dragging. */
  private slipCrs(poos: readonly [string, Vec2][]) {
    for (const bot of this.crs.all) {
      const b = this.slipBody;
      b.x = bot.body.x;
      b.z = bot.body.z;
      b.airborne = false;
      b.down = isDown(bot.body) || bot.status === CrsStatus.Out;
      b.immune = isImmune(bot.body);
      if (this.slips.check(bot.id, b, poos) === null) continue;
      const moving = bot.input.x !== 0 || bot.input.z !== 0;
      const res = this.crs.push(
        bot.id,
        moving ? bot.input.x : Math.sin(bot.rotation),
        moving ? bot.input.z : Math.cos(bot.rotation),
        SLIP_IMPULSE,
        "always",
      );
      if (res && res.strength > 0) {
        const push: ImpulseEvent = { id: bot.id, dirX: res.dirX, dirZ: res.dirZ, strength: res.strength, down: res.knockedDown };
        this.broadcast(ServerMessage.Impulse, push);
      }
    }
  }

  /**
   * One fixed tick. Order matters and is fixed here:
   * 1. Rescues (#10) are applied before step 2, so a rescue landing on the
   *    last tick of a drag wins over the arrest (locked by the tests in
   *    packages/shared/src/rescue/rescue.test.ts). Then held interacts
   *    light props or pat out burning teammates (#16).
   * 2. Protesters: health timers (a drag that ends becomes an arrest), then
   *    movement. One no longer free drops what they carry (#8).
   *    Tear gas (#7) hurts and slows whoever a cloud reaches, and a fire
   *    (#16) sets alight whoever stands in it, here too.
   *    Then carries (#11): drops, and each carried teammate onto their
   *    carrier; thrown teammates hit the CRS and props they flew into.
   * 3. Thrown items (#8) fly, after the protesters moved and before the CRS,
   *    so a stunned bot lets go on this very tick. Then gas canisters (#7)
   *    fly and land, and clouds that have run their time go.
   * 4. CRS (#5): think, move, hit, grab, drag. A bot whose protester was just
   *    arrested, rescued or disconnected goes back to work here. Then the
   *    pompiers (#17) decide and spray (their trucks come and go), bots in a
   *    fire catch it (#16), and the fires burn down and spread; when one
   *    starts or goes out, the bots' grid is rebuilt around the fires.
   * 5. The round (#12): progress and waves, then the win/lose check and the
   *    timers. Only the round clock runs while `ended` (the street is frozen),
   *    and nothing at all while `waiting`.
   */
  private step(dt: number) {
    if (this.state.phase === Phase.Marching) {
      this.simulate(dt);
      this.updateFront();
    }
    if (this.state.phase !== Phase.Waiting) this.stepRoundClock(dt);
  }

  /** Steps 1 to 4 of `step`: the street itself, only while marching. */
  private simulate(dt: number) {
    this.now += dt;
    this.rescues.step(
      dt,
      (id) => this.protesterView(id),
      () => this.allProtesterViews(),
      // A carrier's hands are full (#11).
      (id) => this.hasControl(id) && !this.carry.isCarrying(id),
      (targetId, rescuerId) => {
        if (!this.pullFree(targetId)) return false;
        this.roundStats.add(rescuerId, "rescues");
        return true;
      },
      // The étudiant·e pulls faster (#14).
      (id) => RESCUE_TIME * this.statsOf(id).rescueTime,
    );
    this.stepFireHolds(dt);
    const crowd = this.buildCrowdWorld();
    this.state.players.forEach((player, sessionId) => {
      const health = this.healths.tick(sessionId, player, this.now);
      if (health === "respawned") this.placeAtRear(sessionId, player);
      else if (health === "arrested") this.roundStats.add(sessionId, "arrests");
      // Grabbed, KO or arrested: the item in hand falls where they are (#8).
      if (player.carrying !== ThrowableKind.None) this.throwables.release(player);
      // The ring over a grabbed protester (#10); 0 once free, arrested or gone.
      const rescue = player.status === PlayerStatus.Grabbed ? this.rescues.percent(sessionId) : 0;
      if (player.rescue !== rescue) player.rescue = rescue;
      // Only free protesters walk; the others keep their knockback slide (a KO'd body still flies).
      // A carried teammate (#11) is held overhead: no walking, placed on the carrier after this loop.
      const carried = this.carry.isCarried(sessionId);
      const free = this.healths.canMove(sessionId) && !carried;
      // Grabbed or KO mid-dodge (#9): the burst stops at once.
      if (!free && player.dodging) this.bodies.endDodge(sessionId, player);
      // Grabbed or KO mid-hop (#45): down at once, landing clear of what it was over.
      if (!free && player.airborne) this.bodies.endJump(sessionId, player);
      // Tear gas (#7): a cloud reaching them (never through a wall) costs HP now and then and slows the walk.
      const gas = this.gas.expose(sessionId, player, this.props.world, this.now);
      if (gas.damage > 0) this.damagePlayer(sessionId, gas.damage);
      // Fire (#16): a fire zone sets them on fire; burning, they lose HP now and then and run faster (panic).
      const canBurn = player.status === PlayerStatus.Free || player.status === PlayerStatus.Grabbed;
      const fire = this.fires.burn(sessionId, player, PLAYER_RADIUS, canBurn, this.now);
      if (fire.damage > 0) this.damagePlayer(sessionId, fire.damage);
      const held = free ? (this.moveInputs.get(sessionId) ?? NO_INPUT) : NO_INPUT;
      // A carrier walks slower (#11), and so does someone lugging a trottinette (#15).
      const speed = gas.speed * fire.speed * (this.carry.isCarrying(sessionId) ? CARRY_SPEED_FACTOR : 1) * carrySpeedOf(player.carrying);
      const input = speed === 1 ? held : { x: held.x * speed, z: held.z * speed };
      // Walk (or dodge) from the held input (ignored while down) plus knockback
      // velocity, collided against the street (sub-stepped, bounces off walls).
      // Free and KO'd protesters bump into raised shields (#6); grabbed ones are dragged, arrested ones are in the van.
      const solid = player.status === PlayerStatus.Free || player.status === PlayerStatus.Ko;
      if (carried) return;
      // The archetype's walk (#14) composes with the slowdowns above; the dodge burst follows it.
      const res = this.bodies.step(sessionId, player, input, dt, solid ? crowd : this.props.world, archetypeStats(player.archetype).speed);
      // A head-on dodge into a wall or prop bonks (#9): tip the avatar backwards like a hit.
      if (res?.bonk) {
        const event: ImpulseEvent = { id: sessionId, dirX: res.bonk.x, dirZ: res.bonk.z, strength: res.bonk.speed, down: player.down };
        this.broadcast(ServerMessage.Impulse, event);
      }
    });
    // The CGT's heal aura (#14), after everyone moved.
    this.stepHealAuras(dt);
    // Carries (#11): drops (timer, carrier hit or no longer free), then each carried teammate onto their carrier.
    this.stepCarries();
    // Thrown teammates (#11) hit the CRS and props they fly into, before the CRS step, so a floored bot lets go on this tick.
    this.stepFlights();
    // Dog poo (#15): a handful at most (its ground cap), so every body against every poo is cheap.
    const poos = Array.from(this.throwables.slippery());
    if (poos.length > 0) this.slipProtesters(poos);
    this.throwables.step(
      dt,
      this.props.world,
      () => this.projectileTargets(),
      (p, target) => this.projectileHit(p, target),
    );
    // Tear gas (#7): canisters fly (stopped by walls and props) and land as clouds; old clouds go.
    this.gas.step(dt, this.now, this.props.world);
    this.crs.step(this.now, dt, this.crsHost, () => this.freeProtesterPositions(), (line, res) => {
      if (res.shovedBy.length > 0) {
        const event: ShoveEvent = { ids: res.shovedBy };
        this.broadcast(ServerMessage.Shove, event);
      }
      if (res.broke) console.log(`[street ${this.roomId}] ${line.id} broke (${res.broke})`);
    });
    if (poos.length > 0) this.slipCrs(poos);
    // Pompiers (#17): trucks come and go, the crews pick fires and spray (puts out fires, pushes whoever is in the water).
    this.brigade.step(this.now, dt, this.brigadeHost);
    this.burnCrs();
    this.stepFires(dt);
    // Members walked into protesters: push them out of the shields (walls win; a
    // member pinning someone against a wall gives way instead).
    const shields = this.crs.shieldContacts();
    if (shields.length > 0) {
      this.state.players.forEach((player, sessionId) => {
        // A carried teammate (#11) rides on their carrier, who is pushed out instead.
        if ((player.status === PlayerStatus.Free || player.status === PlayerStatus.Ko) && !this.carry.isCarried(sessionId)) {
          this.bodies.separate(sessionId, player, shields);
        }
      });
      this.crs.syncViews();
    }
  }

  /**
   * Carries (#11), once a tick after the protesters moved: a carry ends when
   * `carryDropReason` says so (held too long, the carrier down, grabbed or
   * KO, the carried player KO, either gone); otherwise the carried teammate
   * is put on the carrier's spot, facing the same way.
   */
  private stepCarries() {
    for (const [carrierId, mateId, held] of this.carry.all(this.now)) {
      const carrier = this.state.players.get(carrierId);
      const mate = this.state.players.get(mateId);
      if (carryDropReason(carrier, mate, held) !== null || !carrier || !mate) {
        this.endCarry(carrierId);
        continue;
      }
      this.bodies.hold(mateId, mate, carrier.x, carrier.z, carrier.rotation);
    }
  }

  /**
   * Thrown teammates in flight (#11): every standing CRS and every intact,
   * non-hoppable prop the body swept past this tick (see `flightContacts`) is
   * hit once per flight. A CRS takes damage, a heavy knockback along the
   * throw and a stun (it lets go of any grab; it counts towards breaking a
   * shield line like a pavé), and the body bounces back off the first one. A
   * prop takes damage and may break. A body that landed or left ends its flight.
   */
  private stepFlights() {
    const flights = this.carry.allFlights();
    if (flights.length === 0) return;
    const targets: ProjectileTarget<"prop" | "crs">[] = [];
    for (const t of this.props.targets()) {
      const kind = this.props.slot(t.id)?.kind;
      // In the air: over bins, like a hop (#45).
      if (kind && !PROP_TYPES[kind].hoppable) targets.push({ id: t.id, kind: "prop", shape: t.shape });
    }
    for (const t of this.crs.meleeTargets()) {
      const bot = this.crs.get(t.id);
      // Over a CRS lying on the ground, like a hop.
      if (bot && bot.body.downTime <= 0) targets.push({ id: t.id, kind: "crs", shape: t.shape });
    }
    for (const [id, f] of flights) {
      const body = this.bodies.get(id);
      if (!body || !this.state.players.has(id)) {
        this.carry.endFlight(id);
        continue;
      }
      for (const t of flightContacts(f, body, PLAYER_RADIUS, targets)) {
        if (f.hit.has(t.id)) continue;
        f.hit.add(t.id);
        if (t.kind === "prop") {
          this.damageProp(f.by, t.id, TEAMMATE_PROP_DAMAGE, body.x, body.z);
          continue;
        }
        const res = this.crs.strike(t.id, f.dirX, f.dirZ, TEAMMATE_CRS_DAMAGE, TEAMMATE_CRS_KNOCKBACK, TEAMMATE_CRS_STUN, this.now);
        if (!res) continue;
        this.announceCrsHit(f.by, t.id, res, body.x, body.z);
        if (!f.bounced) this.bodies.rebound(id, TEAMMATE_REBOUND);
        f.bounced = true;
      }
      f.x = body.x;
      f.z = body.z;
      if (!this.bodies.isFlying(id)) this.carry.endFlight(id);
    }
  }

  /**
   * Fire (#16): what holding interact does for protester `id` right now, or
   * null: nothing when they can't act, carry a teammate (#11) or a grabbed
   * teammate is in rescue reach (#10 first), else pat out the nearest burning
   * teammate, else light the nearest prop that can burn.
   */
  private fireAction(id: string): FireAction | null {
    const self = this.protesterView(id);
    if (!self || !this.hasControl(id) || this.carry.isCarrying(id) || pickRescueTarget(self, this.allProtesterViews()) !== null) return null;
    this.burningViews.length = 0;
    this.state.players.forEach((p, pid) => {
      if (p.onFire) this.burningViews.push({ id: pid, x: p.x, z: p.z, onFire: true });
    });
    this.lightable.length = 0;
    for (const p of FLAMMABLE) if (this.fires.canIgnite(p.id, this.props.hp(p.id))) this.lightable.push(p);
    return pickFireAction(self, PLAYER_RADIUS, this.burningViews, this.lightable);
  }

  /** Fire (#16): every held interact counts towards lighting a prop or patting out a teammate; mirrors the bar. */
  private stepFireHolds(dt: number) {
    for (const id of this.fires.holders()) {
      const done = this.fires.stepHold(id, this.fireAction(id), dt);
      if (done?.kind === "light" && this.lightProp(done.target)) this.roundStats.add(id, "firesLit");
      else if (done?.kind === "putOut") this.putOutBody(done.target);
    }
    this.state.players.forEach((player, id) => {
      const hold = this.fires.holdPercent(id);
      if (player.fireHold !== hold) player.fireHold = hold;
    });
  }

  /** Fire (#16): CRS standing in a fire catch it too, with their own damage numbers. A bot burnt to 0 HP is out. */
  private burnCrs() {
    for (const bot of this.crs.all) {
      const view = this.crs.view(bot.id);
      if (!view) continue;
      // A pompier (#17) is fireproof.
      const canBurn = bot.status !== CrsStatus.Out && bot.stats.invulnerable !== true;
      const res = this.fires.burn(bot.id, view, crsRadius(bot.kind, bot.mount), canBurn, this.now, CRS_BURN_DAMAGE, CRS_BURN_DAMAGE_INTERVAL);
      if (res.damage > 0) this.crs.burn(bot.id, res.damage, this.now);
    }
  }

  /**
   * Fire (#16): props burn down (their HP mirrored), burn out charred, and
   * spread. When a fire starts or goes out, the bots' hazards are rebuilt
   * so they path around the fires.
   */
  private stepFires(dt: number) {
    for (const e of this.fires.step(dt, (id) => this.props.hp(id))) {
      if (e.type === "burnt") this.props.char(e.id, this.state.props.get(e.id));
      else this.props.lock(e.to);
    }
    for (const f of this.fires.burning()) this.props.burnTo(f.id, Math.ceil(f.fuel - 1e-9), this.state.props.get(f.id));
    if (this.fires.takeChanged()) this.crs.setHazards(this.fires.size > 0 ? this.fires.hazards(LEVEL.bounds) : null);
  }

  /** Set prop `id` on fire (#16): a held interact, and the hook for future igniters (#15 fumigènes). False if it can't burn now. */
  lightProp(id: string): boolean {
    if (!this.fires.ignite(id, this.props.hp(id))) return false;
    this.props.lock(id);
    console.log(`[street ${this.roomId}] fire: ${id} lit (${this.fires.size} burning)`);
    return true;
  }

  /** Put out prop `id`'s fire (#17 pompiers, #13 water cannon): it keeps the HP it had left and can burn again. */
  extinguishProp(id: string): boolean {
    const hp = this.fires.extinguish(id);
    if (hp === null) return false;
    this.props.unlock(id);
    this.props.burnTo(id, hp, this.state.props.get(id));
    return true;
  }

  /** Flames out on a burning protester or CRS (#16 a teammate's pat, #17 the hose, #13 the water cannon). */
  putOutBody(id: string): boolean {
    return this.fires.putOut(id, this.state.players.get(id) ?? this.crs.view(id));
  }

  /**
   * Water at (x, z) (#17 pompiers' hose, #13 water cannon): puts out every
   * prop fire whose edge is within `radius`, and every burning body whose
   * centre is. Returns how many prop fires went out.
   */
  extinguishAt(x: number, z: number, radius: number): number {
    let props = 0;
    for (const id of this.fires.near(x, z, radius)) if (this.extinguishProp(id)) props++;
    const r2 = radius * radius;
    this.state.players.forEach((p, id) => {
      if (p.onFire && (p.x - x) ** 2 + (p.z - z) ** 2 <= r2) this.putOutBody(id);
    });
    for (const bot of this.crs.all) {
      if ((bot.body.x - x) ** 2 + (bot.body.z - z) ** 2 <= r2) this.putOutBody(bot.id);
    }
    // The bots' hazards follow on this tick's `stepFires`.
    return props;
  }

  /**
   * The room's world plus the raised shields (#6) and the CRS lying on the
   * ground (#45, hoppable), or the room's world itself when there are neither.
   */
  private buildCrowdWorld(): CollisionWorld {
    const shields = this.crs.shieldContacts();
    this.crowdCircles.length = 0;
    this.crs.fallenCircles(this.crowdCircles);
    if (shields.length === 0 && this.crowdCircles.length === 0) return this.props.world;
    for (const c of this.props.world.circles) this.crowdCircles.push(c);
    for (const s of shields) this.crowdCircles.push({ x: s.body.x, z: s.body.z, r: s.radius });
    this.crowdWorld.bounds = this.props.world.bounds;
    this.crowdWorld.boxes = this.props.world.boxes;
    this.crowdWorld.circles = this.crowdCircles;
    return this.crowdWorld;
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
    // The black bloc is chased first (#14): a weight on distance, see `pickTarget`.
    view.priority = archetypeStats(player.archetype).targetWeight;
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
