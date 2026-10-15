import { describe, expect, test } from "bun:test";
import { ARCHETYPE_IDS, Archetype } from "@manif/shared";
import { ARCHETYPE_BODIES, MODELS, bodyUrlFor } from "../models/index.ts";
import { ACCESSORY_BONE, BODY_WEARS, TINTS, accessoriesFor, type AccessoryName } from "./accessories.ts";

const ids = Array.from({ length: 2000 }, (_, i) => `session-${i}-${(i * 7919).toString(36)}`);
const HEAD = new Set<AccessoryName>(["beanie", "cap", "cgtCap", "beret", "bandana"]);
const BACK = new Set<AccessoryName>(["backpack", "toteBag", "flag", "placard"]);
const POLICE_NAVY = ["#1f3460", "#121a2c", "#364562"];

function wearsOf(archetype: number, id: string) {
  return accessoriesFor(archetype, bodyUrlFor(archetype, id), id);
}

function distance(a: string, b: string): number {
  const c = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [c(a), c(b)];
  return Math.hypot(x[0]! - y[0]!, x[1]! - y[1]!, x[2]! - y[2]!);
}

describe("accessoriesFor", () => {
  test("is the same for the same player, on every call", () => {
    for (const a of ARCHETYPE_IDS) for (const id of ids.slice(0, 50)) expect(wearsOf(a, id)).toEqual(wearsOf(a, id));
  });

  test("knows every protester body, and every item has a model and a bone", () => {
    for (const bodies of Object.values(ARCHETYPE_BODIES)) for (const url of bodies) expect(BODY_WEARS[url]).toBeDefined();
    for (const name of Object.keys(MODELS.accessories) as AccessoryName[]) expect(["head", "spine"]).toContain(ACCESSORY_BONE[name]);
  });

  test("wears at most two items, one per slot", () => {
    for (const a of ARCHETYPE_IDS) {
      for (const id of ids.slice(0, 500)) {
        const names = wearsOf(a, id).map((w) => w.name);
        expect(names.length).toBeLessThanOrEqual(2);
        expect(names.filter((n) => HEAD.has(n)).length).toBeLessThanOrEqual(1);
        expect(names.filter((n) => BACK.has(n)).length).toBeLessThanOrEqual(1);
        expect(names.filter((n) => n === "scarf").length).toBeLessThanOrEqual(1);
      }
    }
  });

  test("never doubles what the body already wears", () => {
    for (const a of ARCHETYPE_IDS) {
      for (const id of ids.slice(0, 500)) {
        const wears = BODY_WEARS[bodyUrlFor(a, id)]!;
        for (const { name } of wearsOf(a, id)) {
          if (wears.hat) expect(HEAD.has(name) && name !== "bandana").toBe(false);
          if (wears.mask) expect(["bandana", "scarf"]).not.toContain(name);
          if (wears.scarf) expect(name).not.toBe("scarf");
          if (wears.backpack) expect(["backpack", "toteBag"]).not.toContain(name);
          if (wears.sign) expect(["flag", "placard"]).not.toContain(name);
        }
      }
    }
    // The black bloc keeps its own hood and mask; the CGT its union flag.
    for (const id of ids) {
      expect(wearsOf(Archetype.BlackBloc, id).every((w) => BACK.has(w.name))).toBe(true);
      expect(wearsOf(Archetype.Cgt, id).some((w) => w.name === "flag" || w.name === "placard")).toBe(false);
    }
  });

  test("leaves a fair share bare, and keeps flags and placards rare", () => {
    let bare = 0;
    let tall = 0;
    let n = 0;
    for (const a of ARCHETYPE_IDS) {
      let bareHere = 0;
      for (const id of ids) {
        const names = wearsOf(a, id).map((w) => w.name);
        if (names.length === 0) bareHere++;
        if (names.includes("flag") || names.includes("placard")) tall++;
        n++;
      }
      expect(bareHere / ids.length).toBeGreaterThan(0.15);
      bare += bareHere;
    }
    expect(bare / n).toBeGreaterThan(0.2);
    expect(bare / n).toBeLessThan(0.6);
    expect(tall / n).toBeGreaterThan(0.05);
    expect(tall / n).toBeLessThan(0.2);
  });

  test("leans on the archetype: the CGT cap goes to the CGT, berets to bobos more than to anyone", () => {
    const count = (a: number, name: AccessoryName) => ids.filter((id) => wearsOf(a, id).some((w) => w.name === name)).length;
    expect(count(Archetype.Cgt, "cgtCap")).toBeGreaterThan(ids.length / 4);
    for (const a of ARCHETYPE_IDS) if (a !== Archetype.Cgt) expect(count(a, "cgtCap")).toBe(0);
    expect(count(Archetype.Bobo, "beret")).toBeGreaterThan(count(Archetype.Lambda, "beret"));
    expect(count(Archetype.Bobo, "toteBag")).toBeGreaterThan(count(Archetype.Lambda, "toteBag"));
  });

  test("tints from short lists, never near the police navy", () => {
    const paints = new Set<string>();
    for (const a of ARCHETYPE_IDS) for (const id of ids) for (const w of wearsOf(a, id)) if (w.paint) paints.add(JSON.stringify([w.name, w.paint]));
    // A handful of textures per item, whatever the number of players.
    expect(paints.size).toBeLessThan(40);
    for (const tint of Object.values(TINTS)) {
      for (const c of tint.colours) {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
        // Near-black: never blue-tinted, so it reads black next to the navy (as protesterLook.test.ts).
        if (Math.max(r, g, b) < 48) expect(b).toBeLessThanOrEqual(r);
        else for (const navy of POLICE_NAVY) expect(distance(c, navy)).toBeGreaterThan(40);
      }
    }
    // The dark blue cells of the cap and the backpack are always repainted.
    for (const id of ids.slice(0, 300)) {
      for (const w of wearsOf(Archetype.Lambda, id)) if (w.name === "cap" || w.name === "backpack") expect(w.paint?.[12]).toBeDefined();
    }
  });

  test("an unknown archetype or body wears nothing", () => {
    expect(accessoriesFor(99, MODELS.characters.neutral, "abc")).toEqual([]);
    expect(accessoriesFor(Archetype.Lambda, "/nope.glb", "abc")).toEqual([]);
  });
});
