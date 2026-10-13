import { describe, expect, test } from "bun:test";
import { PlayerStatus, emptyStats } from "@manif/shared";
import { BOARD_COLUMNS, boardRows, statusLabel } from "./board.ts";

const lobby = [
  { id: "a", name: "Josiane", archetype: 0 },
  { id: "b", name: "Josiane", archetype: 2 },
  { id: "c", name: "Gégé", archetype: 1 },
];

describe("boardRows", () => {
  test("one row per player in room order, counts matched by id even when names clash", () => {
    const board = {
      players: [
        { id: "b", name: "Josiane", archetype: 2, ...emptyStats(), crsOut: 3 },
        { id: "a", name: "Josiane", archetype: 0, ...emptyStats(), rescues: 1 },
      ],
    };
    const rows = boardRows(lobby, board, "b");
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(rows[0]?.stats.rescues).toBe(1);
    expect(rows[0]?.stats.crsOut).toBe(0);
    expect(rows[1]?.stats.crsOut).toBe(3);
    expect(rows.map((r) => r.isMe)).toEqual([false, true, false]);
  });

  test("a player the board doesn't know yet, or no board at all, shows zeros", () => {
    expect(boardRows(lobby, { players: [] }, null)[2]?.stats).toEqual(emptyStats());
    expect(boardRows(lobby, null, "a").every((r) => r.stats.arrests === 0)).toBe(true);
  });

  test("only the room's players: a row for someone who left is dropped", () => {
    const board = {
      players: [{ id: "gone", name: "X", archetype: 0, ...emptyStats(), crsOut: 9 }],
    };
    expect(boardRows(lobby.slice(0, 1), board, null).map((r) => r.id)).toEqual(["a"]);
  });
});

describe("statusLabel", () => {
  test("says what the synced status is", () => {
    expect(statusLabel(PlayerStatus.Free).text).toBe("Libre");
    expect(statusLabel(PlayerStatus.Grabbed).text).toBe("Chopé·e");
    expect(statusLabel(PlayerStatus.Ko).text).toBe("KO");
    expect(statusLabel(PlayerStatus.Arrested).text).toBe("Embarqué·e");
  });
});

test("the board shows the four counts the issue names", () => {
  expect(BOARD_COLUMNS.map((c) => c.stat)).toEqual(["crsOut", "rescues", "propsBroken", "arrests"]);
});
