import { actionPoints, addPoints, emptyStats, type RoundPlayerStats } from "@manif/shared";

/**
 * Per-player numbers for the end screen (#12) and the round score (#41).
 * Server-only: the counts go out in ServerMessage.RoundEnd and RoundBoard,
 * never in Schema; the score is also synced as `Player.score` through
 * `onScore`. Cleared when a march starts.
 */
export class RoundStats {
  private readonly stats = new Map<string, RoundPlayerStats>();
  private readonly scores = new Map<string, number>();

  /** `onScore(id, score)` runs whenever a player's round score changes. */
  constructor(private readonly onScore: (id: string, score: number) => void = () => undefined) {}

  /**
   * Add `amount` (default one) to `stat` for player `id` (creating their row on
   * first use), and score it by the shared points table: capped per round,
   * never below 0.
   */
  add(id: string, stat: keyof RoundPlayerStats, amount = 1): void {
    let s = this.stats.get(id);
    if (!s) {
      s = emptyStats();
      this.stats.set(id, s);
    }
    const before = s[stat];
    s[stat] += amount;
    this.addScore(id, actionPoints(stat, before, amount));
  }

  /** Points not tied to a counted action: the end-of-round bonus (#41). */
  bonus(id: string, points: number): void {
    this.addScore(id, points);
  }

  get(id: string): RoundPlayerStats {
    return this.stats.get(id) ?? emptyStats();
  }

  /** Player `id`'s round score so far, 0 if they did nothing that counts. */
  score(id: string): number {
    return this.scores.get(id) ?? 0;
  }

  remove(id: string): void {
    this.stats.delete(id);
    this.scores.delete(id);
  }

  clear(): void {
    this.stats.clear();
    this.scores.clear();
  }

  private addScore(id: string, points: number): void {
    if (points === 0) return;
    const before = this.score(id);
    const after = addPoints(before, points);
    this.scores.set(id, after);
    if (after !== before) this.onScore(id, after);
  }
}
