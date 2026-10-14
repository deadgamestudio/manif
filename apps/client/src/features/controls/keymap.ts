/**
 * The keymap (#72): which key or mouse button does what. Pure data and rules,
 * no DOM: the live copy, saving and the input hook are in store.ts and
 * useActions.ts.
 *
 * A binding is a `KeyboardEvent.code` (a key's position, so ZQSD on AZERTY is
 * WASD on QWERTY) or "Mouse0".."Mouse4" for a mouse button
 * (`MouseEvent.button`). Every action has two slots, a primary and an
 * optional secondary, and a binding belongs to one action at most.
 */

export const ACTIONS = ["up", "down", "left", "right", "attack", "jump", "dodge", "interact", "board", "help", "mute"] as const;
export type Action = (typeof ACTIONS)[number];

export type Binding = string;
/** [primary, secondary]. The primary is never empty. */
export type Slots = readonly [Binding, Binding | null];
export type Keymap = Readonly<Record<Action, Slots>>;

/** What the "Touches" panel calls each action, in its order. */
export const ACTION_NAMES: Readonly<Record<Action, string>> = {
  up: "Avancer",
  down: "Reculer",
  left: "Gauche",
  right: "Droite",
  attack: "Taper, lancer, se débattre",
  jump: "Sauter",
  dodge: "Plonger, esquiver",
  interact: "Action (ramasser, libérer, allumer…)",
  board: "Tableau du cortège (maintenu)",
  help: "Aide",
  mute: "Couper le son",
};

/**
 * The defaults: ZQSD and the arrows, left click, Space, either Shift, E, Tab,
 * C, M. M is the Semicolon position first (where M is printed on AZERTY),
 * then KeyM (where it is on QWERTY): the old shortcut read the printed letter,
 * and both layouts keep working that way.
 */
export const DEFAULT_KEYMAP: Keymap = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  attack: ["Mouse0", null],
  jump: ["Space", null],
  dodge: ["ShiftLeft", "ShiftRight"],
  interact: ["KeyE", null],
  board: ["Tab", null],
  help: ["KeyC", null],
  mute: ["Semicolon", "KeyM"],
};

export const mouseBinding = (button: number): Binding => `Mouse${button}`;

/** `MouseEvent.buttons` bits, in `MouseEvent.button` order (left, middle, right, back, forward). */
const BUTTON_BITS = [1, 4, 2, 8, 16] as const;

/**
 * The mouse buttons that went down or up between two `MouseEvent.buttons`
 * masks. Diffing the mask catches a second button pressed while one is held,
 * which fires no pointerdown of its own.
 */
export function mouseChanges(prev: number, next: number): { button: number; down: boolean }[] {
  const out: { button: number; down: boolean }[] = [];
  BUTTON_BITS.forEach((bit, button) => {
    if ((prev ^ next) & bit) out.push({ button, down: (next & bit) !== 0 });
  });
  return out;
}

/** The action a binding triggers, or null. */
export function actionFor(km: Keymap, binding: Binding): Action | null {
  for (const a of ACTIONS) if (km[a][0] === binding || km[a][1] === binding) return a;
  return null;
}

/** True when `binding` is one of `action`'s. */
export function matches(km: Keymap, action: Action, binding: Binding): boolean {
  return km[action][0] === binding || km[action][1] === binding;
}

// ---------- What can be bound ----------

/** Keys the system, the browser or the menus keep. */
const SYSTEM_KEYS = new Set([
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
  "OSLeft",
  "OSRight",
  "ContextMenu",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "PrintScreen",
  "Pause",
  "Fn",
  "FnLock",
]);

/** Why a key can't be bound (in French, for the panel), or null when it can. */
export function reservedReason(code: string): string | null {
  if (!code || code === "Unidentified") return "Touche non reconnue, essaie une autre.";
  if (code === "Escape") return "Échap reste pour fermer et annuler.";
  if (/^F\d{1,2}$/.test(code)) return "Les touches F1 à F12 restent au navigateur.";
  if (SYSTEM_KEYS.has(code)) return "Cette touche reste au système (Ctrl, Alt, Cmd…).";
  return null;
}

export interface KeyLike {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export type Captured = { binding: Binding } | { reason: string };

/** A key pressed while the panel waits for one: its binding, or why not. One key at a time, no combos. */
export function captureKey(e: KeyLike): Captured {
  const reserved = reservedReason(e.code);
  if (reserved) return { reason: reserved };
  const isShift = e.code === "ShiftLeft" || e.code === "ShiftRight";
  if (e.ctrlKey || e.metaKey || e.altKey || (e.shiftKey && !isShift)) {
    return { reason: "Une seule touche, sans Ctrl, Alt, Cmd ni Maj." };
  }
  return { binding: e.code };
}

/** A mouse button pressed while the panel waits: left, middle, right and the two side buttons. */
export function captureButton(button: number): Captured {
  if (Number.isInteger(button) && button >= 0 && button <= 4) return { binding: mouseBinding(button) };
  return { reason: "Ce bouton de souris n'est pas pris en charge." };
}

/** A well-formed binding that may be bound (used to vet saved data). */
export function isBindable(b: unknown): b is Binding {
  if (typeof b !== "string" || b.length === 0 || b.length > 32) return false;
  if (/^Mouse\d+$/.test(b)) return "binding" in captureButton(Number(b.slice(5)));
  return /^[A-Za-z0-9]+$/.test(b) && reservedReason(b) === null;
}

// ---------- Rebinding ----------

export type RebindResult =
  | { ok: true; keymap: Keymap; /** The action that got this one's old key in exchange. */ swappedWith?: Action }
  | { ok: false; reason: string };

/** Primary first: an empty primary takes the secondary. */
function normalize(slots: readonly (Binding | null)[]): [Binding | null, Binding | null] {
  const [a = null, b = null] = slots;
  return a === null ? [b, null] : [a, b === a ? null : b];
}

/**
 * Puts `binding` in `action`'s `slot`. A binding already used elsewhere is
 * swapped: the other action gets this slot's old binding. Refused when that
 * would leave the other action with no key at all (its only key, and this slot
 * was empty).
 */
export function rebind(km: Keymap, action: Action, slot: 0 | 1, binding: Binding, nameOf: (b: Binding) => string = (b) => b): RebindResult {
  if (!isBindable(binding)) return { ok: false, reason: "Cette touche ne peut pas servir." };
  const next: Record<Action, [Binding | null, Binding | null]> = { ...km } as never;
  for (const a of ACTIONS) next[a] = [km[a][0], km[a][1]];
  const old = next[action][slot];
  if (old === binding) return { ok: true, keymap: km };
  const owner = actionFor(km, binding);
  let swappedWith: Action | undefined;
  if (owner === action) {
    // The other slot of the same action: swap them.
    next[action] = [next[action][1], next[action][0]];
  } else {
    if (owner) {
      const ownerSlot = km[owner][0] === binding ? 0 : 1;
      next[owner][ownerSlot] = old;
      next[owner] = normalize(next[owner]);
      if (next[owner][0] === null) {
        return { ok: false, reason: `${nameOf(binding)} est la seule touche pour « ${ACTION_NAMES[owner]} » : change-la d'abord.` };
      }
      swappedWith = owner;
    }
    next[action][slot] = binding;
    next[action] = normalize(next[action]);
  }
  return { ok: true, keymap: next as unknown as Keymap, ...(swappedWith ? { swappedWith } : {}) };
}

/** Empties an action's secondary slot; the primary always stays. */
export function clearSecondary(km: Keymap, action: Action): Keymap {
  return { ...km, [action]: [km[action][0], null] };
}

// ---------- Saving ----------

const VERSION = 1;

/** Reads what `serializeKeymap` wrote. Anything missing, broken or from another version falls back to the defaults. */
export function parseKeymap(raw: string | null): Keymap {
  if (!raw) return DEFAULT_KEYMAP;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_KEYMAP;
  }
  if (!data || typeof data !== "object") return DEFAULT_KEYMAP;
  const { v, bindings } = data as { v?: unknown; bindings?: unknown };
  if (v !== VERSION || !bindings || typeof bindings !== "object") return DEFAULT_KEYMAP;
  const saved = bindings as Record<string, unknown>;
  const out = {} as Record<Action, Slots>;
  for (const a of ACTIONS) {
    const slots = saved[a];
    // An action added after this was saved gets its default.
    if (!Array.isArray(slots)) {
      out[a] = DEFAULT_KEYMAP[a];
      continue;
    }
    const [p, s] = normalize([isBindable(slots[0]) ? slots[0] : null, isBindable(slots[1]) ? slots[1] : null]);
    out[a] = p === null ? DEFAULT_KEYMAP[a] : [p, s];
  }
  // A key on two actions (hand-edited, or a new default landing on a saved key): start over.
  const seen = new Set<Binding>();
  for (const a of ACTIONS) {
    for (const b of out[a]) {
      if (b === null) continue;
      if (seen.has(b)) return DEFAULT_KEYMAP;
      seen.add(b);
    }
  }
  return out;
}

export function serializeKeymap(km: Keymap): string {
  const bindings: Record<string, Slots> = {};
  for (const a of ACTIONS) bindings[a] = km[a];
  return JSON.stringify({ v: VERSION, bindings });
}

export function isDefault(km: Keymap): boolean {
  return ACTIONS.every((a) => km[a][0] === DEFAULT_KEYMAP[a][0] && km[a][1] === DEFAULT_KEYMAP[a][1]);
}
