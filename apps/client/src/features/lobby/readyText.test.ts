import { describe, expect, test } from "bun:test";
import { notReadyLine, readyCount } from "./readyText.ts";

describe("notReadyLine", () => {
  test("names who isn't ready, in French", () => {
    expect(notReadyLine([])).toBe("");
    expect(notReadyLine(["Gérard"])).toBe("Gérard n'est pas prêt·e.");
    expect(notReadyLine(["Gérard", "Manon"])).toBe("Gérard et Manon ne sont pas prêt·es.");
    expect(notReadyLine(["A", "B", "C"])).toBe("A, B et C ne sont pas prêt·es.");
  });
});

describe("readyCount", () => {
  test("hidden for a host alone, plural from 2", () => {
    expect(readyCount(0, 0)).toBe("");
    expect(readyCount(1, 3)).toBe("1 prêt·e sur 3");
    expect(readyCount(2, 2)).toBe("2 prêt·es sur 2");
  });
});
