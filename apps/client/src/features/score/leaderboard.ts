/**
 * The lasting leaderboard (#41) as plain data for the lobby placard: the top
 * lines from the server, mine marked, and my own line added under them when I
 * rank lower. Names and numbers only: the server never sends a token.
 */
import type { LeaderRow, LeaderboardEvent } from "@manif/shared";

export interface LeaderLine extends LeaderRow {
  isMe: boolean;
  /** My own line, shown after a gap because I'm outside the top. */
  outside: boolean;
}

const same = (a: LeaderRow, b: LeaderRow) => a.rank === b.rank && a.name === b.name && a.total === b.total && a.rounds === b.rounds;

export function leaderLines(board: LeaderboardEvent | null): LeaderLine[] {
  if (!board?.available) return [];
  const me = board.me;
  let found = false;
  const lines = board.top.map((r) => {
    const isMe = !found && me !== null && same(r, me);
    if (isMe) found = true;
    return { ...r, isMe, outside: false };
  });
  if (me && !found) lines.push({ ...me, isMe: true, outside: true });
  return lines;
}

/** "1 240 pts": French digit groups, and "pt" for 0 and 1. */
export function points(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} ${Math.abs(n) > 1 ? "pts" : "pt"}`;
}

/** "3 manifs" next to a total, so a big total from many rounds reads as such. */
export function rounds(n: number): string {
  return `${n} ${n > 1 ? "manifs" : "manif"}`;
}
