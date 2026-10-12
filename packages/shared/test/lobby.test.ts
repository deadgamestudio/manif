import { describe, expect, test } from "bun:test";
import { NAME_MAX_LENGTH } from "../src/constants.js";
import {
  DEFAULT_NAMES,
  nameOrDefault,
  parseLobbyCode,
  pickHost,
  randomDefaultName,
  sanitizeName,
} from "../src/lobby.js";

describe("sanitizeName", () => {
  test("trims and collapses whitespace", () => {
    expect(sanitizeName("  Gérard   du\t93  ")).toBe("Gérard du 93");
  });

  test("caps the length", () => {
    const long = "a".repeat(NAME_MAX_LENGTH + 15);
    expect(sanitizeName(long)).toHaveLength(NAME_MAX_LENGTH);
  });

  test("does not end with a space after capping", () => {
    const name = `${"b".repeat(NAME_MAX_LENGTH - 1)} xyz`;
    expect(sanitizeName(name)).toBe("b".repeat(NAME_MAX_LENGTH - 1));
  });

  test("counts an emoji as one character and never cuts it", () => {
    const name = "✊".repeat(NAME_MAX_LENGTH + 3);
    const out = sanitizeName(name);
    expect(Array.from(out)).toHaveLength(NAME_MAX_LENGTH);
    expect(out).toBe("✊".repeat(NAME_MAX_LENGTH));
  });

  test("drops control and invisible characters", () => {
    expect(sanitizeName("Ma\u0000non\u200b\n la\u202eBobo")).toBe("Manon laBobo");
    expect(sanitizeName("a \u200b b")).toBe("a b");
  });

  test("empty, blank and non-string input give an empty name", () => {
    expect(sanitizeName("")).toBe("");
    expect(sanitizeName("   \n\t ")).toBe("");
    expect(sanitizeName(undefined)).toBe("");
    expect(sanitizeName(42)).toBe("");
    expect(sanitizeName({ name: "x" })).toBe("");
  });
});

describe("default names", () => {
  test("every default name is already clean and short enough", () => {
    for (const name of DEFAULT_NAMES) expect(sanitizeName(name)).toBe(name);
  });

  test("randomDefaultName covers the list and stays in range", () => {
    expect(randomDefaultName(() => 0)).toBe(DEFAULT_NAMES[0]!);
    expect(randomDefaultName(() => 0.999999)).toBe(DEFAULT_NAMES[DEFAULT_NAMES.length - 1]!);
    expect(randomDefaultName(() => 1)).toBe(DEFAULT_NAMES[DEFAULT_NAMES.length - 1]!);
  });

  test("nameOrDefault falls back only when the name is empty", () => {
    expect(nameOrDefault("  Dédé  ", () => 0)).toBe("Dédé");
    expect(nameOrDefault("   ", () => 0)).toBe(DEFAULT_NAMES[0]!);
    expect(nameOrDefault(null, () => 0)).toBe(DEFAULT_NAMES[0]!);
  });

  test("duplicates are allowed", () => {
    expect(sanitizeName("Gérard du 93")).toBe(sanitizeName("Gérard du 93"));
  });
});

describe("pickHost", () => {
  test("picks the player who joined first", () => {
    expect(
      pickHost([
        { id: "c", joinedAt: 3 },
        { id: "a", joinedAt: 1 },
        { id: "b", joinedAt: 2 },
      ]),
    ).toBe("a");
  });

  test("hand-over order: host leaves, then the next oldest takes over, and so on", () => {
    const room = new Map([
      ["first", 0],
      ["second", 1],
      ["third", 2],
      ["fourth", 3],
    ]);
    const host = () => pickHost(Array.from(room, ([id, joinedAt]) => ({ id, joinedAt })));
    expect(host()).toBe("first");
    room.delete("first");
    expect(host()).toBe("second");
    // A non-host leaving does not change the host.
    room.delete("third");
    expect(host()).toBe("second");
    room.set("late", 4);
    room.delete("second");
    expect(host()).toBe("fourth");
    room.delete("fourth");
    expect(host()).toBe("late");
    room.delete("late");
    expect(host()).toBe("");
  });

  test("ties break on id so the result does not depend on order", () => {
    const a = { id: "a", joinedAt: 5 };
    const b = { id: "b", joinedAt: 5 };
    expect(pickHost([a, b])).toBe("a");
    expect(pickHost([b, a])).toBe("a");
  });

  test("nobody left gives an empty host", () => {
    expect(pickHost([])).toBe("");
  });
});

describe("parseLobbyCode", () => {
  test("accepts a bare code", () => {
    expect(parseLobbyCode("  aB3_x-9Qz ")).toBe("aB3_x-9Qz");
  });

  test("accepts an invite link", () => {
    expect(parseLobbyCode("http://localhost:5173/?lobby=Xy12AbC9z")).toBe("Xy12AbC9z");
    expect(parseLobbyCode("https://manif.example/?foo=1&lobby=Xy12AbC9z#top")).toBe("Xy12AbC9z");
  });

  test("rejects junk", () => {
    expect(parseLobbyCode("")).toBe("");
    expect(parseLobbyCode("   ")).toBe("");
    expect(parseLobbyCode("not a code")).toBe("");
    expect(parseLobbyCode("https://manif.example/?other=1")).toBe("");
  });
});
