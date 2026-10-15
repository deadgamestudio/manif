import { describe, expect, test } from "bun:test";
import { ARCHETYPE_IDS, Archetype } from "@manif/shared";
import { KIT_HIDES, cgtKitFor, freshKitState, kitShow, type KitState } from "./cgtKit.ts";

const ids = Array.from({ length: 2000 }, (_, i) => `session-${i}-${(i * 7919).toString(36)}`);

function state(over: Partial<KitState>): KitState {
  return { ...freshKitState(), ...over };
}

describe("cgtKitFor", () => {
  test("only the CGT has a kit", () => {
    for (const a of ARCHETYPE_IDS) {
      if (a === Archetype.Cgt) continue;
      for (const id of ids.slice(0, 100)) expect(cgtKitFor(a, id)).toBeNull();
    }
    expect(cgtKitFor(99, "x")).toBeNull();
  });

  test("is the same for the same player, on every call", () => {
    for (const id of ids.slice(0, 200)) expect(cgtKitFor(Archetype.Cgt, id)).toBe(cgtKitFor(Archetype.Cgt, id));
  });

  test("about half get the barbecue, half the megaphone", () => {
    const merguez = ids.filter((id) => cgtKitFor(Archetype.Cgt, id) === "merguez").length;
    expect(merguez / ids.length).toBeGreaterThan(0.44);
    expect(merguez / ids.length).toBeLessThan(0.56);
    expect(ids.every((id) => cgtKitFor(Archetype.Cgt, id) !== null)).toBe(true);
  });

  test("the megaphone takes the hand the body's own merguez is in", () => {
    expect(KIT_HIDES.megaphone).toEqual(["merguez"]);
    expect(KIT_HIDES.merguez).toEqual([]);
  });
});

describe("kitShow", () => {
  test("the megaphone is in the hand only while that hand is free", () => {
    expect(kitShow("megaphone", freshKitState()).megaphoneInHand).toBe(true);
    const busy: (keyof KitState)[] = ["grabbed", "carried", "carryingPlayer", "posed", "lying", "holdingItem", "swinging", "dodging", "fireBusy"];
    for (const key of busy) expect(kitShow("megaphone", state({ [key]: true })).megaphoneInHand, key).toBe(false);
  });

  test("the barbecue smokes while he is up, goes cold when he is down, and away when held or carried", () => {
    expect(kitShow("merguez", freshKitState())).toMatchObject({ grill: true, smoke: true });
    expect(kitShow("merguez", state({ swinging: true, holdingItem: true, dodging: true }))).toMatchObject({ grill: true, smoke: true });
    expect(kitShow("merguez", state({ lying: true }))).toMatchObject({ grill: true, smoke: false });
    for (const key of ["grabbed", "carried", "posed"] as const) expect(kitShow("merguez", state({ [key]: true })).grill, key).toBe(false);
  });

  test("hands back shared answers, nothing made per call", () => {
    const s = freshKitState();
    expect(kitShow("merguez", s)).toBe(kitShow("merguez", s));
    expect(kitShow("megaphone", s)).toBe(kitShow("megaphone", s));
  });
});
