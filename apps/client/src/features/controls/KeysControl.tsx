import { useEffect, useEffectEvent, useId, useRef, useState, type RefObject } from "react";
import { useInputMode } from "../touch/index.ts";
import {
  ACTIONS,
  ACTION_NAMES,
  DEFAULT_KEYMAP,
  captureButton,
  captureKey,
  clearSecondary,
  isDefault,
  rebind,
  type Action,
  type Binding,
  type Captured,
} from "./keymap.ts";
import { keyName } from "./labels.ts";
import { controls, useKeymap } from "./store.ts";
import "./controls.css";

interface Waiting {
  action: Action;
  slot: 0 | 1;
}

function KeyboardIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <rect x="1.5" y="5" width="17" height="10.5" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M4.5 8.2h1.6M8 8.2h1.6M11.5 8.2h1.6M15 8.2h.6M4.5 11h1.6M15 11h.6M8 12.4h4.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Waits for the key or mouse button to bind, then calls `onCaptured`. Window
 * listeners in the capture phase, so the game, the other panels and the
 * focused button never see that press. Échap cancels; a left click on the
 * panel itself cancels too (clicking anywhere else binds the click).
 */
function useCapture(waiting: Waiting | null, panel: RefObject<HTMLElement | null>, onCaptured: (c: Captured | null) => void) {
  const done = useEffectEvent((c: Captured | null) => onCaptured(c));
  useEffect(() => {
    if (!waiting) return undefined;
    controls.setCapturing(true);
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      done(e.code === "Escape" ? null : captureKey(e));
    };
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      // The click that follows must not press whatever button is under the mouse.
      window.setTimeout(() => window.removeEventListener("click", onClick, true), 1000);
      window.addEventListener("click", onClick, true);
      const onPanel = e.button === 0 && e.target instanceof Node && panel.current?.contains(e.target);
      done(onPanel ? null : captureButton(e.button));
    };
    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      window.removeEventListener("click", onClick, true);
    };
    const onMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("contextmenu", onMenu, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
      // Removed a moment later: the right click's menu comes after its pointerdown.
      window.setTimeout(() => window.removeEventListener("contextmenu", onMenu, true), 300);
      controls.setCapturing(false);
    };
  }, [waiting, panel]);
}

/**
 * The "Touches" chip and panel (#72): every action with its key and its
 * second key; click one, then press the new key or mouse button. A key
 * already used is swapped with the old one ("Par défaut" puts everything
 * back). Hidden on touch screens, where the touch buttons don't move.
 * `placement` "lobby" pins it to the top right, left of the sound chip;
 * "hud" sits in the HUD's corner.
 */
export function KeysControl({ placement }: { placement: "hud" | "lobby" }) {
  const touch = useInputMode() === "touch";
  const keymap = useKeymap();
  const [open, setOpen] = useState(false);
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "no" } | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const panelId = useId();
  const name = (b: Binding) => keyName(b, controls.layout(), true);

  const close = () => {
    setOpen(false);
    setWaiting(null);
    setMessage(null);
  };

  // Only while the panel shows (a switch to touch hides it).
  useCapture(open && !touch ? waiting : null, panelRef, (c) => {
    const target = waiting;
    setWaiting(null);
    if (!target || !c) return setMessage(null);
    if ("reason" in c) return setMessage({ text: c.reason, tone: "no" });
    const result = rebind(controls.get(), target.action, target.slot, c.binding, name);
    if (!result.ok) return setMessage({ text: result.reason, tone: "no" });
    controls.set(result.keymap);
    setMessage(
      result.swappedWith
        ? { text: `${name(c.binding)} servait à « ${ACTION_NAMES[result.swappedWith]} » : échangé.`, tone: "ok" }
        : null,
    );
  });

  // Échap closes (while not waiting for a key: then it only cancels).
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== "Escape") return;
      setOpen(false);
      setMessage(null);
    };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, [open]);

  if (touch) return null;

  const slotButton = (action: Action, slot: 0 | 1) => {
    const b = keymap[action][slot];
    const isWaiting = waiting?.action === action && waiting.slot === slot;
    const label = isWaiting ? "…" : b === null ? "+" : name(b);
    return (
      <button
        type="button"
        className="keys-slot"
        data-waiting={isWaiting || undefined}
        data-empty={b === null || undefined}
        aria-label={`${ACTION_NAMES[action]}, ${slot === 0 ? "touche" : "seconde touche"} : ${b === null ? "aucune" : name(b)}. Changer`}
        onClick={() => {
          setMessage(null);
          setWaiting(isWaiting ? null : { action, slot });
        }}
      >
        {label}
      </button>
    );
  };

  const panel = open && (
    <section id={panelId} ref={panelRef} className="keys-panel" aria-label="Touches">
      <h2 className="keys-title">Les touches</h2>
      <ul className="keys-list">
        {ACTIONS.map((action) => (
          <li key={action} className="keys-row">
            <span className="keys-name">{ACTION_NAMES[action]}</span>
            <span className="keys-slots">
              {slotButton(action, 0)}
              {slotButton(action, 1)}
              {keymap[action][1] !== null && (
                <button
                  type="button"
                  className="keys-clear"
                  aria-label={`Retirer la seconde touche de ${ACTION_NAMES[action]}`}
                  title="Retirer"
                  onClick={() => {
                    setWaiting(null);
                    controls.set(clearSecondary(controls.get(), action));
                  }}
                >
                  ×
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="keys-message" role="status" data-tone={message?.tone}>
        {waiting
          ? "Appuie sur une touche ou un bouton de souris. Échap pour annuler."
          : (message?.text ?? "Clique une touche pour la changer.")}
      </p>
      <button
        type="button"
        className="keys-reset"
        disabled={isDefault(keymap)}
        onClick={() => {
          setWaiting(null);
          setMessage(null);
          controls.set(DEFAULT_KEYMAP);
        }}
      >
        Par défaut
      </button>
    </section>
  );

  const button = (
    <button
      type="button"
      className="hud-chip keys-btn"
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={open ? "Cacher les touches" : "Changer les touches"}
      title="Touches"
      onClick={() => (open ? close() : setOpen(true))}
    >
      <KeyboardIcon />
    </button>
  );

  return (
    <div className={placement === "lobby" ? "keys-corner" : "keys-hud"}>
      {button}
      {panel}
    </div>
  );
}
