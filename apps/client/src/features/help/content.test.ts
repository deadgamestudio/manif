import { describe, expect, test } from "bun:test";
import {
  ACTION_POINTS,
  ARCHETYPES,
  ARCHETYPE_IDS,
  ARRIVED_BONUS,
  Archetype,
  CRS_STATS,
  CrsKind,
  GRAB_HP_THRESHOLD,
  MOLUCHAN,
  DOUANE,
  BENANAS,
  PROP_TYPES,
  ROUND_DURATION,
  SHOP_KINDS,
  WIN_BONUS,
  type RoundPlayerStats,
} from "@manif/shared";
import { DEFAULT_KEYMAP, type Keymap } from "../controls/keymap.ts";
import { keyLabels } from "../controls/labels.ts";
import {
  POLICE_KINDS,
  RULES,
  SCORE_LABELS,
  archetypeCards,
  archetypeChips,
  douaneCard,
  benanasCard,
  duration,
  moluchanCard,
  policeCards,
  scoreRows,
  shopRows,
} from "./content.ts";
import { controls } from "./tips.ts";

describe("the help page can't drift from the game (#71)", () => {
  test("every archetype has a card, in the lobby's order, with its own texts", () => {
    const cards = archetypeCards();
    expect(cards.map((c) => c.id)).toEqual([...ARCHETYPE_IDS]);
    for (const c of cards) {
      expect(c.name).toBe(ARCHETYPES[c.id].name);
      expect(c.strength).toBe(ARCHETYPES[c.id].strength);
      expect(c.weakness).toBe(ARCHETYPES[c.id].weakness);
    }
  });

  test("archetype chips come from the stats: none for the plain protester, the real HP otherwise", () => {
    expect(archetypeChips(ARCHETYPES[Archetype.Lambda].stats)).toEqual([]);
    const gilet = archetypeChips(ARCHETYPES[Archetype.GiletJaune].stats).map((c) => c.text);
    expect(gilet).toContain(`${ARCHETYPES[Archetype.GiletJaune].stats.maxHp} PV`);
    expect(gilet).toContain("Vitesse −15 %");
    const cite = archetypeChips(ARCHETYPES[Archetype.Cite].stats);
    expect(cite.find((c) => c.text.endsWith("PV"))?.good).toBe(false);
    expect(cite.find((c) => c.text.startsWith("Vitesse"))).toEqual({ text: "Vitesse +12 %", good: true });
    // Every archetype but the plain one changes something the page shows.
    for (const id of ARCHETYPE_IDS) if (id !== Archetype.Lambda) expect(archetypeChips(ARCHETYPES[id].stats).length).toBeGreaterThan(0);
  });

  test("every scored action has a label and a row with its points, plus the two bonuses", () => {
    const stats = Object.keys(ACTION_POINTS) as (keyof RoundPlayerStats)[];
    for (const stat of stats) expect(SCORE_LABELS[stat], stat).toBeDefined();
    const rows = scoreRows();
    expect(rows).toHaveLength(stats.length + 2);
    for (const stat of stats) {
      const row = rows.find((r) => r.what === SCORE_LABELS[stat]);
      const points = ACTION_POINTS[stat]?.points ?? 0;
      expect(row?.points, stat).toBe(points > 0 ? `+${points}` : `−${Math.abs(points)}`);
      expect(row?.bad).toBe(points < 0);
    }
    expect(rows.map((r) => r.points)).toContain(`+${WIN_BONUS}`);
    expect(rows.map((r) => r.points)).toContain(`+${ARRIVED_BONUS}`);
    // An uncapped penalty (the arrest) says so rather than "Infinity".
    expect(rows.some((r) => r.cap.includes("Infinity"))).toBe(false);
  });

  test("every shop kind (#68) has a row, with its hits from PROP_TYPES", () => {
    const rows = shopRows();
    expect(rows).toHaveLength(SHOP_KINDS.length);
    SHOP_KINDS.forEach((kind, i) => expect(rows[i]?.hits).toBe(PROP_TYPES[kind].maxHp));
    expect(rows.find((r) => r.name === "Banque")?.drops).toBe(`${PROP_TYPES.banque.drops} pavés`);
    expect(rows.find((r) => r.name === "Toilettage pour chiens")?.drops).toBe(`${PROP_TYPES.toilettage.drops} crottes`);
    // #117: the new kinds are listed, with their parody signs.
    expect(rows.find((r) => r.name === "Pharmacie")?.signs).toContain("Pharmacie du Cortège");
    expect(rows.find((r) => r.name === "Fast-food burger")?.signs).toContain("McDodo");
  });

  test("every police unit has a card; the pompiers are not police", () => {
    const kinds = policeCards().flatMap((c) => (c.kind === undefined ? [] : [c.kind]));
    for (const kind of POLICE_KINDS) expect(kinds, `CrsKind ${kind}`).toContain(kind);
    expect(POLICE_KINDS).not.toContain(CrsKind.Pompier);
    expect(policeCards().find((c) => c.kind === CrsKind.Crs)?.tip).toContain(`${CRS_STATS[CrsKind.Crs].maxHp} coups`);
  });

  test("Moluchan's card (#85) quotes his ring's numbers", () => {
    const card = moluchanCard();
    expect(card.chips.map((c) => c.text)).toEqual([
      "Vitesse +15 %",
      `Se débat ×${String(MOLUCHAN.struggleFactor).replace(".", ",")}`,
      `Soigne ${MOLUCHAN.healRate} PV/s`,
    ]);
    expect(card.what).toContain(`${Math.round(MOLUCHAN.chance * 100)} %`);
    expect(card.tip).toContain("CRS");
  });

  test("La Douane's card (#120): only his meme name, his chance, no damage", () => {
    const card = douaneCard();
    expect(card.name).toBe("La Douane");
    expect(card.what).toContain(`${Math.round(DOUANE.chance * 100)} %`);
    expect(card.chips.map((c) => c.text)).toContain("0 PV de dégâts");
    expect(card.tip).toContain("Personne ne peut le toucher");
  });

  test("Bénanas's card (#123): his mangled name, his chance, his hits, the bonus from the points table", () => {
    const card = benanasCard();
    expect(card.name).toBe("Alexandre Bénanas");
    expect(card.what).toContain(`${Math.round(BENANAS.chance * 100)} %`);
    expect(card.what).toContain("n'arrête personne");
    expect(card.chips.map((c) => c.text)).toContain(`${BENANAS.hp} coups et il est démasqué`);
    expect(card.chips.map((c) => c.text)).toContain(`+${ACTION_POINTS.benanasUnmasked?.points} pts à chaque frappeur`);
    expect(card.tip).toContain("CRS l'ignorent");
  });

  test("the rules quote the constants (#70's grab rules included)", () => {
    expect(RULES.roundTime).toBe(duration(ROUND_DURATION));
    expect(duration(480)).toBe("8 min");
    expect(duration(1.5)).toBe("1,5 s");
    expect(RULES.grabHp).toBe(GRAB_HP_THRESHOLD);
    expect(RULES.windup).toBe(String(CRS_STATS[CrsKind.Crs].grabWindup).replace(".", ","));
  });
});

describe("the controls on the page show the player's own keys (#72)", () => {
  test("the default keymap reads ZQSD, clic, Espace, Maj, E on AZERTY", () => {
    const rows = controls(false, keyLabels(DEFAULT_KEYMAP), "page");
    expect(rows[0]?.[0]).toBe("ZQSD / flèches");
    expect(rows.map(([k]) => k)).toEqual(expect.arrayContaining(["Clic", "Espace", "Maj", "E", "M", "C"]));
  });

  test("a rebound key replaces the default one", () => {
    const rebound: Keymap = { ...DEFAULT_KEYMAP, jump: ["KeyJ", null], interact: ["Mouse2", null] };
    const rows = controls(false, keyLabels(rebound), "page");
    expect(rows).toContainEqual(["J", "sauter par-dessus une poubelle ou un CRS à terre"]);
    expect(rows.map(([k]) => k)).toContain("Clic droit maintenu");
    expect(rows.map(([k]) => k)).not.toContain("Espace");
  });

  test("on the page, the help key opens the in-game list (not \"this help\")", () => {
    const keys = keyLabels(DEFAULT_KEYMAP);
    expect(controls(false, keys, "page").find(([k]) => k === "C")?.[1]).not.toContain("cette aide");
    expect(controls(false, keys).find(([k]) => k === "C")?.[1]).toContain("cette aide");
  });

  test("the touch list has the board and sound chips", () => {
    const keys = controls(true, keyLabels(DEFAULT_KEYMAP)).map(([k]) => k);
    expect(keys).toContain("📋");
    expect(keys).toContain("🔊");
  });
});
