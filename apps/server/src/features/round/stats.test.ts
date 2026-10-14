import { describe, expect, test } from "bun:test";
import { ACTION_POINTS } from "@manif/shared";
import { RoundStats } from "./stats.js";

function tracked() {
  const synced = new Map<string, number>();
  const stats = new RoundStats((id, score) => synced.set(id, score));
  return { stats, synced };
}

describe("RoundStats scoring (#41)", () => {
  test("each counted action scores, and the synced score follows", () => {
    const { stats, synced } = tracked();
    stats.add("a", "crsOut");
    stats.add("a", "propsBroken");
    stats.add("a", "rescues");
    expect(stats.score("a")).toBe(60 + 10 + 50);
    expect(synced.get("a")).toBe(120);
    expect(stats.get("a").crsOut).toBe(1);
  });

  test("an arrest costs points, never below 0", () => {
    const { stats, synced } = tracked();
    stats.add("a", "propsBroken");
    stats.add("a", "arrests");
    expect(stats.score("a")).toBe(0);
    expect(synced.get("a")).toBe(0);
    stats.add("a", "arrests");
    expect(stats.score("a")).toBe(0);
    expect(stats.get("a").arrests).toBe(2);
  });

  test("per-round caps: props past the cap still count for the awards, not for points", () => {
    const { stats } = tracked();
    const cap = ACTION_POINTS.propsBroken?.cap ?? 0;
    for (let i = 0; i < cap + 5; i++) stats.add("a", "propsBroken");
    expect(stats.get("a").propsBroken).toBe(cap + 5);
    expect(stats.score("a")).toBe(cap * 10);
  });

  test("heals score per HP given, in one call", () => {
    const { stats } = tracked();
    stats.add("cgt", "hpHealed", 7);
    expect(stats.get("cgt").hpHealed).toBe(7);
    expect(stats.score("cgt")).toBe(7);
  });

  test("jokes count but don't score, and don't touch the synced score", () => {
    const { stats, synced } = tracked();
    stats.add("a", "slips");
    stats.add("a", "knockdowns");
    expect(stats.score("a")).toBe(0);
    expect(synced.has("a")).toBe(false);
  });

  test("the end bonus adds up; leaving or a new march forgets everything", () => {
    const { stats } = tracked();
    stats.add("a", "crsOut");
    stats.bonus("a", 150);
    expect(stats.score("a")).toBe(210);
    stats.remove("a");
    expect(stats.score("a")).toBe(0);
    stats.add("b", "crsOut");
    stats.clear();
    expect(stats.score("b")).toBe(0);
  });
});
