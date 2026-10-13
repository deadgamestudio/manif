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
  if (m.action === "clear") return { action: "clear" };
  if (m.action === "water") {
    const radius = Number((m as { radius?: unknown }).radius);
    return Number.isFinite(radius) ? { action: "water", radius: Math.max(0, Math.min(20, radius)) } : null;
  }
  if (m.action === "fallen") {
    const raw = m as { distance?: unknown; seconds?: unknown };
    const distance = Number(raw.distance);
    const seconds = Number(raw.seconds);
    if (!Number.isFinite(distance) || !Number.isFinite(seconds)) return null;
    return { action: "fallen", distance: Math.max(0, Math.min(10, distance)), seconds: Math.max(0.1, Math.min(30, seconds)) };
  }
  if (m.action === "crs") {
    const raw = m as { distance?: unknown; kind?: unknown; blend?: unknown };
    const distance = Number(raw.distance);
    if (!Number.isFinite(distance)) return null;
    const kind = Number(raw.kind);
    const blend = Number(raw.blend);
    return {
      action: "crs",
      distance: Math.max(0, Math.min(40, distance)),
      // #13: an unknown kind falls back to a CRS in the room.
      ...(raw.kind !== undefined && Number.isInteger(kind) && kind >= 0 && kind <= 255 && { kind }),
      ...(raw.blend !== undefined && Number.isFinite(blend) && { blend: Math.max(0, Math.min(60, blend)) }),
    };
  }
  if (m.action === "brigade") {
    const raw = m as { delay?: unknown; crew?: unknown; spray?: unknown; extra?: unknown; soak?: unknown };
    const num = (v: unknown, min: number, max: number) => {
      const n = Number(v);
      return v !== undefined && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : undefined;
    };
    const delay = num(raw.delay, 0, 120);
    const crew = num(raw.crew, 0, 4);
    const spray = num(raw.spray, 0, 1000);
    const extra = num(raw.extra, 0, 600);
    const soak = num(raw.soak, 0.01, 100);
    return {
      action: "brigade",
      ...(delay !== undefined && { delay }),
      ...(crew !== undefined && { crew: Math.round(crew) }),
      ...(spray !== undefined && { spray }),
      ...(extra !== undefined && { extra }),
      ...(soak !== undefined && { soak }),
    };
  }
  if (m.action === "time") {
    const seconds = Number(m.seconds);
    return Number.isFinite(seconds) ? { action: "time", seconds: Math.max(0, seconds) } : null;
  }
  return null;
}
