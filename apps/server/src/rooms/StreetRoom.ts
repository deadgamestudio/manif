import { Room, type Client } from "@colyseus/core";
import {
  ClientMessage,
  MAX_PLAYERS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  Phase,
  STREET_LEVEL,
  TICK_RATE,
  levelWorld,
  moveCircle,
  nameOrDefault,
  normalizeMove,
  pickHost,
  spawnPoint,
  type LobbyJoinOptions,
  type MoveInput,
} from "@manif/shared";
import { Player, StreetState } from "../state.js";

// The level is static shared data, imported by the client too. It is not synced.
const LEVEL = STREET_LEVEL;
const WORLD = levelWorld(LEVEL);

/**
 * One lobby, then one street. Created by `client.create()` and joined by code
 * with `client.joinById()`; it marks itself private so `joinOrCreate` never
 * drops strangers in. The room id is the lobby code.
 */
export class StreetRoom extends Room<{ state: StreetState }> {
  /** Latest move direction per session. Server-only, not synced. */
  private moveInputs = new Map<string, MoveInput>();
  /** Arrival order per session, for host hand-over. Server-only. */
  private joinOrder = new Map<string, number>();
  private joinCounter = 0;

  override maxClients = MAX_PLAYERS;
  override state = new StreetState();

  override messages = {
    // Input only: the client says where it wants to go, the server moves it.
    // Re-normalize so a tampered client can't move faster than PLAYER_SPEED.
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
  };

  override onCreate() {
    // Invite only: reachable by joinById(code), never by joinOrCreate/join.
    void this.setPrivate(true);
    this.setFixedTimestep((ctx) => this.step(ctx.dt), TICK_RATE);
  }

  override onJoin(client: Client, options?: LobbyJoinOptions) {
    const player = new Player();
    player.name = nameOrDefault(options?.name);
    this.placeAtSpawn(player);
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
      this.placeAtSpawn(player);
      this.moveInputs.set(sessionId, { x: 0, z: 0 });
    });
    this.state.phase = Phase.Playing;
    console.log(`[street ${this.roomId}] start (${this.state.players.size} players)`);
  }

  /** Random point in the start zone, already pushed clear of obstacles, facing the Préfecture. */
  private placeAtSpawn(player: Player) {
    const spawn = spawnPoint(LEVEL, PLAYER_RADIUS);
    player.x = spawn.x;
    player.z = spawn.z;
    player.rotation = Math.PI;
  }

  private step(dt: number) {
    if (this.state.phase !== Phase.Playing) return;
    this.state.players.forEach((player, sessionId) => {
      const input = this.moveInputs.get(sessionId);
      if (!input || (input.x === 0 && input.z === 0)) return;
      // Move, then push out of obstacles and keep inside the street (slides along walls).
      const step = PLAYER_SPEED * dt;
      const next = moveCircle(WORLD, player, input.x * step, input.z * step, PLAYER_RADIUS);
      player.x = next.x;
      player.z = next.z;
      // Face the direction of travel (three.js: rotation.y = 0 looks down +Z).
      player.rotation = Math.atan2(input.x, input.z);
    });
  }
}
