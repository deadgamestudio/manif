import { useCallback, useSyncExternalStore } from "react";
import { net } from "../../shared/net/index.ts";
import { COUGH_TEXT, COUGH_TEXT_STYLE, GAS_SCREEN_STYLE } from "./gasVisuals.tsx";

const FIELDS = ["gassed"] as const;

/**
 * The screen tint while the local player is in tear gas (#7). Re-renders only
 * when `gassed` flips; the fade is a CSS transition.
 */
export function GasOverlay({ localId }: { localId: string | null }) {
  const subscribe = useCallback(
    (listener: () => void) => (localId ? net.watchPlayer(localId, FIELDS, listener) : () => undefined),
    [localId],
  );
  const gassed = useSyncExternalStore(subscribe, () => (localId ? net.getPlayer(localId)?.gassed === true : false));
  return (
    <>
      <div aria-hidden="true" style={{ ...GAS_SCREEN_STYLE, opacity: gassed ? 1 : 0 }} />
      {gassed && <div style={COUGH_TEXT_STYLE}>{COUGH_TEXT}</div>}
    </>
  );
}
