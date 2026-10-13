import { useCallback, useRef, useSyncExternalStore } from "react";
import { DODGE_COOLDOWN } from "@manif/shared";
import { net } from "../../shared/net/index.ts";

const FIELDS = ["dodging"] as const;

/**
 * When the local player's last dodge started (performance.now()), 0 before the
 * first one. It starts when the server says we are dodging (so a refused press
 * shows nothing), which is one round trip after the press: the cooldown shown
 * ends a hair after the server's, never before.
 */
export function useDodgeStart(localId: string | null): number {
  const startedAt = useRef(0);
  const subscribe = useCallback(
    (listener: () => void) =>
      localId
        ? net.watchPlayer(localId, FIELDS, () => {
            if (net.getPlayer(localId)?.dodging) startedAt.current = performance.now();
            listener();
          })
        : () => undefined,
    [localId],
  );
  return useSyncExternalStore(subscribe, () => startedAt.current);
}

/**
 * The bar's fill: empties when a dodge starts and refills over DODGE_COOLDOWN.
 * A CSS animation does the refill, so React renders once per dodge. Shared by
 * the HUD and the touch Esquive button (#42).
 */
export function DodgeCooldownFill({ started }: { started: number }) {
  return (
    // A new key restarts the refill animation on every dodge.
    <div
      key={started}
      className="hud-dodge-fill"
      data-cooling={started > 0 || undefined}
      style={{ animationDuration: `${DODGE_COOLDOWN}s` }}
    />
  );
}

/**
 * The dodge cooldown in the HUD (#9): a small bar that empties when a dodge
 * starts and refills over DODGE_COOLDOWN. Named after the button on touch.
 */
export function DodgeHud({ localId, touch = false }: { localId: string | null; touch?: boolean }) {
  const started = useDodgeStart(localId);
  return (
    <div className="hud-dodge">
      <div className="hud-dodge-bar" aria-hidden="true">
        <DodgeCooldownFill started={started} />
      </div>
      <span>{touch ? "Esquive" : "Plongeon (Maj)"}</span>
    </div>
  );
}
