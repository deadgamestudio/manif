import { useCallback, useSyncExternalStore } from "react";
import { net } from "../../shared/net/index.ts";
import { points } from "./leaderboard.ts";
import "./score.css";

const FIELDS = ["score"] as const;

/**
 * My round score (#41), live from the synced `Player.score`, for the round HUD.
 * Re-renders only when it changes, and the number pops when it does.
 */
export function MyScore({ localId }: { localId: string | null }) {
  const subscribe = useCallback(
    (listener: () => void) => (localId ? net.watchPlayer(localId, FIELDS, listener) : () => undefined),
    [localId],
  );
  const score = useSyncExternalStore(subscribe, () => (localId ? (net.getPlayer(localId)?.score ?? 0) : 0));
  return (
    <span className="my-score" aria-label={`Ton score : ${points(score)}`} title="Tes points cette manif">
      {/* Remounted on every change, so the pop animation replays. */}
      <b key={score}>{score.toLocaleString("fr-FR")}</b> pts
    </span>
  );
}
