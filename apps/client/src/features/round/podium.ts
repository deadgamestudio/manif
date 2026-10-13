import { roundAwards, type RoundAward, type RoundEndEvent } from "@manif/shared";

/** One protester on the podium: who, what they marched as, and their awards. */
export interface Laureate {
  name: string;
  archetype: number;
  isMe: boolean;
  awards: RoundAward[];
}

/**
 * The awards grouped by protester, most awarded first (ties keep the join
 * order). Awards name their winner; the archetype comes from the round's
 * player list by that name.
 */
export function laureates(players: RoundEndEvent["players"], localId: string | null): Laureate[] {
  const byName = new Map<string, Laureate>();
  for (const award of roundAwards(players)) {
    let l = byName.get(award.name);
    if (!l) {
      const p = players.find((q) => q.name === award.name);
      l = { name: award.name, archetype: p?.archetype ?? 0, isMe: !!p && p.id === localId, awards: [] };
      byName.set(award.name, l);
    }
    l.awards.push(award);
  }
  const order = (name: string) => players.findIndex((p) => p.name === name);
  return [...byName.values()].sort((a, b) => b.awards.length - a.awards.length || order(a.name) - order(b.name));
}
