import { emptyStats, type RoundPlayerStats } from "@manif/shared";

/**
 * Per-player numbers for the end screen (#12). Server-only: sent once in
 * ServerMessage.RoundEnd, never in Schema. Cleared when a march starts.
 */
export class RoundStats {
  private readonly stats = new Map<string, RoundPlayerStats>();

  /** Add one to `stat` for player `id` (creating their row on first use). */
  add(id: string, stat: keyof RoundPlayerStats): void {
    let s = this.stats.get(id);
    if (!s) {
      s = emptyStats();
      this.stats.set(id, s);
    }
    s[stat]++;
  }

  get(id: string): RoundPlayerStats {
    return this.stats.get(id) ?? emptyStats();
  }

  remove(id: string): void {
    this.stats.delete(id);
  }

  clear(): void {
    this.stats.clear();
  }
}
