import { describe, expect, test } from "bun:test";
import { emptyStats, type RoundEndEvent } from "@manif/shared";
import { laureates } from "./podium.ts";

const player = (id: string, archetype: number, stats: Partial<ReturnType<typeof emptyStats>>): RoundEndEvent["players"][number] => ({
  ...emptyStats(),
  ...stats,
  id,
  name: `P${id}`,
  archetype,
});

describe("laureates", () => {
  test("groups awards per protester, most awarded first, with their archetype", () => {
    const ranked = laureates(
      [player("a", 2, { knockdowns: 1 }), player("b", 5, { rescues: 2, splats: 1 }), player("c", 1, {})],
      "b",
    );
    expect(ranked.map((l) => [l.name, l.archetype, l.awards.length, l.isMe])).toEqual([
      ["Pb", 5, 2, true],
      ["Pa", 2, 1, false],
    ]);
  });

  test("two players with the same name get separate steps (#61)", () => {
    const twin = (id: string, stats: Partial<ReturnType<typeof emptyStats>>) => ({ ...player(id, 0, stats), name: "Gérard du 93" });
    const ranked = laureates([twin("a", { knockdowns: 2 }), twin("b", { rescues: 1 })], "b");
    expect(ranked.map((l) => [l.id, l.name, l.awards.length, l.isMe])).toEqual([
      ["a", "Gérard du 93", 1, false],
      ["b", "Gérard du 93", 1, true],
    ]);
  });

  test("ties keep the join order; no awards, no podium", () => {
    expect(laureates([player("a", 0, { slips: 1 }), player("b", 0, { arrests: 1 })], null).map((l) => l.name)).toEqual(["Pa", "Pb"]);
    expect(laureates([player("a", 0, {})], "a")).toEqual([]);
  });
});
