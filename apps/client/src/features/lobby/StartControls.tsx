import { useState } from "react";
import type { StartCheck } from "@manif/shared";
import { net, type LobbyPlayer } from "../../shared/net/index.ts";
import { notReadyLine } from "./readyText.ts";

/**
 * The action bar's main slot (#62). The host gets Start once everyone else is
 * ready, or "Lancer quand même" (one confirmation naming who isn't) before
 * that. Everyone else gets the "Prêt·e" toggle. The server applies the same
 * rule (`canStart`); these buttons are a convenience.
 */
export function StartControls({
  isHost,
  me,
  hostName,
  check,
  players,
  rematch,
}: {
  isHost: boolean;
  me: LobbyPlayer | undefined;
  hostName: string;
  check: StartCheck;
  players: readonly LobbyPlayer[];
  rematch: boolean;
}) {
  // The question is asked about one group of latecomers: if that group changes (someone got
  // ready, left or arrived), it goes away and the host sees the new state before deciding.
  const latecomers = check.notReady.join(",");
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const confirming = isHost && !check.ok && confirmFor === latecomers;

  if (!isHost) {
    const ready = me?.ready === true;
    return (
      <div className="lobby-ready">
        <button
          type="button"
          className={`btn btn-ready${ready ? " is-ready" : ""}`}
          aria-pressed={ready}
          title={ready ? "Pas prêt·e finalement ?" : "Dire à l'orga que t'es prêt·e"}
          onClick={() => net.setReady(!ready)}
        >
          {ready ? "Prêt·e ✓" : "Prêt·e"}
        </button>
        <p className="lobby-ready-note">
          {ready ? (
            <>
              <b>{hostName}</b> lance le cortège… Retape si t'es pas prêt·e.
            </>
          ) : (
            <>
              Dis à <b>{hostName}</b> que t'es prêt·e.
            </>
          )}
        </p>
      </div>
    );
  }

  if (check.ok) {
    return (
      <button type="button" className="btn btn-primary btn-start" onClick={() => net.start()}>
        {rematch ? "On y retourne !" : "C'est parti, on marche !"}
      </button>
    );
  }

  const names = check.notReady.map((id) => players.find((p) => p.id === id)?.name ?? "Quelqu'un");
  if (confirming) {
    return (
      <div className="lobby-confirm" role="alertdialog" aria-label="Lancer sans tout le monde ?">
        <p className="lobby-confirm-text">
          {notReadyLine(names)} <b>On y va quand même ?</b>
        </p>
        <div className="lobby-confirm-actions">
          <button type="button" className="btn btn-primary" onClick={() => net.start(true)}>
            Oui, on y va
          </button>
          <button type="button" className="btn" onClick={() => setConfirmFor(null)}>
            Non, on attend
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lobby-host-wait">
      <button type="button" className="btn btn-primary btn-start btn-start-waiting" disabled>
        On attend les retardataires ({check.notReady.length})
      </button>
      <button type="button" className="btn btn-force" onClick={() => setConfirmFor(latecomers)}>
        Lancer quand même
      </button>
    </div>
  );
}
