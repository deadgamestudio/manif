import { useSyncExternalStore } from "react";

/** Which controls the player is using (#42): the keyboard and mouse, or the touch screen. */
export type InputMode = "keyboard" | "touch";

/** What the mode store listens to, reduced to what decides the mode. */
export type ModeEvent = { type: "keydown" } | { type: "pointerdown"; pointerType: string };

/**
 * The mode after an input: a finger on the screen switches to touch, any key
 * switches back to the keyboard (a tablet with a keyboard keeps working). A
 * mouse or pen click changes nothing, so a laptop with a touch screen follows
 * whatever was used last.
 */
export function nextMode(current: InputMode, e: ModeEvent): InputMode {
  if (e.type === "keydown") return "keyboard";
  if (e.pointerType === "touch") return "touch";
  return current;
}

function initialMode(): InputMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "keyboard";
  return window.matchMedia("(pointer: coarse)").matches ? "touch" : "keyboard";
}

let mode: InputMode | null = null;
const listeners = new Set<() => void>();
let installed = false;

function getMode(): InputMode {
  mode ??= initialMode();
  return mode;
}

function apply(e: ModeEvent) {
  const next = nextMode(getMode(), e);
  if (next === mode) return;
  mode = next;
  for (const listener of listeners) listener();
}

/** Window listeners, added on the first subscriber and kept: they are cheap and the mode is app-wide. */
function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  // Capture phase, so a control that stops propagation still counts.
  window.addEventListener("keydown", () => apply({ type: "keydown" }), true);
  window.addEventListener("pointerdown", (e) => apply({ type: "pointerdown", pointerType: e.pointerType }), true);
}

function subscribe(listener: () => void): () => void {
  install();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current input mode; re-renders when it changes. */
export function useInputMode(): InputMode {
  return useSyncExternalStore(subscribe, getMode, () => "keyboard");
}
