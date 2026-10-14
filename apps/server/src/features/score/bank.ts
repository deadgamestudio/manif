import { isBotId } from "@manif/shared";

/** One protester at the end of a round, as the room sees them. */
export interface BankCandidate {
  /** Session id. */
  id: string;
  name: string;
  score: number;
  /** The hash of the device token they joined with; undefined for a bot. */
  hash: string | undefined;
}

/** What goes into the lasting totals for one device token. */
export interface BankEntry {
  hash: string;
  name: string;
  score: number;
}

/**
 * Who banks what at the end of a round (#41): every protester still in the
 * room, except bots (#59) and anyone without a token. Two tabs with the same
 * token in one room bank once, with the better of their two scores (and that
 * tab's name), so a second tab can't double a total.
 */
export function bankEntries(players: Iterable<BankCandidate>): BankEntry[] {
  const byHash = new Map<string, BankEntry>();
  for (const p of players) {
    if (isBotId(p.id) || !p.hash) continue;
    const seen = byHash.get(p.hash);
    if (!seen || p.score > seen.score) byHash.set(p.hash, { hash: p.hash, name: p.name, score: Math.max(0, Math.round(p.score)) });
  }
  return [...byHash.values()];
}
