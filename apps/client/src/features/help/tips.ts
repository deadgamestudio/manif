/**
 * What the HUD says about the controls. One short tip at a time, picked from
 * the local player's situation, and the full list behind the "?" button.
 * The keyboard text names the player's own keys (#72), passed in as `keys`;
 * by default ZQSD, clic, Espace, Maj, E... on AZERTY.
 */
import { ThrowableKind } from "@manif/shared";

/**
 * The key names the text uses: the controls feature's KeyLabels (#72), restated
 * here so this file stays plain data the unit tests can load without the UI.
 */
export interface TipKeys {
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

/** In the middle of a sentence, "Clic" reads "clic". */
const inSentence = (label: string) => (label.startsWith("Clic") ? `c${label.slice(1)}` : label);

/** What the tip needs to know about the local player. */
export interface TipSituation {
  /** Held by a CRS (#70): the one thing to do is mash to struggle free. */
  grabbed?: boolean;
  /** Another prompt (rescue, carry, fire, grabbed...) already says what to do: no tip on top of it. */
  prompted: boolean;
  /** Down, KO, grabbed or in the van: nothing to do but wait. */
  helpless: boolean;
  gassed: boolean;
  /** The item in hand, a `ThrowableKind`. */
  carrying: number;
}

const ITEM: Record<number, string> = {
  [ThrowableKind.Pave]: "ton pavé",
  [ThrowableKind.Tomate]: "ta tomate",
  [ThrowableKind.Crotte]: "ta crotte",
  [ThrowableKind.Trottinette]: "ta trottinette",
  [ThrowableKind.Velib]: "ton Vélib",
};

const OBJECTIVE = "Objectif : la moitié du cortège à la Préfecture avant la fin du chrono.";

/** The objective first, then the basics, one every few seconds. */
function keyboardBasics(k: TipKeys): readonly string[] {
  return [
    OBJECTIVE,
    `${k.move} pour marcher, ${inSentence(k.attack)} pour taper.`,
    `${k.jump} pour sauter par-dessus une poubelle ou un CRS à terre.`,
    `${k.dodge} pour plonger et esquiver la matraque.`,
    `${k.interact} pour ramasser un pavé, une tomate, une crotte… ou un·e camarade.`,
    `Maintiens ${inSentence(k.interact)} près d'une poubelle pour y mettre le feu.`,
    "Regarde où tu marches : les crottes, ça glisse.",
  ];
}

const TOUCH_BASICS: readonly string[] = [
  OBJECTIVE,
  "Joystick à gauche pour marcher, Taper pour frapper.",
  "Sauter par-dessus une poubelle ou un CRS à terre.",
  "Esquive pour plonger sous la matraque.",
  "Action pour ramasser un pavé, une tomate… ou un·e camarade.",
  "Maintiens Action près d'une poubelle pour y mettre le feu.",
  "Regarde où tu marches : les crottes, ça glisse.",
];

export const BASIC_TIP_COUNT = TOUCH_BASICS.length;

/**
 * The one tip to show, or "" for none. `turn` picks the basic tip when the
 * situation says nothing in particular.
 */
export function pickTip(s: TipSituation, touch: boolean, turn: number, keys: TipKeys): string {
  // Grabbed (#70): helpless no more, whatever else is going on.
  if (s.grabbed === true) return touch ? "Martèle Débats-toi pour t'échapper !" : `Martèle ${inSentence(keys.attack)} pour te débattre !`;
  if (s.prompted || s.helpless) return "";
  if (s.gassed) return touch ? "Kof ! Esquive pour plonger hors des lacrymos." : `Kof ! ${keys.dodge} pour plonger hors des lacrymos.`;
  const item = ITEM[s.carrying];
  if (item) return touch ? `Taper pour lancer ${item} (vise au joystick).` : `${keys.attack} pour lancer ${item} vers la souris.`;
  const list = touch ? TOUCH_BASICS : keyboardBasics(keys);
  return list[((turn % list.length) + list.length) % list.length] ?? "";
}

/**
 * The full controls list, as [key, what it does]. `where` is who shows it:
 * the in-game "?" panel, or the "Comment on joue" page (#71), where the help
 * key opens that panel rather than "this help".
 */
export function controls(touch: boolean, keys: TipKeys, where: "panel" | "page" = "panel"): readonly (readonly [string, string])[] {
  return touch
    ? [
        ["Joystick", "marcher (pose le pouce n'importe où à gauche)"],
        ["Taper", "frapper, ou lancer ce que tu tiens"],
        ["Débats-toi", "attrapé·e par un CRS : martèle-le pour t'échapper avant le panier à salade"],
        ["Sauter", "par-dessus une poubelle ou un CRS à terre"],
        ["Esquive", "plonger : sous la matraque, hors des lacrymos"],
        ["Action", "ramasser un pavé, une tomate, une crotte, une trottinette, un Vélib, ou soulever un·e camarade"],
        ["Action maintenue", "libérer un·e camarade, l'éteindre, ou mettre le feu à une poubelle ou une voiture"],
        // The round feature's board chip (#63).
        ["📋", "afficher ou cacher le tableau du cortège (qui est libre, qui est embarqué·e)"],
        // The sound chip (#60).
        ["🔊", "régler ou couper le son"],
      ]
    : [
        [keys.move.replace(" ou ", " / "), "marcher"],
        [keys.attack, "taper, ou lancer ce que tu tiens vers la souris"],
        [`${keys.attack} martelé`, "attrapé·e par un CRS : te débattre pour t'échapper avant le panier à salade"],
        [keys.jump, "sauter par-dessus une poubelle ou un CRS à terre"],
        [keys.dodge, "plonger : sous la matraque, hors des lacrymos"],
        [keys.interact, "ramasser un pavé, une tomate, une crotte, une trottinette, un Vélib, ou soulever un·e camarade"],
        [`${keys.interact} maintenu`, "libérer un·e camarade, l'éteindre, ou mettre le feu à une poubelle ou une voiture"],
        [keys.mute, "couper ou remettre le son"],
        [`${keys.board} maintenu`, "voir le tableau du cortège (qui est libre, qui est embarqué·e)"],
        [keys.help, where === "page" ? "en pleine manif, afficher ou cacher la liste des commandes" : "afficher ou cacher cette aide"],
      ];
}
