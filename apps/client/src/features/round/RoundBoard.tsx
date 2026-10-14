import { useEffect, useId, useState } from "react";
import { ARCHETYPES, PlayerStatus, archetypeOf } from "@manif/shared";
import { net, type LobbyPlayer } from "../../shared/net/index.ts";
import { archetypeLook } from "../archetype/index.ts";
import { useActions } from "../controls/index.ts";
import { useRound } from "./useRound.ts";
import { BOARD_COLUMNS, boardRows, statusLabel } from "./board.ts";
import "./board.css";

/** How often the open board re-reads everyone's status from Schema, in ms, like the HUD prompts. */
const STATUS_POLL_MS = 150;

const BOARD = ["board"] as const;

/**
 * True while the board key (Tab by default, #72) is held. Its default (Tab
 * moving focus to the HUD's buttons, where a later Space would "click" one) is
 * cancelled while it is bound; rebound away, Tab gets its browser behaviour
 * back. The keymap lets go on blur and when the page goes hidden.
 */
function useHeldBoardKey(): boolean {
  const [held, setHeld] = useState(false);
  useActions(BOARD, (_, pressed) => setHeld(pressed));
  return held;
}

/** Everyone's synced status while the board is open, as a string so an unchanged poll doesn't re-render. */
function useStatuses(ids: readonly string[], open: boolean): string {
  const [statuses, setStatuses] = useState("");
  const key = ids.join(",");
  useEffect(() => {
    if (!open) return undefined;
    const read = () =>
      setStatuses(
        key
          .split(",")
          .map((id) => net.getPlayer(id)?.status ?? PlayerStatus.Free)
          .join(","),
      );
    read();
    const timer = window.setInterval(read, STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [key, open]);
  return statuses;
}

/**
 * The live round scoreboard (#63): hold Tab (or its rebind, #72) on a keyboard; on touch, the "📋"
 * chip (rendered here, in the HUD corner) toggles it. Display only: it takes
 * no clicks or touches, so walking, hitting and dodging go on underneath.
 * Mounted with the street, end screen included, so Tab never moves focus
 * there either; `ended` hides the board and its chip (the podium takes over).
 */
export function RoundBoard({
  localId,
  players,
  touch,
  ended,
}: {
  localId: string | null;
  players: readonly LobbyPlayer[];
  touch: boolean;
  ended: boolean;
}) {
  const held = useHeldBoardKey();
  const [toggled, setToggled] = useState(false);
  const open = !ended && (held || toggled);
  const panelId = useId();
  const { board } = useRound();
  const rows = boardRows(players, board, localId);
  const statuses = useStatuses(
    rows.map((r) => r.id),
    open,
  ).split(",");

  useEffect(() => {
    if (!toggled) return undefined;
    const onDown = (e: KeyboardEvent) => {
      if (e.code === "Escape") setToggled(false);
    };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, [toggled]);

  return (
    <>
      {touch && !ended && (
        <button
          type="button"
          className="hud-chip hud-board-btn"
          aria-expanded={toggled}
          aria-controls={panelId}
          aria-label={toggled ? "Cacher le tableau de la manif" : "Voir le tableau de la manif"}
          title="Le cortège"
          onClick={() => setToggled((o) => !o)}
        >
          <span aria-hidden="true">📋</span>
        </button>
      )}
      {open && (
        <section id={panelId} className="round-board" data-touch={touch || undefined} aria-label="Le cortège">
          <h2 className="round-board-title">Le cortège</h2>
          <table className="round-board-table">
            <thead>
              <tr>
                <th scope="col" className="round-board-who">
                  Manifestant·e
                </th>
                <th scope="col">État</th>
                {BOARD_COLUMNS.map((c) => (
                  <th key={c.stat} scope="col" className="round-board-num" title={c.label}>
                    <span className="round-board-long">{c.label}</span>
                    <span className="round-board-short">{c.short}</span>
                  </th>
                ))}
                {/* #41: the round score, last, like the total at the bottom of a bill. */}
                <th scope="col" className="round-board-num round-board-score" title="Points de la manif">
                  <span className="round-board-long">Points</span>
                  <span className="round-board-short">Pts</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const id = archetypeOf(r.archetype);
                const look = archetypeLook(id);
                const status = statusLabel(Number(statuses[i] ?? PlayerStatus.Free));
                return (
                  <tr key={r.id} data-me={r.isMe || undefined} data-bot={r.bot || undefined}>
                    <th scope="row" className="round-board-who">
                      <div className="round-board-player">
                        <span className="round-board-swatch" style={{ background: look.clothes }} aria-hidden="true">
                          {look.icon}
                        </span>
                        <span className="round-board-id">
                          <span className="round-board-name">
                            {r.bot && (
                              <span className="bot-chip" title="Bot">
                                BOT
                              </span>
                            )}
                            {r.name}
                            {r.isMe && <span className="round-board-me"> (toi)</span>}
                          </span>
                          <span className="round-board-archetype">{ARCHETYPES[id].name}</span>
                        </span>
                      </div>
                    </th>
                    <td>
                      <span className="round-board-status" data-tone={status.tone}>
                        {status.text}
                      </span>
                    </td>
                    {BOARD_COLUMNS.map((c) => (
                      <td key={c.stat} className="round-board-num" data-zero={r.stats[c.stat] === 0 || undefined}>
                        {r.stats[c.stat]}
                      </td>
                    ))}
                    <td className="round-board-num round-board-score" data-zero={r.score === 0 || undefined}>
                      {r.score.toLocaleString("fr-FR")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
