/**
 * What to call a binding on screen (#72). A binding is a key's position
 * ("KeyQ"); the letter printed on it depends on the layout. Chromium tells us
 * (`navigator.keyboard.getLayoutMap()`, passed in as `layout`); elsewhere we
 * assume AZERTY, since the players are French.
 */
import { DEFAULT_KEYMAP, type Action, type Binding, type Keymap } from "./keymap.ts";

/** A layout map: code -> the character printed on that key (lowercase), as getLayoutMap gives it. */
export type Layout = ReadonlyMap<string, string>;

/** Where AZERTY differs from the code's QWERTY name. */
const AZERTY: Readonly<Record<string, string>> = {
  KeyQ: "A",
  KeyW: "Z",
  KeyA: "Q",
  KeyZ: "W",
  KeyM: ",",
  Semicolon: "M",
  Comma: ";",
  Period: ":",
  Slash: "!",
  BracketLeft: "^",
  BracketRight: "$",
  Quote: "ù",
  Backquote: "²",
  Backslash: "*",
  Minus: ")",
  Equal: "=",
  IntlBackslash: "<",
};

/** Keys with a name rather than a printed character. [short, long] when the side matters. */
const NAMED: Readonly<Record<string, string | readonly [string, string]>> = {
  Space: "Espace",
  ShiftLeft: ["Maj", "Maj gauche"],
  ShiftRight: ["Maj", "Maj droite"],
  Tab: "Tab",
  Enter: "Entrée",
  NumpadEnter: "Entrée (pavé)",
  Backspace: "Retour",
  Delete: "Suppr",
  Insert: "Inser",
  Home: "Début",
  End: "Fin",
  PageUp: "Page ↑",
  PageDown: "Page ↓",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Mouse0: "Clic",
  Mouse1: "Clic molette",
  Mouse2: "Clic droit",
  Mouse3: "Souris 4",
  Mouse4: "Souris 5",
};

/**
 * A binding's name: "E", "Espace", "Maj", "Clic"... `long` tells the two
 * Shifts apart (for the panel). Digits stay digits whatever the layout says
 * (an AZERTY key shows both "1" and "&").
 */
export function keyName(b: Binding, layout: Layout | null = null, long = false): string {
  const named = NAMED[b];
  if (named !== undefined) return typeof named === "string" ? named : named[long ? 1 : 0];
  const digit = /^Digit(\d)$/.exec(b);
  if (digit) return digit[1] ?? b;
  const pad = /^Numpad(.+)$/.exec(b);
  if (pad) return `Pavé ${pad[1]}`;
  const printed = layout?.get(b);
  if (printed && printed.trim()) return printed.toUpperCase();
  const fallback = AZERTY[b];
  if (fallback) return fallback;
  const letter = /^Key([A-Z])$/.exec(b);
  if (letter) return letter[1] ?? b;
  return b;
}

/** In the middle of a sentence, "Clic" reads "clic". */
export function inSentence(label: string): string {
  return label.startsWith("Clic") ? `c${label.slice(1)}` : label;
}

const ARROWS = ["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"];

/** Four labels as one: "ZQSD" when each is one character, else spaced out. */
function joinFour(labels: string[]): string {
  return labels.every((l) => [...l].length === 1) ? labels.join("") : labels.join(" ");
}

/** The labels the help, the tips and the prompts use, for the player's keymap. */
export interface KeyLabels {
  /** "ZQSD ou flèches". */
  move: string;
  attack: string;
  jump: string;
  dodge: string;
  interact: string;
  board: string;
  help: string;
  mute: string;
}

const isLetter = (s: string) => /^\p{L}$/u.test(s);

/**
 * One name per action: the primary's, unless it is a lone symbol and the
 * secondary is a letter. So the default mute (the AZERTY M spot, then the
 * QWERTY one) reads "M" on both layouts rather than ";" on QWERTY.
 */
function primary(km: Keymap, a: Action, layout: Layout | null): string {
  const [p, s] = km[a];
  const first = keyName(p, layout);
  if (s === null || isLetter(first) || [...first].length !== 1) return first;
  const second = keyName(s, layout);
  return isLetter(second) ? second : first;
}

export function keyLabels(km: Keymap, layout: Layout | null = null): KeyLabels {
  const order: Action[] = ["up", "left", "down", "right"];
  const first = joinFour(order.map((a) => keyName(km[a][0], layout)));
  const seconds = order.map((a) => km[a][1]);
  let move = first;
  if (seconds.every((s) => s !== null)) {
    const isArrows = seconds.every((s, i) => s === ARROWS[i]);
    move = `${first} ou ${isArrows ? "flèches" : joinFour(seconds.map((s) => keyName(s as Binding, layout)))}`;
  }
  return {
    move,
    attack: primary(km, "attack", layout),
    jump: primary(km, "jump", layout),
    dodge: primary(km, "dodge", layout),
    interact: primary(km, "interact", layout),
    board: primary(km, "board", layout),
    help: primary(km, "help", layout),
    mute: primary(km, "mute", layout),
  };
}

/** The labels for the default keymap on AZERTY: what the help said before #72. */
export const DEFAULT_LABELS: KeyLabels = keyLabels(DEFAULT_KEYMAP);
