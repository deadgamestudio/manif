import { roundAwards, type RoundAward, type RoundEndEvent } from "@manif/shared";

/** One protester on the podium: who, what they marched as, and their awards. */
export interface Laureate {
  /** Session id: the key, since two players can share a name (#61). */
  id: string;
  name: string;
  archetype: number;
  isMe: boolean;
  awards: RoundAward[];
}

/**
 * The awards grouped by protester (by id, not name), most awarded first (ties
 * keep the join order). The archetype comes from the round's player list.
 */
export function laureates(players: RoundEndEvent["players"], localId: string | null): Laureate[] {
  const byId = new Map<string, Laureate>();
  for (const award of roundAwards(players)) {
    let l = byId.get(award.id);
    if (!l) {
      const p = players.find((q) => q.id === award.id);
      l = { id: award.id, name: award.name, archetype: p?.archetype ?? 0, isMe: award.id === localId, awards: [] };
      byId.set(award.id, l);
    }
    l.awards.push(award);
  }
  const order = (id: string) => players.findIndex((p) => p.id === id);
  return [...byId.values()].sort((a, b) => b.awards.length - a.awards.length || order(a.id) - order(b.id));
}
