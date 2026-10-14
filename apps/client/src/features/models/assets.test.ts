import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ARCHETYPE_IDS } from "@manif/shared";
import { ARCHETYPE_BODIES, MODELS, bodyUrlFor, modelUrls, stableIndex, type ModelGroup } from "./assets.ts";
import { roundPreloadGroups } from "./preload.ts";

const CLIENT = join(import.meta.dir, "../../..");
const CATALOG = join(CLIENT, "../../assets/manif/catalog.json");
const catalog = new Set((JSON.parse(readFileSync(CATALOG, "utf8")) as { url: string }[]).map((e) => e.url));
const all = (Object.keys(MODELS) as ModelGroup[]).flatMap(modelUrls);

describe("the model URLs", () => {
  test("every one is a file in public/ and in Jordan's catalog", () => {
    for (const url of all) {
      expect(existsSync(join(CLIENT, "public", url)), url).toBe(true);
      expect(catalog.has(url), url).toBe(true);
    }
  });

  test("none comes from a later-concept batch", () => {
    for (const url of all) expect(url).not.toMatch(/vehicule-canon-eau|decors-complements|animations-embarquement|fourgon-v02|personnages-complements/);
  });

  test("every archetype has a body, and a player keeps the same one", () => {
    for (const a of ARCHETYPE_IDS) expect(ARCHETYPE_BODIES[a].length).toBeGreaterThan(0);
    expect(bodyUrlFor(6, "abc")).toBe(bodyUrlFor(6, "abc"));
    expect(bodyUrlFor(99, "abc")).toBe(MODELS.characters.neutral);
    const picks = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map((id) => stableIndex(id, 4)));
    expect(picks.size).toBeGreaterThan(1);
    for (const i of picks) expect(i >= 0 && i < 4).toBe(true);
  });

  test("the preload puts the players' bodies and the clips first, and fetches each file once", () => {
    const groups = roundPreloadGroups([bodyUrlFor(5, "x"), bodyUrlFor(5, "y")]);
    expect(groups[0]).toEqual([MODELS.characters.cgt, MODELS.clipLibraries.protesterCore, MODELS.clipLibraries.protesterExtra]);
    expect(groups[1]).toContain(MODELS.police.policeVan);
    const flat = groups.flat();
    expect(new Set(flat).size).toBe(flat.length);
    expect(new Set(flat)).toEqual(new Set(all));
  });
});
