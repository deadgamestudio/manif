import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeviceToken } from "@manif/shared";
import { ScoreStore, bankEntries, hashToken, newDeviceToken, type StoreLog } from "./index.js";

const dir = mkdtempSync(join(tmpdir(), "manif-score-"));
afterAll(() => {
  chmodSync(dir, 0o755);
  rmSync(dir, { recursive: true, force: true });
});

/** A logger that remembers instead of printing. */
function quiet(): StoreLog & { errors: string[] } {
  const errors: string[] = [];
  return { errors, info: () => undefined, error: (m) => errors.push(m) };
}

let n = 0;
const fresh = () => ScoreStore.open(join(dir, `db-${n++}`, "scores.db"), quiet());

describe("device tokens", () => {
  test("a new token has the shape the join checks, and is different every time", () => {
    const a = newDeviceToken();
    expect(isDeviceToken(a)).toBe(true);
    expect(newDeviceToken()).not.toBe(a);
  });

  test("only the hash is kept: stable, and not the token", () => {
    const t = newDeviceToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("bankEntries", () => {
  test("bots and players without a token never bank", () => {
    const entries = bankEntries([
      { id: "bot:1", name: "Robot", score: 500, hash: "h-bot" },
      { id: "s1", name: "Alice", score: 40, hash: "h1" },
      { id: "s2", name: "Ghost", score: 40, hash: undefined },
    ]);
    expect(entries).toEqual([{ hash: "h1", name: "Alice", score: 40 }]);
  });

  test("two tabs with one token bank once, the better score", () => {
    const entries = bankEntries([
      { id: "s1", name: "Alice", score: 40, hash: "h1" },
      { id: "s2", name: "Alice 2", score: 90, hash: "h1" },
      { id: "s3", name: "Bob", score: 10, hash: "h2" },
    ]);
    expect(entries).toEqual([
      { hash: "h1", name: "Alice 2", score: 90 },
      { hash: "h2", name: "Bob", score: 10 },
    ]);
  });
});

describe("ScoreStore", () => {
  test("a total grows by exactly each banked round, and survives a reopen", () => {
    const path = join(dir, "reopen", "scores.db");
    const a = ScoreStore.open(path, quiet());
    expect(a.available).toBe(true);
    expect(a.bank([{ hash: "h1", name: "Alice", score: 120 }])?.get("h1")).toBe(120);
    expect(a.bank([{ hash: "h1", name: "Alice", score: 30 }])?.get("h1")).toBe(150);
    a.close();
    const b = ScoreStore.open(path, quiet());
    expect(b.leaderboard("h1").me).toEqual({ rank: 1, name: "Alice", total: 150, rounds: 2 });
    b.close();
  });

  test("a round of 0 still counts as a round played", () => {
    const s = fresh();
    s.bank([{ hash: "h1", name: "Alice", score: 0 }]);
    expect(s.leaderboard("h1").me).toEqual({ rank: 1, name: "Alice", total: 0, rounds: 1 });
  });

  test("an unknown token has no line, and a token never appears anywhere", () => {
    const s = fresh();
    const token = newDeviceToken();
    s.bank([{ hash: hashToken(token), name: "Alice", score: 10 }]);
    const board = s.leaderboard(hashToken(newDeviceToken()));
    expect(board.me).toBeNull();
    const text = JSON.stringify(s.leaderboard(hashToken(token)));
    expect(text).not.toContain(token);
    expect(text).not.toContain(hashToken(token));
  });

  test("ordering: best total first; equal totals share a rank, fewer rounds listed first", () => {
    const s = fresh();
    s.bank([
      { hash: "a", name: "A", score: 100 },
      { hash: "b", name: "B", score: 300 },
      { hash: "c", name: "C", score: 50 },
    ], 1);
    s.bank([{ hash: "c", name: "C", score: 50 }], 2);
    s.bank([{ hash: "d", name: "D", score: 100 }], 3);
    const top = s.leaderboard(null).top;
    expect(top.map((r) => [r.rank, r.name, r.total, r.rounds])).toEqual([
      [1, "B", 300, 1],
      [2, "A", 100, 1],
      [2, "D", 100, 1],
      [2, "C", 100, 2],
    ]);
  });

  test("the top is bounded, and my rank shows even when I'm outside it", () => {
    const s = fresh();
    s.bank(Array.from({ length: 30 }, (_, i) => ({ hash: `h${i}`, name: `P${i}`, score: 1000 - i * 10 })));
    const board = s.leaderboard("h27", 20);
    expect(board.top.length).toBe(20);
    expect(board.top[0]?.name).toBe("P0");
    expect(board.me).toEqual({ rank: 28, name: "P27", total: 730, rounds: 1 });
  });

  test("the stored name follows a rename, only for a token that has a row", () => {
    const s = fresh();
    s.bank([{ hash: "h1", name: "Alice", score: 10 }]);
    expect(s.rename("h1", "Alice la Rouge")).toBe(true);
    expect(s.rename("nobody", "Bob")).toBe(false);
    expect(s.leaderboard(null).top.map((r) => r.name)).toEqual(["Alice la Rouge"]);
  });

  test("banking several players is all or nothing", () => {
    const s = fresh();
    expect(s.bank([])?.size).toBe(0);
    const totals = s.bank([
      { hash: "h1", name: "A", score: 10 },
      { hash: "h2", name: "B", score: 20 },
    ]);
    expect([...(totals ?? new Map())]).toEqual([
      ["h1", 10],
      ["h2", 20],
    ]);
  });
});

describe("ScoreStore when storage is broken: never throws, round-only scoring", () => {
  test("no path configured: off, quietly", () => {
    const log = quiet();
    const s = ScoreStore.open(undefined, log);
    expect(s.available).toBe(false);
    expect(s.bank([{ hash: "h1", name: "A", score: 10 }])).toBeNull();
    expect(s.leaderboard("h1")).toEqual({ available: false, top: [], me: null });
    expect(s.rename("h1", "B")).toBe(false);
    expect(log.errors).toEqual([]);
  });

  test("a corrupt file: logged, off", () => {
    const path = join(dir, "corrupt.db");
    writeFileSync(path, "this is not a database, it is a placard ".repeat(200));
    const log = quiet();
    const s = ScoreStore.open(path, log);
    expect(s.available).toBe(false);
    expect(s.bank([{ hash: "h1", name: "A", score: 10 }])).toBeNull();
    expect(log.errors.length).toBe(1);
  });

  test("a directory nobody can write to: logged, off", () => {
    if (process.getuid?.() === 0) return; // root writes anywhere
    const locked = join(dir, "locked");
    mkdirSync(locked);
    chmodSync(locked, 0o500);
    const log = quiet();
    const s = ScoreStore.open(join(locked, "sub", "scores.db"), log);
    expect(s.available).toBe(false);
    expect(log.errors.length).toBe(1);
    chmodSync(locked, 0o755);
  });

  test("a read-only database file: logged, off (the write probe at open fails)", () => {
    if (process.getuid?.() === 0) return;
    const path = join(dir, "readonly", "scores.db");
    const first = ScoreStore.open(path, quiet());
    first.bank([{ hash: "h1", name: "A", score: 10 }]);
    first.close();
    chmodSync(path, 0o400);
    const log = quiet();
    const s = ScoreStore.open(path, log);
    expect(s.available).toBe(false);
    expect(log.errors.length).toBe(1);
    chmodSync(path, 0o600);
  });

  test("a database that breaks after opening: the bank fails, logged, and nothing throws", () => {
    const log = quiet();
    const s = ScoreStore.open(join(dir, "breaks", "scores.db"), log);
    expect(s.available).toBe(true);
    // Simulate a disk that went away: the handle is closed under the store's feet.
    (s as unknown as { db: { close(): void } }).db.close();
    expect(s.bank([{ hash: "h1", name: "A", score: 10 }])).toBeNull();
    expect(s.leaderboard("h1").available).toBe(false);
    expect(s.rename("h1", "B")).toBe(false);
    expect(log.errors.length).toBe(3);
  });
});
