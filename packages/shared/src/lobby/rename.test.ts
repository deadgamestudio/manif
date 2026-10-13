import { describe, expect, test } from "bun:test";
import { Phase } from "../round/constants.js";
import { NAME_MAX_LENGTH, RENAME_COOLDOWN_MS } from "./constants.js";
import { checkRename, nameKey, renameAllowedAt } from "./rename.js";

const room = [
  { id: "a", name: "Gérard du 93" },
  { id: "b", name: "Manon la Bobo" },
];

describe("checkRename", () => {
  test("accepts a new name, cleaned", () => {
    expect(checkRename("  Dédé   Merguez ", Phase.Waiting, "a", room)).toEqual({ ok: true, name: "Dédé Merguez" });
  });

  test("cuts a long name to NAME_MAX_LENGTH without splitting an emoji", () => {
    const res = checkRename("🔥".repeat(NAME_MAX_LENGTH + 5), Phase.Waiting, "a", room);
    expect(res).toEqual({ ok: true, name: "🔥".repeat(NAME_MAX_LENGTH) });
  });

  test("refuses an empty name: spaces, invisible characters, not a string", () => {
    for (const raw of ["   ", "​​", "\t\n", 42, null, undefined, { name: "x" }]) {
      expect(checkRename(raw, Phase.Waiting, "a", room)).toEqual({ ok: false, reason: "empty" });
    }
  });

  test("refuses another player's name, any case or spacing", () => {
    expect(checkRename("manon  LA bobo ", Phase.Waiting, "a", room)).toEqual({ ok: false, reason: "taken" });
  });

  test("your own name is a no-op, not an error; a new case of it is a change", () => {
    expect(checkRename(" Gérard du 93", Phase.Waiting, "a", room)).toEqual({ ok: false, reason: "unchanged" });
    expect(checkRename("GÉRARD DU 93", Phase.Waiting, "a", room)).toEqual({ ok: true, name: "GÉRARD DU 93" });
  });

  test("locked outside the lobby", () => {
    expect(checkRename("Dédé", Phase.Marching, "a", room)).toEqual({ ok: false, reason: "locked" });
    expect(checkRename("Dédé", Phase.Ended, "a", room)).toEqual({ ok: false, reason: "locked" });
  });
});

describe("nameKey", () => {
  test("cleans and ignores case", () => {
    expect(nameKey("  Gérard ​ du 93 ")).toBe(nameKey("gérard du 93"));
  });
});

describe("renameAllowedAt", () => {
  test("first rename always, then one per cooldown", () => {
    expect(renameAllowedAt(0, undefined, RENAME_COOLDOWN_MS)).toBe(true);
    expect(renameAllowedAt(999, 0, RENAME_COOLDOWN_MS)).toBe(false);
    expect(renameAllowedAt(1000, 0, RENAME_COOLDOWN_MS)).toBe(true);
  });
});
