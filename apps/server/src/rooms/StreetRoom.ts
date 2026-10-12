import { Room, type Client } from "@colyseus/core";
import {
  ClientMessage,
  MAX_PLAYERS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  Phase,
  STREET_LEVEL,
  ServerMessage,
  TICK_RATE,
  levelWorld,
  nameOrDefault,
  normalizeMove,
  pickHost,
  spawnPoint,
  type ImpulseEvent,
  type KnockdownMode,
  type LobbyJoinOptions,
  type MoveInput,
} from "@manif/shared";
import { Bodies, DEBUG_KNOCKBACK_ENABLED, planDebugKnockback } from "../features/physics/index.js";
import { Player } from "../features/player/index.js";
import { StreetState } from "./state.js";

// The level is static shared data, imported by the client too. It is not synced.
const LEVEL = STREET_LEVEL;
const WORLD = levelWorld(LEVEL);
const NO_INPUT: MoveInput = { x: 0, z: 0 };

/**
 * One lobby, then one street. Created by `client.create()` and joined by code
 * with `client.joinById()`; it marks itself private so `joinOrCreate` never
 * drops strangers in. The room id is the lobby code.
 */
export class StreetRoom extends Room<{ state: StreetState }> {
  /** Latest move direction per session. Server-only, not synced. */
  private moveInputs = new Map<string, MoveInput>();
  /** Velocity, down and immunity timers per session (#2). Server-only; only `down` is synced. */
  private bodies = new Bodies(WORLD, PLAYER_RADIUS, PLAYER_SPEED);
  /** Arrival order per session, for host hand-over. Server-only. */
  private joinOrder = new Map<string, number>();
  private joinCounter = 0;

  override maxClients = MAX_PLAYERS;
  override state = new StreetState();

  override messages = {
    // Input only: the client says where it wants to go, the server moves it.
    // Re-normalize so a tampered client can't move faster than PLAYER_SPEED.
    // Still recorded while knocked down, so the held direction applies on getting up.
    [ClientMessage.Move]: (client: Client, message: unknown) => {
      if (this.state.phase !== Phase.Playing) return;
      const m = (message ?? {}) as Partial<MoveInput>;
      this.moveInputs.set(client.sessionId, normalizeMove(Number(m.x), Number(m.z)));
    },

    // Game rule: only the host starts, and only from the lobby.
    [ClientMessage.Start]: (client: Client) => {
      if (client.sessionId !== this.state.hostId || this.state.phase !== Phase.Lobby) return;
      this.startMarch();
    },

    // DEBUG (#2): dev-only knockback trigger, until melee (#4) exists. Not registered in production.
    ...(DEBUG_KNOCKBACK_ENABLED && {
      [ClientMessage.DebugKnockback]: (client: Client, message: unknown) => {
        if (this.state.phase !== Phase.Playing) return;
        const self = this.state.players.get(client.sessionId);
        if (!self) return;
        const plan = planDebugKnockback(client.sessionId, self, this.state.players.entries(), message);
        if (plan) this.applyImpulse(plan.targetId, plan.dirX, plan.dirZ, plan.strength);
      },
    }),
  };

  override onCreate() {
    // Invite only: reachable by joinById(code), never by joinOrCreate/join.
    void this.setPrivate(true);
    this.setFixedTimestep((ctx) => this.step(ctx.dt), TICK_RATE);
  }

  override onJoin(client: Client, options?: LobbyJoinOptions) {
    const player = new Player();
    player.name = nameOrDefault(options?.name);
    this.placeAtSpawn(client.sessionId, player);
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
    this.bodies.remove(client.sessionId);
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
      this.moveInputs.set(sessionId, { x: 0, z: 0 });
    });
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
    if (!player) return null;
    const res = this.bodies.impulse(id, player, dirX, dirZ, strength, mode);
    if (!res || res.strength === 0) return res;
    const event: ImpulseEvent = { id, dirX: res.dirX, dirZ: res.dirZ, strength: res.strength, down: res.knockedDown };
    this.broadcast(ServerMessage.Impulse, event);
    return res;
  }

  private step(dt: number) {
    if (this.state.phase !== Phase.Playing) return;
    this.state.players.forEach((player, sessionId) => {
      // Walk from the held input (ignored while down) plus knockback velocity,
      // collided against the street (sub-stepped, bounces off walls).
      this.bodies.step(sessionId, player, this.moveInputs.get(sessionId) ?? NO_INPUT, dt);
    });
  }
}
