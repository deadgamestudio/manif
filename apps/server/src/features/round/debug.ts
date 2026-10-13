// DEBUG ONLY (#12): a full march takes minutes, so in dev builds a client can
// jump down the street or cut the round timer to test waves, the win and the
// timeout, or hold the round open so scripted tests of other features are not
// cut short by a win or a loss. Never accepted in production.

import type { DebugRoundPayload } from "@manif/shared";

/** The debug message is only accepted outside production. */
export const DEBUG_ROUND_ENABLED = process.env.NODE_ENV !== "production";

/** Reads the untrusted payload. Null if it is not a known action with a finite number. */
export function parseDebugRound(message: unknown): DebugRoundPayload | null {
  const m = (message ?? {}) as { action?: unknown; progress?: unknown; seconds?: unknown };
  if (m.action === "teleport") {
    const progress = Number(m.progress);
    return Number.isFinite(progress) ? { action: "teleport", progress: Math.max(0, Math.min(1, progress)) } : null;
  }
  if (m.action === "hold") return { action: "hold" };
  if (m.action === "calm") return { action: "calm" };
  if (m.action === "water") {
    const radius = Number((m as { radius?: unknown }).radius);
    return Number.isFinite(radius) ? { action: "water", radius: Math.max(0, Math.min(20, radius)) } : null;
  }
  if (m.action === "time") {
    const seconds = Number(m.seconds);
    return Number.isFinite(seconds) ? { action: "time", seconds: Math.max(0, seconds) } : null;
  }
  return null;
}
