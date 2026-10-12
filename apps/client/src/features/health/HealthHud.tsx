import { useCallback, useSyncExternalStore } from "react";
import { MAX_HP, PlayerStatus } from "@manif/shared";
import { net } from "../../shared/net/index.ts";

const FIELDS = ["hp", "status", "stateLeft"] as const;

/** One line for the local player's state, goofy rather than grim. */
function describe(status: number, left: number): string {
  switch (status) {
    case PlayerStatus.Grabbed:
      return `Attrapé·e ! Direction le panier à salade dans ${left} s`;
    case PlayerStatus.Ko:
      return "K.O. ! Tu vois des étoiles…";
    case PlayerStatus.Arrested:
      return `Embarqué·e. Retour dans la manif dans ${left} s`;
    default:
      return "";
  }
}

/**
 * The local player's HP bar and state, in the HUD (#3). Re-renders only when
 * hp, status or the countdown change, never per frame.
 */
export function HealthHud({ localId }: { localId: string | null }) {
  const subscribe = useCallback(
    (listener: () => void) => (localId ? net.watchPlayer(localId, FIELDS, listener) : () => undefined),
    [localId],
  );
  // A primitive snapshot, so React only re-renders when one of the three changes.
  const key = useSyncExternalStore(subscribe, () => {
    const p = localId ? net.getPlayer(localId) : undefined;
    return p ? `${p.hp}|${p.status}|${p.stateLeft}` : "";
  });
  if (!key) return null;
  const [hp = 0, status = 0, left = 0] = key.split("|").map(Number);
  const ratio = Math.max(0, Math.min(1, hp / MAX_HP));
  const label = describe(status, left);

  return (
    <div className="hud-health">
      <div className="hud-hp" role="meter" aria-label="Points de vie" aria-valuemin={0} aria-valuemax={MAX_HP} aria-valuenow={hp}>
        <div className="hud-hp-fill" style={{ width: `${ratio * 100}%` }} data-low={ratio <= 0.3 || undefined} />
        <span className="hud-hp-text">
          {hp}/{MAX_HP}
        </span>
      </div>
      {label && <div className="hud-status">{label}</div>}
    </div>
  );
}
