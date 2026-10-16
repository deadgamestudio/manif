import { describe, expect, test } from "bun:test";
import { ARCHETYPE_IDS, Archetype } from "@manif/shared";
import { MODELS, SKIN_CELL } from "../models/index.ts";
import { BODY_CELLS, WARDROBES } from "./protesterLook.ts";
import { PORTRAIT_PERSON, portraitBodyUrl, portraitPaint } from "./portrait.ts";

describe("lobby portraits (#126)", () => {
  test("every archetype gets a known body, the étudiant·e the lycéen hoodie", () => {
    for (const id of ARCHETYPE_IDS) expect(BODY_CELLS[portraitBodyUrl(id)]).toBeDefined();
    expect(portraitBodyUrl(Archetype.Etudiant)).toBe(MODELS.characters.lyceenHoodie);
  });

  test("the signature colour is the first of the wardrobe, the skin the same for all", () => {
    for (const id of ARCHETYPE_IDS) {
      const paint = portraitPaint(id);
      const cells = BODY_CELLS[portraitBodyUrl(id)]!;
      expect(paint[cells.key!]).toBe(WARDROBES[id].key[0]!);
      expect(paint[SKIN_CELL]).toBe(PORTRAIT_PERSON.skin);
    }
  });

  test("the retraité keeps his grey hair", () => {
    const cells = BODY_CELLS[portraitBodyUrl(Archetype.Retraite)]!;
    expect(portraitPaint(Archetype.Retraite)[cells.hair!]).toBe(WARDROBES[Archetype.Retraite].hair![0]!);
  });
});
