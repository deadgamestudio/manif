import { describe, expect, test } from "bun:test";
import { ThrowableKind } from "@manif/shared";
import { BASIC_TIP_COUNT, controls, pickTip, type TipKeys, type TipSituation } from "./tips.ts";

const calm: TipSituation = { prompted: false, helpless: false, gassed: false, carrying: ThrowableKind.None };

/** The default keymap's names on AZERTY (what controls/labels.ts gives for it). */
const keys: TipKeys = {
  move: "ZQSD ou flèches",
  attack: "Clic",
  jump: "Espace",
  dodge: "Maj",
  interact: "E",
  board: "Tab",
  help: "C",
  mute: "M",
};

describe("pickTip", () => {
  test("says nothing when another prompt already speaks or the player can't act", () => {
    expect(pickTip({ ...calm, prompted: true, gassed: true }, false, 0, keys)).toBe("");
    expect(pickTip({ ...calm, helpless: true }, true, 0, keys)).toBe("");
  });

  test("grabbed (#70): mash to struggle, even with another prompt up", () => {
    expect(pickTip({ ...calm, grabbed: true, helpless: true }, false, 0, keys)).toBe("Martèle clic pour te débattre !");
    expect(pickTip({ ...calm, grabbed: true, prompted: true, helpless: true }, true, 0, keys)).toContain("Débats-toi");
  });

  test("the controls list says how to struggle (#70)", () => {
    expect(controls(false, keys).some(([k, v]) => k.includes("Clic") && v.includes("débattre"))).toBe(true);
    expect(controls(true, keys).some(([k]) => k === "Débats-toi")).toBe(true);
  });

  test("the gas comes before the item in hand", () => {
    expect(pickTip({ ...calm, gassed: true, carrying: ThrowableKind.Pave }, false, 0, keys)).toContain("Maj");
    expect(pickTip({ ...calm, gassed: true }, true, 0, keys)).toContain("Esquive");
  });

  test("holding something: how to throw it, named", () => {
    expect(pickTip({ ...calm, carrying: ThrowableKind.Tomate }, false, 3, keys)).toBe("Clic pour lancer ta tomate vers la souris.");
    expect(pickTip({ ...calm, carrying: ThrowableKind.Pave }, true, 3, keys)).toContain("Taper");
  });

  test("otherwise the objective first, then the basics in turn, wrapping around", () => {
    expect(pickTip(calm, false, 0, keys)).toStartWith("Objectif");
    expect(pickTip(calm, false, BASIC_TIP_COUNT, keys)).toBe(pickTip(calm, false, 0, keys));
    expect(pickTip(calm, false, 1, keys)).toBe("ZQSD ou flèches pour marcher, clic pour taper.");
  });

  test("the keyboard help names AZERTY keys, never WASD", () => {
    const tips = Array.from({ length: BASIC_TIP_COUNT }, (_, i) => pickTip(calm, false, i, keys));
    const all = [...controls(false, keys).flat(), ...tips].join(" ");
    expect(all).toContain("ZQSD");
    expect(all).not.toContain("WASD");
  });

  test("rebound keys (#72) show everywhere: tips, struggle and the list", () => {
    const rebound: TipKeys = { ...keys, jump: "J", attack: "F", interact: "Clic droit", help: "H" };
    expect(pickTip(calm, false, 2, rebound)).toBe("J pour sauter par-dessus une poubelle ou un CRS à terre.");
    expect(pickTip({ ...calm, grabbed: true }, false, 0, rebound)).toBe("Martèle F pour te débattre !");
    expect(pickTip(calm, false, 5, rebound)).toBe("Maintiens clic droit près d'une poubelle pour y mettre le feu.");
    const list = controls(false, rebound);
    expect(list).toContainEqual(["J", "sauter par-dessus une poubelle ou un CRS à terre"]);
    expect(list).toContainEqual(["H", "afficher ou cacher cette aide"]);
    expect(list[0]?.[0]).toBe("ZQSD / flèches");
    expect(list.flat().join(" ")).not.toContain("Espace");
  });
});
