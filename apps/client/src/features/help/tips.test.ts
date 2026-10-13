import { describe, expect, test } from "bun:test";
import { ThrowableKind } from "@manif/shared";
import { BASIC_TIP_COUNT, controls, pickTip, type TipSituation } from "./tips.ts";

const calm: TipSituation = { prompted: false, helpless: false, gassed: false, carrying: ThrowableKind.None };

describe("pickTip", () => {
  test("says nothing when another prompt already speaks or the player can't act", () => {
    expect(pickTip({ ...calm, prompted: true, gassed: true }, false, 0)).toBe("");
    expect(pickTip({ ...calm, helpless: true }, true, 0)).toBe("");
  });

  test("the gas comes before the item in hand", () => {
    expect(pickTip({ ...calm, gassed: true, carrying: ThrowableKind.Pave }, false, 0)).toContain("Maj");
    expect(pickTip({ ...calm, gassed: true }, true, 0)).toContain("Esquive");
  });

  test("holding something: how to throw it, named", () => {
    expect(pickTip({ ...calm, carrying: ThrowableKind.Tomate }, false, 3)).toBe("Clic pour lancer ta tomate vers la souris.");
    expect(pickTip({ ...calm, carrying: ThrowableKind.Pave }, true, 3)).toContain("Taper");
  });

  test("otherwise the objective first, then the basics in turn, wrapping around", () => {
    expect(pickTip(calm, false, 0)).toStartWith("Objectif");
    expect(pickTip(calm, false, BASIC_TIP_COUNT)).toBe(pickTip(calm, false, 0));
    expect(pickTip(calm, false, 1)).toContain("ZQSD");
  });

  test("the keyboard help names AZERTY keys, never WASD", () => {
    const tips = Array.from({ length: BASIC_TIP_COUNT }, (_, i) => pickTip(calm, false, i));
    const all = [...controls(false).flat(), ...tips].join(" ");
    expect(all).toContain("ZQSD");
    expect(all).not.toContain("WASD");
  });
});
