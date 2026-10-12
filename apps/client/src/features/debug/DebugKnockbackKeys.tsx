// DEBUG ONLY (#2, #3). There are no hitters until melee (#4) and CRS (#5), so
// in dev builds a few keys knock bodies over, hurt you or grab you. Mounted only when
// import.meta.env.DEV, and the server refuses the message in production.

import { useEffect } from "react";
import { DEBUG_DAMAGE, LIGHT_IMPULSE, type DebugHealthPayload, type DebugKnockbackPayload } from "@manif/shared";
import { net } from "../../shared/net/index.ts";

const KEYS: Record<string, DebugKnockbackPayload> = {
  /** Heavy hit on yourself: you fly forward and fall. */
  KeyK: { target: "self" },
  /** Light hit on yourself: a push, no fall. */
  KeyJ: { target: "self", strength: LIGHT_IMPULSE },
  /** Heavy hit on the nearest other player, away from you. */
  KeyL: { target: "nearest" },
};

const HEALTH_KEYS: Record<string, DebugHealthPayload> = {
  /** Lose DEBUG_DAMAGE HP; four of them and you are KO, then arrested. */
  KeyH: { action: "damage" },
  /** Get grabbed: dragged, then arrested. */
  KeyG: { action: "grab" },
};

export function DebugKnockbackKeys() {
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const knock = KEYS[e.code];
      const health = HEALTH_KEYS[e.code];
      if (!knock && !health) return;
      e.preventDefault();
      if (knock) net.debugKnockback(knock);
      if (health) net.debugHealth(health);
    };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, []);

  return (
    <div className="hud-debug">
      debug : K te renverse · J te pousse · L renverse le plus proche · H te blesse (−{DEBUG_DAMAGE}) · G te fait
      attraper
    </div>
  );
}
