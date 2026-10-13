import { describe, expect, test } from "bun:test";
import { emptyStats, roundAwards, type RoundEndEvent } from "./stats.js";

const player = (name: string, stats: Partial<ReturnType<typeof emptyStats>>): RoundEndEvent["players"][number] => ({
  id: name,
  name,
  ...emptyStats(),
  ...stats,
});

describe("roundAwards", () => {
  test("one award per stat, to the highest count", () => {
    const awards = roundAwards([player("A", { knockdowns: 3, rescues: 1 }), player("B", { knockdowns: 5, propsBroken: 2 })]);
    expect(awards.map((a) => [a.title, a.name, a.value])).toEqual([
      ["Pilier de bitume", "B", 5],
      ["Ange gardien du cortège", "A", 1],
      ["Ennemi du mobilier urbain", "B", 2],
    ]);
  });

  test("nobody did anything: no award", () => {
    expect(roundAwards([player("A", {})])).toEqual([]);
    expect(roundAwards([])).toEqual([]);
  });

  test("lighting fires (#16) earns its own award", () => {
    expect(roundAwards([player("A", { firesLit: 2 })])).toEqual([{ title: "Pyromane du dimanche", name: "A", value: 2, unit: "feux allumés" }]);
  });

  test("throwing teammates (#11) earns its own award", () => {
    expect(roundAwards([player("A", { teammatesThrown: 3 })])).toEqual([{ title: "Catapulte humaine", name: "A", value: 3, unit: "camarades lancés" }]);
  });

  test("a tie goes to the first player", () => {
    expect(roundAwards([player("A", { arrests: 2 }), player("B", { arrests: 2 })])[0]!.name).toBe("A");
  });
});
