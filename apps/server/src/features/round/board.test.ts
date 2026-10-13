import { describe, expect, test } from "bun:test";
import { emptyStats, type RoundPlayerRow } from "@manif/shared";
import { BOARD_INTERVAL, IDLE_BOARD, boardKey, stepBoard, type BoardThrottle } from "./board.js";

const row = (id: string, stats: Partial<ReturnType<typeof emptyStats>> = {}): RoundPlayerRow => ({
  id,
  name: id,
  archetype: 0,
  ...emptyStats(),
  ...stats,
});

/** Runs the throttle over 20 Hz ticks; `rowsAt(t)` gives the rows at time t. Returns the send times. */
function run(until: number, rowsAt: (t: number) => RoundPlayerRow[], marchingAt: (t: number) => boolean = () => true): number[] {
  let s: BoardThrottle = IDLE_BOARD;
  const sent: number[] = [];
  for (let i = 0; i <= until * 20; i++) {
    const t = i / 20;
    const r = stepBoard(s, marchingAt(t), t, boardKey(rowsAt(t)));
    s = r.next;
    if (r.send) sent.push(t);
  }
  return sent;
}

describe("stepBoard", () => {
  test("sends the first board of a march straight away", () => {
    expect(stepBoard(IDLE_BOARD, true, 12.3, boardKey([row("a")])).send).toBe(true);
  });

  test("silent while nothing changes", () => {
    expect(run(10, () => [row("a"), row("b")])).toEqual([0]);
  });

  test("never more than once a second, even when counts move every tick", () => {
    const sent = run(5, (t) => [row("a", { crsOut: Math.round(t * 20) })]);
    expect(sent.length).toBe(6);
    for (let i = 1; i < sent.length; i++) expect((sent[i] ?? 0) - (sent[i - 1] ?? 0)).toBeGreaterThanOrEqual(BOARD_INTERVAL);
  });

  test("a change is sent on the first tick it is allowed", () => {
    // A CRS floored at 3.2 s, long after the last send: it goes out on that tick.
    expect(run(6, (t) => [row("a", { crsOut: t >= 3.2 ? 1 : 0 })])).toEqual([0, 3.2]);
  });

  test("a change that comes too soon waits for the second to run out", () => {
    expect(run(3, (t) => [row("a", { rescues: t >= 0.3 ? 1 : 0 })])).toEqual([0, 1]);
  });

  test("a joiner or a leaver changes the board", () => {
    expect(run(4, (t) => (t >= 2 ? [row("a"), row("b")] : [row("a")]))).toEqual([0, 2]);
  });

  test("nothing outside the march, and the next march opens with a fresh board", () => {
    const marching = (t: number) => t < 2 || t >= 4;
    // 0: first board; 1: the arrest; nothing while not marching; 4: the next march's first board though nothing changed.
    expect(run(5, (t) => [row("a", { arrests: t >= 1 ? 1 : 0 })], marching)).toEqual([0, 1, 4]);
    expect(stepBoard({ sentAt: 0, sentKey: "x" }, false, 0.5, "y")).toEqual({
      send: false,
      next: IDLE_BOARD,
    });
  });
});
