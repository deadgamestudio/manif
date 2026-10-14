import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { LEADERBOARD_SIZE, type LeaderRow, type LeaderboardEvent } from "@manif/shared";
import type { BankEntry } from "./bank.js";

/** Where errors go. The room logs to the console; tests pass a quiet one. */
export interface StoreLog {
  info(message: string): void;
  error(message: string): void;
}

const CONSOLE_LOG: StoreLog = {
  info: (m) => console.log(m),
  error: (m) => console.error(m),
};

/**
 * One table, one row per device token (by its hash). `total` is indexed so the
 * top of the board and a rank lookup stay cheap however many rows there are.
 * `user_version` marks the schema; setting it is also the write probe at open.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  token_hash TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  rounds INTEGER NOT NULL DEFAULT 0,
  best_round INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS players_by_total ON players (total DESC);
PRAGMA user_version = 1;
`;

const UNAVAILABLE: LeaderboardEvent = { available: false, top: [], me: null };

/**
 * The lasting totals (#41), in SQLite through Node's built-in `node:sqlite`
 * (no native dependency in the distroless image). Synchronous, so the room
 * only writes once per round end (one small transaction) and on a rename,
 * and every read is bounded (top N, one rank count on an index).
 *
 * Never throws: a missing path, an unwritable directory, a read-only or
 * corrupt file all log an error and leave the store unavailable (or that one
 * call failed), and the game goes on with round-only scoring.
 */
export class ScoreStore {
  private constructor(
    private db: DatabaseSync | null,
    private readonly log: StoreLog,
  ) {}

  /** Opens (creating it if needed) the database at `path`. Unset path: lasting totals are off. */
  static open(path: string | undefined, log: StoreLog = CONSOLE_LOG): ScoreStore {
    if (!path) {
      log.info("[score] SCORE_DB_PATH is not set: lasting totals are off, round scores only");
      return new ScoreStore(null, log);
    }
    let db: DatabaseSync | null = null;
    try {
      if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
      db = new DatabaseSync(path);
      db.exec("PRAGMA busy_timeout = 2000;");
      db.exec(SCHEMA);
      log.info(`[score] lasting totals in ${path}`);
      return new ScoreStore(db, log);
    } catch (err) {
      log.error(`[score] cannot open ${path}, lasting totals are off (round scores only): ${describe(err)}`);
      try {
        db?.close();
      } catch {
        // already broken
      }
      return new ScoreStore(null, log);
    }
  }

  /** False when the database could not be opened: only round scores exist. */
  get available(): boolean {
    return this.db !== null;
  }

  /**
   * Adds each entry's round score to its token's total, in one transaction,
   * and remembers the latest name. Returns each token hash's new total, or
   * null if nothing could be written (nothing is, then: all or none).
   */
  bank(entries: readonly BankEntry[], now = Date.now()): Map<string, number> | null {
    const db = this.db;
    if (!db) return null;
    const totals = new Map<string, number>();
    if (entries.length === 0) return totals;
    try {
      const upsert = db.prepare(
        `INSERT INTO players (token_hash, name, total, rounds, best_round, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT (token_hash) DO UPDATE SET
           name = excluded.name,
           total = total + excluded.total,
           rounds = rounds + 1,
           best_round = max(best_round, excluded.best_round),
           updated_at = excluded.updated_at
         RETURNING total`,
      );
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const e of entries) {
          const row = upsert.get(e.hash, e.name, e.score, e.score, now, now);
          totals.set(e.hash, Number(row?.total ?? 0));
        }
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
      return totals;
    } catch (err) {
      this.log.error(`[score] could not bank ${entries.length} round score(s): ${describe(err)}`);
      return null;
    }
  }

  /**
   * The token's stored name follows a rename (#61), or a new name typed on the
   * home screen before a join. Only an existing row; true if there was one.
   */
  rename(hash: string, name: string, now = Date.now()): boolean {
    const db = this.db;
    if (!db) return false;
    try {
      const res = db.prepare("UPDATE players SET name = ?, updated_at = ? WHERE token_hash = ?").run(name, now, hash);
      return Number(res.changes) > 0;
    } catch (err) {
      this.log.error(`[score] could not update a name: ${describe(err)}`);
      return false;
    }
  }

  /**
   * The top `size` totals, best first (equal totals: fewer rounds first, then
   * whoever got there first), and the line of token `hash` wherever it ranks.
   * Equal totals share a rank.
   */
  leaderboard(hash: string | null, size = LEADERBOARD_SIZE): LeaderboardEvent {
    const db = this.db;
    if (!db) return UNAVAILABLE;
    try {
      const rows = db
        .prepare("SELECT name, total, rounds FROM players ORDER BY total DESC, rounds ASC, updated_at ASC, token_hash ASC LIMIT ?")
        .all(Math.max(0, Math.floor(size)));
      const top: LeaderRow[] = [];
      for (const [i, r] of rows.entries()) {
        const total = Number(r.total);
        const prev = top[i - 1];
        top.push({ rank: prev && prev.total === total ? prev.rank : i + 1, name: String(r.name), total, rounds: Number(r.rounds) });
      }
      let me: LeaderRow | null = null;
      if (hash) {
        const mine = db.prepare("SELECT name, total, rounds FROM players WHERE token_hash = ?").get(hash);
        if (mine) {
          const total = Number(mine.total);
          const above = db.prepare("SELECT count(*) AS n FROM players WHERE total > ?").get(total);
          me = { rank: Number(above?.n ?? 0) + 1, name: String(mine.name), total, rounds: Number(mine.rounds) };
        }
      }
      return { available: true, top, me };
    } catch (err) {
      this.log.error(`[score] could not read the leaderboard: ${describe(err)}`);
      return UNAVAILABLE;
    }
  }

  close(): void {
    try {
      this.db?.close();
    } catch {
      // closing a broken handle: nothing left to do
    }
    this.db = null;
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

let shared: ScoreStore | null = null;

/** The process-wide store, opened on first use from `SCORE_DB_PATH`. Every room shares it. */
export function scoreStore(): ScoreStore {
  shared ??= ScoreStore.open(process.env.SCORE_DB_PATH);
  return shared;
}
