import { useEffect, useId, useState } from "react";
import { PlayerStatus, ThrowableKind } from "@manif/shared";
import { net, type LobbyPlayer } from "../../shared/net/index.ts";
import { rescueTarget } from "../rescue/index.ts";
import { carryTargetFor } from "../carry/index.ts";
import { fireActionFor } from "../fire/index.ts";
import { BASIC_TIP_COUNT, HELP_KEY, HELP_KEY_LABEL, controls, pickTip, type TipSituation } from "./tips.ts";

/** How often the tip looks at the player, in ms, like the other prompts. */
const POLL_MS = 150;
/** How long each basic tip stays up, in ms. */
const TURN_MS = 9000;

function situation(localId: string, players: readonly LobbyPlayer[]): TipSituation {
  const me = net.getPlayer(localId);
  if (!me) return { prompted: false, helpless: true, gassed: false, carrying: ThrowableKind.None };
  const prompted =
    !!me.carriedBy ||
    me.onFire ||
    net.getCarried(localId) !== null ||
    rescueTarget(localId, players) !== null ||
    carryTargetFor(localId, players) !== null ||
    fireActionFor(localId, players) !== null;
  return {
    prompted,
    helpless: me.down || me.status !== PlayerStatus.Free,
    gassed: me.gassed,
    carrying: me.carrying,
  };
}

/**
 * One short tip under the HP bar, for what the local player is doing right
 * now: holding something, how to throw it; in the gas, how to dive out;
 * otherwise the objective and the basics in turn. Hidden while another prompt
 * (rescue, carry, fire) already says what to do. Re-renders only when the
 * text changes.
 */
export function HelpTip({ localId, players, touch }: { localId: string | null; players: readonly LobbyPlayer[]; touch: boolean }) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!localId) return undefined;
    const started = performance.now();
    const update = () => {
      const turn = Math.floor((performance.now() - started) / TURN_MS) % BASIC_TIP_COUNT;
      setText(pickTip(situation(localId, players), touch, turn));
    };
    update();
    const timer = window.setInterval(update, POLL_MS);
    return () => window.clearInterval(timer);
  }, [localId, players, touch]);
  if (!text) return null;
  return (
    <p className="hud-tip" key={text}>
      {text}
    </p>
  );
}

/**
 * The "?" button and the full controls list it opens, also toggled by C on a
 * keyboard (H is a debug key in dev builds) and closed by Échap.
 */
export function HelpMenu({ touch }: { touch: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === HELP_KEY) setOpen((o) => !o);
      else if (e.code === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, []);

  return (
    <>
      <button
        type="button"
        className="hud-chip hud-help-btn"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Cacher les commandes" : "Voir les commandes"}
        title={touch ? "Commandes" : `Commandes (${HELP_KEY_LABEL})`}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        ) : (
          "?"
        )}
      </button>
      {open && (
        <section id={panelId} className="hud-help-panel" aria-label="Commandes">
          <h2 className="hud-help-title">Les commandes</h2>
          <dl className="hud-help-list">
            {controls(touch).map(([key, what]) => (
              <div key={key} className="hud-help-row">
                <dt>
                  <kbd>{key}</kbd>
                </dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
          <p className="hud-help-goal">Objectif : la moitié du cortège à la Préfecture avant la fin du chrono.</p>
        </section>
      )}
    </>
  );
}
