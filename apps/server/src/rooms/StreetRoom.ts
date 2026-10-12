import { Room, type Client } from "@colyseus/core";
import {
  ClientMessage,
  MAX_PLAYERS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  STREET_LEVEL,
  TICK_RATE,
  levelWorld,
  moveCircle,
  normalizeMove,
  spawnPoint,
  type MoveInput,
} from "@manif/shared";
import { Player, StreetState } from "../state.js";

// The level is static shared data, imported by the client too. It is not synced.
const LEVEL = STREET_LEVEL;
const WORLD = levelWorld(LEVEL);

export class StreetRoom extends Room<{ state: StreetState }> {
  /** Latest move direction per session. Server-only, not synced. */
  private moveInputs = new Map<string, MoveInput>();

  override maxClients = MAX_PLAYERS;
  override state = new StreetState();

  override messages = {
    // Input only: the client says where it wants to go, the server moves it.
    // Re-normalize so a tampered client can't move faster than PLAYER_SPEED.
    [ClientMessage.Move]: (client: Client, message: unknown) => {
      const m = (message ?? {}) as Partial<MoveInput>;
      this.moveInputs.set(client.sessionId, normalizeMove(Number(m.x), Number(m.z)));
    },
  };

  override onCreate() {
    this.setFixedTimestep((ctx) => this.step(ctx.dt), TICK_RATE);
  }

  override onJoin(client: Client) {
    const player = new Player();
    // Random point in the start zone, already pushed clear of obstacles.
    const spawn = spawnPoint(LEVEL, PLAYER_RADIUS);
    player.x = spawn.x;
    player.z = spawn.z;
    // Face down the street, towards the Préfecture.
    player.rotation = Math.PI;
    this.state.players.set(client.sessionId, player);
    this.moveInputs.set(client.sessionId, { x: 0, z: 0 });
    console.log(`[street ${this.roomId}] join ${client.sessionId} (${this.clients.length}/${MAX_PLAYERS})`);
  }

  override onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.moveInputs.delete(client.sessionId);
    console.log(`[street ${this.roomId}] leave ${client.sessionId}`);
  }

  private step(dt: number) {
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
