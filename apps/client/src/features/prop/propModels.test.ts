import { describe, expect, test } from "bun:test";
import { propLookState, propModelFit, propModelUrl, type PropModelSet } from "./propModels.ts";

const FULL: PropModelSet = { intact: "i", broken: "b", burning: "f", charred: "c" };
const PLAIN: PropModelSet = { intact: "i", broken: "b" };

describe("propLookState", () => {
  test("charred wins over burning, which wins over broken", () => {
    expect(propLookState({ broken: true, charred: true, burning: true })).toBe("charred");
    expect(propLookState({ broken: true, charred: false, burning: true })).toBe("burning");
    expect(propLookState({ broken: true, charred: false, burning: false })).toBe("broken");
    expect(propLookState({ broken: false, charred: false, burning: false })).toBe("intact");
  });
});

describe("propModelUrl", () => {
  test("each state has its own model when the kind has one", () => {
    expect(propModelUrl(FULL, "intact", false)).toBe("i");
    expect(propModelUrl(FULL, "broken", true)).toBe("b");
    expect(propModelUrl(FULL, "burning", false)).toBe("f");
    expect(propModelUrl(FULL, "charred", true)).toBe("c");
  });

  test("without a burning model it stays intact or broken; without a charred one, broken", () => {
    expect(propModelUrl(PLAIN, "burning", false)).toBe("i");
    expect(propModelUrl(PLAIN, "burning", true)).toBe("b");
    expect(propModelUrl(PLAIN, "charred", false)).toBe("b");
  });
});

describe("propModelFit", () => {
  test("a model the size of its box sits as it is, nose down the right-hand lane", () => {
    expect(propModelFit([1.8, 1.5, 4.2], [2, 4.2], -5)).toEqual({ yaw: 0, scale: 1 });
    expect(propModelFit([1.8, 1.5, 4.2], [2, 4.2], 5)).toEqual({ yaw: Math.PI, scale: 1 });
  });

  test("a model long the other way turns a quarter to face the street and shrinks to fit", () => {
    // The bus shelter: 4 x 1.5 against a 1.2 x 3.2 box.
    const right = propModelFit([4, 2.5, 1.49], [1.2, 3.2], 7.9);
    expect(right.yaw).toBe(-Math.PI / 2);
    expect(right.scale).toBeCloseTo(0.8);
    expect(propModelFit([4, 2.5, 1.49], [1.2, 3.2], -7.8).yaw).toBe(Math.PI / 2);
  });

  test("a model smaller than its box is never stretched up", () => {
    expect(propModelFit([0.5, 1, 0.57], [1, 1], 8).scale).toBe(1);
  });
});
