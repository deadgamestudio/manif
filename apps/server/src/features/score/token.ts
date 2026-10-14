import { createHash, randomBytes } from "node:crypto";

/**
 * Device tokens (#41): an anonymous, random secret per browser. The client
 * keeps it in localStorage and sends it on join; the lasting total belongs to
 * it. The server keeps only its hash (in memory per session, and as the
 * database key): never in Schema, a broadcast, the leaderboard or a log.
 */

/** A fresh token: 32 random bytes, base64url (43 characters, see `isDeviceToken`). */
export function newDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * What the server stores instead of the token: its SHA-256, hex. The token is
 * 256 random bits, so a plain hash is enough (no salt, nothing to brute-force).
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
