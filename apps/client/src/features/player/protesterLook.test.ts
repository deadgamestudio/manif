import { describe, expect, test } from "bun:test";
import { ARCHETYPE_IDS, Archetype } from "@manif/shared";
import { ARCHETYPE_BODIES, SKIN_CELL, bodyUrlFor } from "../models/index.ts";
import { BODY_CELLS, PEOPLE, WARDROBES, personFor, protesterPaint } from "./protesterLook.ts";

/** The police uniform (crs/policeBand.ts POLICE_PAINT, #109): no protester may wear anything close. */
const POLICE_NAVY = ["#1f3460", "#121a2c", "#364562"];

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Hue in degrees and lightness in [0, 1] (HSL). */
function hueLight(hex: string): { hue: number; light: number; sat: number } {
  const [r, g, b] = rgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { hue: 0, light, sat: 0 };
  const sat = d / (1 - Math.abs(2 * light - 1));
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { hue, light, sat };
}

const ids = Array.from({ length: 300 }, (_, i) => `session-${i}-${(i * 7919).toString(36)}`);
const clothes = Object.values(WARDROBES).flatMap((w) => [...w.key, ...(w.trousers ?? []), ...(w.accent ?? [])]);

describe("protesterPaint", () => {
  test("is the same for the same id, on every call", () => {
    for (const a of ARCHETYPE_IDS) expect(protesterPaint(a, "abc")).toEqual(protesterPaint(a, "abc"));
  });

  test("knows the cells of every protester body", () => {
    for (const bodies of Object.values(ARCHETYPE_BODIES)) for (const url of bodies) expect(BODY_CELLS[url]).toBeDefined();
  });

  test("paints the skin, the signature colour and only palette cells", () => {
    for (const a of ARCHETYPE_IDS) {
      for (const id of ids.slice(0, 40)) {
        const paint = protesterPaint(a, id);
        expect(PEOPLE.map((p) => p.skin)).toContain(paint[SKIN_CELL] ?? "");
        const key = BODY_CELLS[bodyUrlFor(a, id)]?.key;
        expect(key).toBeDefined();
        expect(WARDROBES[a as Archetype].key).toContain(paint[key ?? -1] ?? "");
        for (const cell of Object.keys(paint)) expect(Number(cell)).toBeLessThan(16);
      }
    }
  });

  test("gives one archetype several looks, and a bounded number of them", () => {
    for (const a of ARCHETYPE_IDS) {
      const looks = new Set(ids.map((id) => JSON.stringify(protesterPaint(a, id))));
      expect(looks.size).toBeGreaterThan(8);
      // Within a room of 8 (plus BACs) that is one texture per body at most; over a session, a few hundred 16×1 strips at worst.
      expect(looks.size).toBeLessThanOrEqual(ids.length);
    }
  });

  test("picks each part on its own (close ids don't all get the same jacket and scarf)", () => {
    const pairs = new Set(ids.map((id) => {
      const p = protesterPaint(Archetype.Bobo, id);
      return `${p[3]}/${p[0]}`;
    }));
    expect(pairs.size).toBe(WARDROBES[Archetype.Bobo].key.length * (WARDROBES[Archetype.Bobo].accent?.length ?? 1));
    const bobos = new Set(["a", "b", "c", "d", "e", "f"].map((s) => protesterPaint(Archetype.Bobo, `room-${s}`)[3]));
    expect(bobos.size).toBeGreaterThan(1);
  });

  test("draws skin tones from the id alone, spread over the list", () => {
    const seen = new Set(ids.map((id) => personFor(id).skin));
    expect(seen.size).toBe(PEOPLE.length);
    for (const id of ids.slice(0, 20)) {
      const skins = new Set(ARCHETYPE_IDS.map((a) => protesterPaint(a, id)[SKIN_CELL]));
      expect(skins.size).toBe(1);
    }
  });

  test("keeps the black bloc black, and neutral or warm (not blue)", () => {
    for (const c of WARDROBES[Archetype.BlackBloc].key) {
      const [r, g, b] = rgb(c);
      expect(Math.max(r, g, b)).toBeLessThan(40);
      expect(b).toBeLessThanOrEqual(r);
    }
  });

  test("never dresses a protester anywhere near the police navy", () => {
    for (const c of clothes) {
      const [r, g, b] = rgb(c);
      // Near-black (the bloc, dark trousers): never blue-tinted, so it reads black next to the navy.
      if (Math.max(r, g, b) < 48) {
        expect(b).toBeLessThanOrEqual(r);
        continue;
      }
      for (const p of POLICE_NAVY) {
        const [pr, pg, pb] = rgb(p);
        expect(Math.hypot(r - pr, g - pg, b - pb)).toBeGreaterThan(30);
      }
      // No dark or mid blue at all: anything with a blue cast stays light (the lambda's k-way).
      const { hue, light, sat } = hueLight(c);
      if (sat > 0.12 && hue >= 190 && hue <= 270) expect(light).toBeGreaterThan(0.5);
    }
  });
});
