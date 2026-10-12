import { useCallback, useRef, useSyncExternalStore } from "react";
import { DODGE_COOLDOWN } from "@manif/shared";
import { net } from "../../shared/net/index.ts";

const FIELDS = ["dodging"] as const;

/**
 * The dodge cooldown in the HUD (#9): a small bar that empties when a dodge
 * starts and refills over DODGE_COOLDOWN. It starts when the server says we
 * are dodging (so a refused press shows nothing), which is one round trip
 * after the key: it is ready a hair after the server's cooldown, never before.
 * A CSS animation does the refill, so React renders once per dodge.
 */
export function DodgeHud({ localId }: { localId: string | null }) {
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
  const started = useSyncExternalStore(subscribe, () => startedAt.current);

  return (
    <div className="hud-dodge">
      <div className="hud-dodge-bar" aria-hidden="true">
        {/* A new key restarts the refill animation on every dodge. */}
        <div
          key={started}
          className="hud-dodge-fill"
          data-cooling={started > 0 || undefined}
          style={{ animationDuration: `${DODGE_COOLDOWN}s` }}
        />
      </div>
      <span>Plongeon (Maj)</span>
    </div>
  );
}
