import { Room, type Client } from "@colyseus/core";
import {
  ClientMessage,
  MAP_HALF,
  MAX_PLAYERS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  TICK_RATE,
  clamp,
  normalizeMove,
  type MoveInput,
} from "@manif/shared";
import { Player, StreetState } from "../state.js";

const BOUND = MAP_HALF - PLAYER_RADIUS;

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
    // Spawn near the centre, spread a little so capsules don't overlap.
    player.x = (Math.random() - 0.5) * 6;
    player.z = (Math.random() - 0.5) * 6;
    player.rotation = 0;
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
      player.x = clamp(player.x + input.x * PLAYER_SPEED * dt, -BOUND, BOUND);
      player.z = clamp(player.z + input.z * PLAYER_SPEED * dt, -BOUND, BOUND);
      // Face the direction of travel (three.js: rotation.y = 0 looks down +Z).
      player.rotation = Math.atan2(input.x, input.z);
    });
  }
}
