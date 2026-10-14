// DEBUG ONLY. There are no hitters yet (melee is #4), so this lets a dev knock
// bodies over from the browser. Delete it once real hits exist.

import { HEAVY_IMPULSE, MAX_KNOCKBACK_SPEED, type DebugKnockbackPayload, type Vec2 } from "@manif/shared";

/** The debug message is only accepted when NODE_ENV is exactly "development" (bun run dev sets it); anything else, unset included, refuses it. */
export const DEBUG_KNOCKBACK_ENABLED = process.env.NODE_ENV === "development";

export interface DebugKnockbackPlan {
  targetId: string;
  dirX: number;
  dirZ: number;
  strength: number;
}

/**
 * Picks who to push and which way, from an untrusted payload.
 * - "self": pushed along your own facing (you dive forward).
 * - "nearest": the closest other body, pushed away from you.
 * Returns null if there is no target.
 */
export function planDebugKnockback(
  selfId: string,
  self: Vec2 & { rotation: number },
  others: Iterable<[string, Vec2]>,
  message: unknown,
): DebugKnockbackPlan | null {
  const m = (message ?? {}) as Partial<DebugKnockbackPayload>;
  const raw = Number(m.strength);
  const strength = Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_KNOCKBACK_SPEED) : HEAVY_IMPULSE;

  if (m.target !== "nearest") {
    return { targetId: selfId, dirX: Math.sin(self.rotation), dirZ: Math.cos(self.rotation), strength };
  }

  let best: { id: string; d: number; p: Vec2 } | null = null;
  for (const [id, p] of others) {
    if (id === selfId) continue;
    const d = Math.hypot(p.x - self.x, p.z - self.z);
    if (!best || d < best.d) best = { id, d, p };
  }
  if (!best) return null;
  // Dead on top of each other: push along our facing.
  const away = best.d > 1e-6;
  return {
    targetId: best.id,
    dirX: away ? best.p.x - self.x : Math.sin(self.rotation),
    dirZ: away ? best.p.z - self.z : Math.cos(self.rotation),
    strength,
  };
}
