import { isBotId, roundAwards, type RoundAward, type RoundEndEvent } from "@manif/shared";

/** One protester on the end screen: who, what they marched as, their points and their awards. */
export interface Laureate {
  /** Session id: the key, since two players can share a name (#61). */
  id: string;
  name: string;
  archetype: number;
  isMe: boolean;
  /** The round's points (#41). */
  score: number;
  /** Their lasting total with this round banked (#41); undefined when it wasn't. */
  total: number | undefined;
  awards: RoundAward[];
  /** A bot protester (#59): listed after every human, marked, never on the podium, no award. */
  bot: boolean;
}

/**
 * Every protester of the round, ranked by round score (#41), best first; ties
 * keep the join order. The joke awards (#12) stay, grouped by player id. Bots
 * (#59) come after every human, ranked the same way among themselves.
 */
export function laureates(players: RoundEndEvent["players"], localId: string | null): Laureate[] {
  const awards = new Map<string, RoundAward[]>();
  for (const award of roundAwards(players)) {
    const list = awards.get(award.id);
    if (list) list.push(award);
    else awards.set(award.id, [award]);
  }
  return players
    .map((p, order) => ({
      order,
      laureate: {
        id: p.id,
        name: p.name,
        archetype: p.archetype ?? 0,
        isMe: p.id === localId,
        score: p.score ?? 0,
        total: p.total,
        awards: awards.get(p.id) ?? [],
        bot: p.bot === true || isBotId(p.id),
      },
    }))
    .sort((a, b) => Number(a.laureate.bot) - Number(b.laureate.bot) || b.laureate.score - a.laureate.score || a.order - b.order)
    .map((x) => x.laureate);
}
