import { useEffect, useId, useState } from "react";
import { ARCHETYPES, PlayerStatus, archetypeOf } from "@manif/shared";
import { net, type LobbyPlayer } from "../../shared/net/index.ts";
import { archetypeLook } from "../archetype/index.ts";
import { useRound } from "./useRound.ts";
import { BOARD_COLUMNS, boardRows, statusLabel } from "./board.ts";
import "./board.css";

/** The key held to see the board (KeyboardEvent.code). */
export const BOARD_KEY = "Tab";
/** How often the open board re-reads everyone's status from Schema, in ms, like the HUD prompts. */
const STATUS_POLL_MS = 150;

/**
 * True while Tab is held. Tab's default (moving focus to the HUD's buttons,
 * where a later Space would "click" one) is always cancelled while the street
 * is mounted. A Tab released while the window was in the background never
 * sends its keyup, so losing focus or going hidden lets go too.
 */
function useHeldTab(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== BOARD_KEY) return;
      e.preventDefault();
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      setHeld(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === BOARD_KEY) setHeld(false);
    };
    const release = () => setHeld(false);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") release();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
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
 * The live round scoreboard (#63): hold Tab on a keyboard; on touch, the "📋"
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
  const held = useHeldTab();
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
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const id = archetypeOf(r.archetype);
                const look = archetypeLook(id);
                const status = statusLabel(Number(statuses[i] ?? PlayerStatus.Free));
                return (
                  <tr key={r.id} data-me={r.isMe || undefined}>
                    <th scope="row" className="round-board-who">
                      <div className="round-board-player">
                        <span className="round-board-swatch" style={{ background: look.clothes }} aria-hidden="true">
                          {look.icon}
                        </span>
                        <span className="round-board-id">
                          <span className="round-board-name">
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
