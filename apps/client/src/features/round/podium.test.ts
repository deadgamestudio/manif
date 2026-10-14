import { describe, expect, test } from "bun:test";
import { emptyStats, type RoundEndEvent } from "@manif/shared";
import { laureates } from "./podium.ts";

type Row = RoundEndEvent["players"][number];
const player = (id: string, archetype: number, stats: Partial<Row>): Row => ({
  ...emptyStats(),
  score: 0,
  ...stats,
  id,
  name: `P${id}`,
  archetype,
});

describe("laureates", () => {
  test("ranked by round score (#41), with their awards, archetype and total", () => {
    const ranked = laureates(
      [player("a", 2, { knockdowns: 1, score: 10 }), player("b", 5, { rescues: 2, splats: 1, score: 115, total: 900 }), player("c", 1, { score: 60 })],
      "b",
    );
    expect(ranked.map((l) => [l.name, l.archetype, l.score, l.total, l.awards.length, l.isMe])).toEqual([
      ["Pb", 5, 115, 900, 2, true],
      ["Pc", 1, 60, undefined, 0, false],
      ["Pa", 2, 10, undefined, 1, false],
    ]);
  });

  test("everyone is ranked, even without points or awards", () => {
    expect(laureates([player("a", 0, {})], "a").map((l) => [l.name, l.score, l.awards])).toEqual([["Pa", 0, []]]);
  });

  test("two players with the same name stay apart (#61)", () => {
    const twin = (id: string, stats: Partial<Row>) => ({ ...player(id, 0, stats), name: "Gérard du 93" });
    const ranked = laureates([twin("a", { knockdowns: 2, score: 5 }), twin("b", { rescues: 1, score: 50 })], "b");
    expect(ranked.map((l) => [l.id, l.name, l.awards.length, l.isMe])).toEqual([
      ["b", "Gérard du 93", 1, true],
      ["a", "Gérard du 93", 1, false],
    ]);
  });

  test("ties keep the join order", () => {
    expect(laureates([player("a", 0, { score: 20 }), player("b", 0, { score: 20 }), player("c", 0, { score: 30 })], null).map((l) => l.name)).toEqual([
      "Pc",
      "Pa",
      "Pb",
    ]);
  });
});
