import { BOT_ID_PREFIX, createBotMind, type Body, type BotMind } from "@manif/shared";

/**
 * The bot protesters' heads (#59), by player id. Server-only: a bot is
 * otherwise an ordinary entry in `state.players`, with every per-id map the
 * room keeps for a player. The room adds one per empty seat at the start of a
 * march and removes them all at its end (or one when a human joins mid-march),
 * through `StreetRoom.removePlayer` like any player who leaves.
 */
export class Bots {
  private readonly minds = new Map<string, BotMind>();
  private counter = 0;

  get size(): number {
    return this.minds.size;
  }

  /** A fresh bot id: the shared prefix (never a Colyseus session id, see `isBotId`) and a counter. */
  nextId(): string {
    return `${BOT_ID_PREFIX}${++this.counter}`;
  }

  add(id: string, body: Readonly<Body>, now: number): BotMind {
    const mind = createBotMind(id, body, now);
    this.minds.set(id, mind);
    return mind;
  }

  get(id: string): BotMind | undefined {
    return this.minds.get(id);
  }

  remove(id: string): void {
    this.minds.delete(id);
  }

  ids(): string[] {
    return [...this.minds.keys()];
  }

  all(): IterableIterator<BotMind> {
    return this.minds.values();
  }
}
