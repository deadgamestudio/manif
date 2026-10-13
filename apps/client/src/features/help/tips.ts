/**
 * What the HUD says about the controls. One short tip at a time, picked from
 * the local player's situation, and the full list behind the "?" button.
 * French keyboards are AZERTY: movement reads key positions, so ZQSD works
 * there and WASD on QWERTY; the text names ZQSD.
 */
import { ThrowableKind } from "@manif/shared";

/** The key that opens and closes the full list (KeyboardEvent.code): C, the same spot on AZERTY and QWERTY. */
export const HELP_KEY = "KeyC";
export const HELP_KEY_LABEL = "C";

/** What the tip needs to know about the local player. */
export interface TipSituation {
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
};

/** The objective first, then the basics, one every few seconds. */
const BASICS = {
  keyboard: [
    "Objectif : la moitié du cortège à la Préfecture avant la fin du chrono.",
    "ZQSD ou flèches pour marcher, clic pour taper.",
    "Espace pour sauter par-dessus une poubelle ou un CRS à terre.",
    "Maj pour plonger et esquiver la matraque.",
    "E pour ramasser un pavé, une tomate, une crotte… ou un·e camarade.",
    "Maintiens E près d'une poubelle pour y mettre le feu.",
    "Regarde où tu marches : les crottes, ça glisse.",
  ],
  touch: [
    "Objectif : la moitié du cortège à la Préfecture avant la fin du chrono.",
    "Joystick à gauche pour marcher, Taper pour frapper.",
    "Sauter par-dessus une poubelle ou un CRS à terre.",
    "Esquive pour plonger sous la matraque.",
    "Action pour ramasser un pavé, une tomate… ou un·e camarade.",
    "Maintiens Action près d'une poubelle pour y mettre le feu.",
    "Regarde où tu marches : les crottes, ça glisse.",
  ],
} as const;

export const BASIC_TIP_COUNT = BASICS.keyboard.length;

/**
 * The one tip to show, or "" for none. `turn` picks the basic tip when the
 * situation says nothing in particular.
 */
export function pickTip(s: TipSituation, touch: boolean, turn: number): string {
  if (s.prompted || s.helpless) return "";
  if (s.gassed) return touch ? "Kof ! Esquive pour plonger hors des lacrymos." : "Kof ! Maj pour plonger hors des lacrymos.";
  const item = ITEM[s.carrying];
  if (item) return touch ? `Taper pour lancer ${item} (vise au joystick).` : `Clic pour lancer ${item} vers la souris.`;
  const list = touch ? BASICS.touch : BASICS.keyboard;
  return list[((turn % list.length) + list.length) % list.length] ?? "";
}

/** The full controls list, as [key, what it does]. */
export function controls(touch: boolean): readonly (readonly [string, string])[] {
  return touch
    ? [
        ["Joystick", "marcher (pose le pouce n'importe où à gauche)"],
        ["Taper", "frapper, ou lancer ce que tu tiens"],
        ["Sauter", "par-dessus une poubelle ou un CRS à terre"],
        ["Esquive", "plonger : sous la matraque, hors des lacrymos"],
        ["Action", "ramasser un pavé, une tomate, une crotte, une trottinette, ou soulever un·e camarade"],
        ["Action maintenue", "libérer un·e camarade, l'éteindre, ou mettre le feu à une poubelle ou une voiture"],
      ]
    : [
        ["ZQSD / flèches", "marcher"],
        ["Clic", "taper, ou lancer ce que tu tiens vers la souris"],
        ["Espace", "sauter par-dessus une poubelle ou un CRS à terre"],
        ["Maj", "plonger : sous la matraque, hors des lacrymos"],
        ["E", "ramasser un pavé, une tomate, une crotte, une trottinette, ou soulever un·e camarade"],
        ["E maintenu", "libérer un·e camarade, l'éteindre, ou mettre le feu à une poubelle ou une voiture"],
        [HELP_KEY_LABEL, "afficher ou cacher cette aide"],
      ];
}
