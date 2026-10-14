import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_PLAYERS, RoundResult, canStart, isBotId } from "@manif/shared";
import { inviteLink, net, type NetSnapshot } from "../../shared/net/index.ts";
import { LastRound, useRound } from "../round/index.ts";
import { ArchetypeBadge, ArchetypePicker } from "../archetype/index.ts";
import { SoundControl } from "../audio/index.ts";
import { KeysControl } from "../controls/index.ts";
import { Leaderboard } from "../score/index.ts";
import { BotFill } from "./BotFill.tsx";
import { RenameField } from "./RenameField.tsx";
import { StartControls } from "./StartControls.tsx";
import { readyCount } from "./readyText.ts";
import "./lobby.css";

/**
 * Before the march: who's here, the invite link, and Start for the host.
 * This is the round's `waiting` phase (#12): the room comes back here after
 * every round, with the last result shown, and each player picks an
 * archetype for the next march here (#14).
 */
export function Lobby({ snap }: { snap: NetSnapshot }) {
  const code = snap.roomId ?? "";
  const link = inviteLink(code);
  const isHost = snap.hostId !== null && snap.hostId === snap.sessionId;
  const host = snap.players.find((p) => p.id === snap.hostId);
  // A round already finished in this room: Start is a rematch.
  const rematch = useRound().result !== RoundResult.None;
  const me = snap.players.find((p) => p.id === snap.sessionId);
  // Your own roster line turns into a name field (#61).
  const [renaming, setRenaming] = useState(false);
  const stopRenaming = useCallback(() => setRenaming(false), []);
  // The ready check (#62): the same rule the server applies to Start.
  const check = canStart(snap.players, snap.hostId ?? "");
  // Bots (#59) only exist during the march; never list one here, whatever the timing.
  const humans = snap.players.filter((p) => !isBotId(p.id));
  const readyLabel = readyCount(check.ready, check.required);

  return (
    <main className="screen lobby">
      <SoundControl placement="lobby" />
      <KeysControl placement="lobby" />
      {/* The banner, picker and roster scroll; the action bar under them never does,
          so Start and the invite link stay on screen at any size. */}
      <div className="lobby-scroll">
        <header className="banner banner-small">
          <p className="banner-kicker">Point de rendez-vous</p>
          <h1 className="banner-title">
            Manif <span className="lobby-code">#{code}</span>
          </h1>
        </header>

        <LastRound />

        <div className="placards">
          <ArchetypePicker current={me?.archetype ?? 0} />

          <div className="lobby-side">
          <section className="placard placard-roster">
            <h2 className="placard-label">
              Le cortège{" "}
              <span className="count">
                {humans.length}/{MAX_PLAYERS}
                {readyLabel && ` · ${readyLabel}`}
              </span>
            </h2>
            <ul className="roster">
              {humans.map((p) => {
                const mine = p.id === snap.sessionId;
                if (mine && renaming) {
                  return (
                    <li key={p.id} className="is-me is-renaming">
                      <RenameField name={p.name} onDone={stopRenaming} />
                    </li>
                  );
                }
                return (
                  <li key={p.id} className={mine ? "is-me" : undefined}>
                    <span className="roster-name">
                      {p.name}
                      <ArchetypeBadge archetype={p.archetype} />
                    </span>
                    {mine && (
                      <button
                        type="button"
                        className="btn btn-rename"
                        title="Changer de blaze"
                        aria-label="Changer de blaze"
                        onClick={() => setRenaming(true)}
                      >
                        ✏️
                      </button>
                    )}
                    {p.id === snap.hostId && <span className="tag tag-host">📣 orga</span>}
                    {p.ready && p.id !== snap.hostId && <span className="tag tag-ready">prêt·e</span>}
                    {mine && <span className="tag">toi</span>}
                  </li>
                );
              })}
            </ul>
            <BotFill isHost={isHost} on={snap.fillBots} humans={humans.length} />
          </section>

          {/* #41: the lasting totals, under the roster. In the scrolling area, so Start never moves. */}
          <Leaderboard />
          </div>
        </div>
      </div>

      <footer className="lobby-bar">
        <div className="lobby-bar-inner">
          <section className="lobby-invite" aria-label="Fais tourner">
            <p className="lobby-invite-text">
              <b>Fais tourner.</b> Envoie ce lien aux potes. Le code marche aussi.
            </p>
            <CopyLink link={link} />
          </section>

          <div className="lobby-go">
            <StartControls
              isHost={isHost}
              me={me}
              hostName={host?.name ?? "l'orga"}
              check={check}
              players={snap.players}
              rematch={rematch}
            />
          </div>

          <button type="button" className="btn btn-ghost lobby-leave" onClick={() => net.leave()}>
            Quitter
          </button>
        </div>
      </footer>
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
