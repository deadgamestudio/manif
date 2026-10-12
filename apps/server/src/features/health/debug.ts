// DEBUG ONLY (#3). Nothing hurts or grabs protesters yet (melee is #4, CRS #5),
// so in dev builds a key hurts or grabs yourself. Delete once real hitters exist.

import type { DebugHealthPayload } from "@manif/shared";

/** The debug message is only accepted outside production. */
export const DEBUG_HEALTH_ENABLED = process.env.NODE_ENV !== "production";

/** Reads the untrusted payload. Null if it is not a known action. */
export function parseDebugHealth(message: unknown): DebugHealthPayload["action"] | null {
  const action = (message as Partial<DebugHealthPayload> | null)?.action;
  return action === "damage" || action === "grab" ? action : null;
}
