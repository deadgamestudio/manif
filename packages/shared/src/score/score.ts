/**
 * Scoring rules (#41) as plain functions: points for an action, the floor at
 * 0, the end-of-round bonus, and who may have a lasting total at all.
 */
import type { RoundPlayerStats } from "../round/index.js";
import { ACTION_POINTS, ARRIVED_BONUS, SCORE_MAX, WIN_BONUS } from "./constants.js";

/**
 * Points for `amount` more of `stat` when the player had `before` this round.
 * Only the part under the stat's cap scores; a stat without a row scores 0.
 */
export function actionPoints(stat: keyof RoundPlayerStats, before: number, amount = 1): number {
  const row = ACTION_POINTS[stat];
  if (!row || !(amount > 0)) return 0;
  const counted = Math.max(0, Math.min(before + amount, row.cap) - Math.min(before, row.cap));
  return counted * row.points;
}

/** A round score after `points` (negative for an arrest): never below 0, never past the synced range. */
export function addPoints(score: number, points: number): number {
  return Math.max(0, Math.min(SCORE_MAX, Math.round(score + points)));
}

/** The end-of-round bonus: the win for everyone in the room, plus the Préfecture for those standing there free. */
export function endBonus(won: boolean, arrived: boolean): number {
  if (!won) return 0;
  return WIN_BONUS + (arrived ? ARRIVED_BONUS : 0);
}

/**
 * A device token (#41) as the server issues it: 32 random bytes in base64url,
 * 43 characters. Anything else sent on join is ignored and a fresh one issued.
 */
export function isDeviceToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** One line of the lasting leaderboard: names and numbers only, never a token. */
export interface LeaderRow {
  /** 1 for the best total; equal totals share a rank. */
  rank: number;
  name: string;
  total: number;
  /** Rounds banked, so a big total from many rounds reads as such. */
  rounds: number;
}

/** Payload of `ServerMessage.Leaderboard`, sent to one player: the top of the board and their own line. */
export interface LeaderboardEvent {
  /** False when the server has no working score storage: only round scores exist. */
  available: boolean;
  top: LeaderRow[];
  /** The receiving player's own line, even outside the top; null before their first banked round. */
  me: LeaderRow | null;
}

/** Payload of `ServerMessage.ScoreToken`, sent to one player: the device token to keep and send on every join. */
export interface ScoreTokenEvent {
  token: string;
}
