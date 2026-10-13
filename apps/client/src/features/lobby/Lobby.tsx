import { useEffect, useRef, useState } from "react";
import { MAX_PLAYERS, RoundResult } from "@manif/shared";
import { inviteLink, net, type NetSnapshot } from "../../shared/net/index.ts";
import { LastRound, useRound } from "../round/index.ts";

/**
 * Before the march: who's here, the invite link, and Start for the host.
 * This is the round's `waiting` phase (#12): the room comes back here after
 * every round, with the last result shown. #14 adds the archetype picker here.
 */
export function Lobby({ snap }: { snap: NetSnapshot }) {
  const code = snap.roomId ?? "";
  const link = inviteLink(code);
  const isHost = snap.hostId !== null && snap.hostId === snap.sessionId;
  const host = snap.players.find((p) => p.id === snap.hostId);
  // A round already finished in this room: Start is a rematch.
  const rematch = useRound().result !== RoundResult.None;

  return (
    <main className="screen lobby">
      <header className="banner banner-small">
        <p className="banner-kicker">Point de rendez-vous</p>
        <h1 className="banner-title">
          Manif <span className="lobby-code">#{code}</span>
        </h1>
      </header>

      <LastRound />

      <div className="placards">
        <section className="placard placard-roster">
          <h2 className="placard-label">
            Le cortège{" "}
            <span className="count">
              {snap.players.length}/{MAX_PLAYERS}
            </span>
          </h2>
          <ul className="roster">
            {snap.players.map((p) => (
              <li key={p.id} className={p.id === snap.sessionId ? "is-me" : undefined}>
                <span className="roster-name">{p.name}</span>
                {p.id === snap.hostId && <span className="tag tag-host">📣 orga</span>}
                {p.id === snap.sessionId && <span className="tag">toi</span>}
              </li>
            ))}
          </ul>
        </section>

        <section className="placard placard-invite">
          <h2 className="placard-label">Fais tourner</h2>
          <p className="placard-text">Envoie ce lien aux potes. Le code marche aussi.</p>
          <CopyLink link={link} />
        </section>
      </div>

      <div className="lobby-actions">
        {isHost ? (
          <button type="button" className="btn btn-primary btn-start" onClick={() => net.start()}>
            {rematch ? "On y retourne !" : "C'est parti, on marche !"}
          </button>
        ) : (
          <p className="waiting">
            On attend que <b>{host?.name ?? "l'orga"}</b> lance le cortège…
          </p>
        )}
        <button type="button" className="btn btn-ghost" onClick={() => net.leave()}>
          Quitter
        </button>
      </div>
    </main>
  );
}

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // No clipboard API (insecure context): select the text so Ctrl+C works.
      input.current?.select();
      return;
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="field-row">
      <input
        ref={input}
        className="field field-link"
        value={link}
        readOnly
        aria-label="Lien d'invitation"
        onFocus={(e) => e.currentTarget.select()}
      />
      <button type="button" className="btn btn-copy" onClick={() => void copy()}>
        {copied ? "Copié !" : "Copier le lien"}
      </button>
    </div>
  );
}
