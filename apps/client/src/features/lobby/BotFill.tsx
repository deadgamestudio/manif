import { botsToFill } from "@manif/shared";
import { net } from "../../shared/net/index.ts";

/**
 * Bots (#59), under the roster: the host's "Compléter avec des bots" toggle,
 * what everyone else sees of it, and how many bots join at Start. The server
 * fills the empty seats itself; this only says so.
 */
export function BotFill({ isHost, on, humans }: { isHost: boolean; on: boolean; humans: number }) {
  const count = botsToFill(humans, on);
  return (
    <div className="bot-fill">
      {isHost ? (
        <label className="bot-fill-toggle">
          <input type="checkbox" checked={on} onChange={(e) => net.setFillBots(e.currentTarget.checked)} />
          <span>Compléter avec des bots</span>
        </label>
      ) : (
        <span className="bot-fill-state">{on ? "Des bots complètent le cortège" : "Pas de bots ce coup-ci"}</span>
      )}
      {count > 0 && (
        <span className="tag tag-bots">
          +{count} bot{count > 1 ? "s" : ""} au départ
        </span>
      )}
    </div>
  );
}
