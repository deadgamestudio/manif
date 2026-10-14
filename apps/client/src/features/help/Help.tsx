import { useEffect, useId, useState } from "react";
import { PlayerStatus, ThrowableKind } from "@manif/shared";
import { net, type LobbyPlayer } from "../../shared/net/index.ts";
import { rescueTarget } from "../rescue/index.ts";
import { carryTargetFor } from "../carry/index.ts";
import { fireActionFor } from "../fire/index.ts";
import { useActions, useKeyLabels } from "../controls/index.ts";
import { BASIC_TIP_COUNT, controls, pickTip, type TipSituation } from "./tips.ts";
import { HelpLink } from "./HelpPage.tsx";

const HELP = ["help"] as const;

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
    grabbed: me.status === PlayerStatus.Grabbed,
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
  const keys = useKeyLabels();
  useEffect(() => {
    if (!localId) return undefined;
    const started = performance.now();
    const update = () => {
      const turn = Math.floor((performance.now() - started) / TURN_MS) % BASIC_TIP_COUNT;
      setText(pickTip(situation(localId, players), touch, turn, keys));
    };
    update();
    const timer = window.setInterval(update, POLL_MS);
    return () => window.clearInterval(timer);
  }, [localId, players, touch, keys]);
  if (!text) return null;
  return (
    <p className="hud-tip" key={text}>
      {text}
    </p>
  );
}

/**
 * The "?" button and the full controls list it opens, also toggled by the
 * help key on a keyboard (C by default, #72; H is a debug key in dev builds)
 * and closed by Échap. The list names the player's own keys, and links to
 * the full help (#71), opened over the street.
 */
export function HelpMenu({ touch }: { touch: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const keys = useKeyLabels();

  useActions(HELP, (_, pressed) => {
    if (pressed) setOpen((o) => !o);
  });

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code === "Escape") setOpen(false);
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
        title={touch ? "Commandes" : `Commandes (${keys.help})`}
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
            {controls(touch, keys).map(([key, what]) => (
              <div key={what} className="hud-help-row">
                <dt>
                  <kbd>{key}</kbd>
                </dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
          <p className="hud-help-goal">
            Objectif : la moitié du cortège à la Préfecture avant la fin du chrono.
            {/* #71: the full help, over the street, without leaving the room. */}
            <HelpLink className="help-link hud-help-more" onOpen={() => setOpen(false)}>
              Tout comprendre →
            </HelpLink>
          </p>
        </section>
      )}
    </>
  );
}
