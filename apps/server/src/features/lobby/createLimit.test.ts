import { describe, expect, test } from "bun:test";
import { CreateLimit, maxRoomsFromEnv, type CreateLimitConfig } from "./index.js";

const config: CreateLimitConfig = { burst: 3, refillMs: 1000, maxLivePerVisitor: 2, maxRooms: 4 };

describe("lobby creation limit", () => {
  test("a visitor creates a few lobbies in a row, then waits for the bucket to refill", () => {
    const limit = new CreateLimit({ ...config, maxLivePerVisitor: 10 });
    expect(limit.tryOpen("a", 0)).toEqual({ ok: true });
    limit.closed("a");
    expect(limit.tryOpen("a", 0)).toEqual({ ok: true });
    limit.closed("a");
    expect(limit.tryOpen("a", 0)).toEqual({ ok: true });
    limit.closed("a");
    expect(limit.tryOpen("a", 10)).toEqual({ ok: false, reason: "visitor" });
    // Half a refill is not enough; a full one gives one creation back.
    expect(limit.tryOpen("a", 500)).toEqual({ ok: false, reason: "visitor" });
    expect(limit.tryOpen("a", 1000)).toEqual({ ok: true });
    expect(limit.tryOpen("a", 1001)).toEqual({ ok: false, reason: "visitor" });
  });

  test("the bucket never refills past the burst", () => {
    const limit = new CreateLimit({ ...config, maxLivePerVisitor: 10 });
    limit.tryOpen("a", 0);
    const later = 1_000_000;
    let ok = 0;
    for (let i = 0; i < 10; i++) if (limit.tryOpen("a", later).ok) ok++;
    expect(ok).toBe(3);
  });

  test("visitors don't share a budget", () => {
    const limit = new CreateLimit({ ...config, maxRooms: 100 });
    for (let i = 0; i < 2; i++) expect(limit.tryOpen("a", 0).ok).toBe(true);
    expect(limit.tryOpen("a", 0).ok).toBe(false);
    expect(limit.tryOpen("b", 0).ok).toBe(true);
  });

  test("a visitor has only a few lobbies alive at once; a lobby closing frees a place", () => {
    const limit = new CreateLimit({ ...config, burst: 10 });
    expect(limit.tryOpen("a", 0).ok).toBe(true);
    expect(limit.tryOpen("a", 0).ok).toBe(true);
    expect(limit.tryOpen("a", 0)).toEqual({ ok: false, reason: "visitor" });
    limit.closed("a");
    expect(limit.tryOpen("a", 0).ok).toBe(true);
  });

  test("the server caps lobbies alive at once, whoever asks, and a refusal costs the visitor nothing", () => {
    const limit = new CreateLimit(config);
    for (const key of ["a", "b", "c", "d"]) expect(limit.tryOpen(key, 0).ok).toBe(true);
    expect(limit.live).toBe(4);
    expect(limit.tryOpen("e", 0)).toEqual({ ok: false, reason: "server" });
    limit.closed("a");
    expect(limit.live).toBe(3);
    // e's three creations are all still there.
    expect(limit.tryOpen("e", 0).ok).toBe(true);
    limit.closed("e");
    expect(limit.tryOpen("e", 0).ok).toBe(true);
    limit.closed("e");
    expect(limit.tryOpen("e", 0).ok).toBe(true);
  });

  test("closing more than was opened never goes negative", () => {
    const limit = new CreateLimit(config);
    limit.closed("ghost");
    limit.closed("ghost");
    expect(limit.live).toBe(0);
    expect(limit.tryOpen("ghost", 0).ok).toBe(true);
  });

  test("pruning forgets idle visitors and keeps the ones with a lobby alive", () => {
    const limit = new CreateLimit(config);
    limit.tryOpen("idle", 0);
    limit.closed("idle");
    limit.tryOpen("busy", 0);
    limit.prune(10_000);
    expect(limit.tracked).toBe(1);
    // busy still counts its live lobby.
    limit.tryOpen("busy", 10_000);
    expect(limit.tryOpen("busy", 10_000)).toEqual({ ok: false, reason: "visitor" });
  });

  test("the number of tracked visitors stays bounded", () => {
    const limit = new CreateLimit({ burst: 1, refillMs: 1e12, maxLivePerVisitor: 1, maxRooms: 1e9 });
    for (let i = 0; i < 20_000; i++) {
      limit.tryOpen(`v${i}`, 0);
      limit.closed(`v${i}`);
    }
    expect(limit.tracked).toBeLessThanOrEqual(5_000);
  });

  test("the server cap from the environment", () => {
    expect(maxRoomsFromEnv(undefined)).toBe(100);
    expect(maxRoomsFromEnv("")).toBe(100);
    expect(maxRoomsFromEnv("abc")).toBe(100);
    expect(maxRoomsFromEnv("0")).toBe(100);
    expect(maxRoomsFromEnv("2.5")).toBe(100);
    expect(maxRoomsFromEnv("40")).toBe(40);
  });
});
