// DEBUG ONLY (#2). There are no hitters until melee (#4), so in dev builds a
// few keys knock bodies over to see knockback. Mounted only when
// import.meta.env.DEV, and the server refuses the message in production.

import { useEffect } from "react";
import { LIGHT_IMPULSE, type DebugKnockbackPayload } from "@manif/shared";
import { net } from "../../shared/net/index.ts";

const KEYS: Record<string, DebugKnockbackPayload> = {
  /** Heavy hit on yourself: you fly forward and fall. */
  KeyK: { target: "self" },
  /** Light hit on yourself: a push, no fall. */
  KeyJ: { target: "self", strength: LIGHT_IMPULSE },
  /** Heavy hit on the nearest other player, away from you. */
  KeyL: { target: "nearest" },
};

export function DebugKnockbackKeys() {
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const payload = KEYS[e.code];
      if (!payload || e.repeat) return;
      e.preventDefault();
      net.debugKnockback(payload);
    };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, []);

  return <div className="hud-debug">debug : K te renverse · J te pousse · L renverse le plus proche</div>;
}
