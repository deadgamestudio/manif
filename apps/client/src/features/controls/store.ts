/**
 * The live keymap (#72), remembered on this browser, and the keyboard layout
 * used to name keys. Every input hook reads it at event time, so a rebind
 * applies at once.
 */
import { useSyncExternalStore } from "react";
import { DEFAULT_KEYMAP, parseKeymap, serializeKeymap, type Keymap } from "./keymap.ts";
import { keyLabels, type KeyLabels, type Layout } from "./labels.ts";

const KEY = "manif.keys";

// localStorage can throw (private mode, blocked storage): the keys then just aren't remembered.
function load(): Keymap {
  try {
    return parseKeymap(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_KEYMAP;
  }
}

function save(km: Keymap) {
  try {
    localStorage.setItem(KEY, serializeKeymap(km));
  } catch {
    // not remembered, that's all
  }
}

let keymap: Keymap | null = null;
let layout: Layout | null = null;
let labels: KeyLabels | null = null;
/** True while the panel waits for a key: the game ignores input meanwhile. */
let capturing = false;
let layoutAsked = false;
const listeners = new Set<() => void>();

function notify() {
  labels = null;
  for (const l of listeners) l();
}

interface KeyboardWithLayout {
  getLayoutMap?: () => Promise<Iterable<[string, string]>>;
}

/** Chromium only; asked once. Everywhere else the AZERTY fallback names keys. */
function askLayout() {
  if (layoutAsked || typeof navigator === "undefined") return;
  layoutAsked = true;
  const kb = (navigator as Navigator & { keyboard?: KeyboardWithLayout }).keyboard;
  kb?.getLayoutMap?.()
    .then((map) => {
      layout = new Map(map);
      notify();
    })
    .catch(() => undefined);
}

export const controls = {
  get(): Keymap {
    keymap ??= typeof window === "undefined" ? DEFAULT_KEYMAP : load();
    return keymap;
  },
  set(next: Keymap) {
    if (next === keymap) return;
    keymap = next;
    save(next);
    notify();
  },
  layout(): Layout | null {
    return layout;
  },
  labels(): KeyLabels {
    labels ??= keyLabels(controls.get(), layout);
    return labels;
  },
  isCapturing(): boolean {
    return capturing;
  },
  setCapturing(on: boolean) {
    if (capturing === on) return;
    capturing = on;
    notify();
  },
  subscribe(listener: () => void): () => void {
    askLayout();
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useKeymap(): Keymap {
  return useSyncExternalStore(controls.subscribe, controls.get, () => DEFAULT_KEYMAP);
}

/** The player's key names for the help, tips and prompts ("E", "Espace", "clic"...). */
export function useKeyLabels(): KeyLabels {
  return useSyncExternalStore(controls.subscribe, controls.labels, controls.labels);
}
