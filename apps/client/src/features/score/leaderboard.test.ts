import { describe, expect, test } from "bun:test";
import type { LeaderboardEvent } from "@manif/shared";
import { leaderLines, points, rounds } from "./leaderboard.ts";

const row = (rank: number, name: string, total: number, n = 1) => ({ rank, name, total, rounds: n });

describe("leaderLines", () => {
  test("nothing while unavailable or not received", () => {
    expect(leaderLines(null)).toEqual([]);
    expect(leaderLines({ available: false, top: [], me: null })).toEqual([]);
  });

  test("my line is marked when I'm in the top", () => {
    const board: LeaderboardEvent = { available: true, top: [row(1, "A", 300), row(2, "B", 200)], me: row(2, "B", 200) };
    expect(leaderLines(board).map((l) => [l.name, l.isMe, l.outside])).toEqual([
      ["A", false, false],
      ["B", true, false],
    ]);
  });

  test("outside the top, my line comes after it", () => {
    const board: LeaderboardEvent = { available: true, top: [row(1, "A", 300)], me: row(37, "Moi", 20, 3) };
    expect(leaderLines(board).map((l) => [l.rank, l.name, l.isMe, l.outside])).toEqual([
      [1, "A", false, false],
      [37, "Moi", true, true],
    ]);
  });

  test("a namesake with the same rank and total is only marked once", () => {
    const board: LeaderboardEvent = { available: true, top: [row(1, "Gérard", 100), row(1, "Gérard", 100)], me: row(1, "Gérard", 100) };
    expect(leaderLines(board).filter((l) => l.isMe).length).toBe(1);
  });

  test("no line of my own before my first banked round", () => {
    expect(leaderLines({ available: true, top: [row(1, "A", 300)], me: null }).length).toBe(1);
  });
});

describe("wording", () => {
  test("points and rounds", () => {
    expect(points(0)).toBe("0 pt");
    expect(points(1)).toBe("1 pt");
    expect(points(60)).toBe("60 pts");
    expect(points(1240).replace(/\s/g, " ")).toBe("1 240 pts");
    expect(rounds(1)).toBe("1 manif");
    expect(rounds(4)).toBe("4 manifs");
  });
});
