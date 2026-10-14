import { describe, expect, test } from "bun:test";
import { RING_COLORS, ringColorFor } from "./ringColor.ts";

describe("ringColorFor", () => {
  test("is stable for one id", () => {
    expect(ringColorFor("abc123")).toBe(ringColorFor("abc123"));
  });

  test("always picks from the palette", () => {
    for (const id of ["", "a", "Xy9_-kQ", "bot:7", "a-very-long-session-id-0123456789"]) {
      expect(RING_COLORS).toContain(ringColorFor(id));
    }
  });

  test("spreads ids over several colours", () => {
    const seen = new Set(Array.from({ length: 40 }, (_, i) => ringColorFor(`session${i}`)));
    expect(seen.size).toBeGreaterThan(4);
  });
});
