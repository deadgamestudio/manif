import { useSyncExternalStore } from "react";
import { LEADERBOARD_SIZE } from "@manif/shared";
import { net } from "../../shared/net/index.ts";
import { leaderLines, points, rounds } from "./leaderboard.ts";
import "./score.css";

/**
 * The lasting leaderboard (#41), a placard in the lobby: the top totals across
 * every manif on this server, and my own line even when I rank lower. Hidden
 * when the server has no working score storage (round scores only).
 */
export function Leaderboard() {
  const board = useSyncExternalStore(net.subscribeLeaderboard, net.getLeaderboard);
  if (!board?.available) return null;
  const lines = leaderLines(board);
  return (
    <section className="placard placard-leaderboard" aria-labelledby="leaderboard-title">
      <h2 id="leaderboard-title" className="placard-label">
        Le classement <span className="count">top {LEADERBOARD_SIZE}</span>
      </h2>
      {lines.length === 0 ? (
        <p className="placard-text">Personne n'a encore marqué. Finis une manif pour ouvrir le compteur.</p>
      ) : (
        <ol className="leaderboard">
          {lines.map((l, i) => (
            <li key={`${l.rank}-${i}`} data-me={l.isMe || undefined} data-outside={l.outside || undefined}>
              <span className="leaderboard-rank">{l.rank}</span>
              <span className="leaderboard-name">
                {l.name}
                {l.isMe && <span className="tag">toi</span>}
              </span>
              <span className="leaderboard-total">
                {points(l.total)}
                <span className="leaderboard-rounds">{rounds(l.rounds)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {!board.me && lines.length > 0 && <p className="leaderboard-note">Tes points s'ajoutent à la fin de chaque manif.</p>}
    </section>
  );
}
