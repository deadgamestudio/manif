import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS, parseSettings, serializeSettings, toggleAll } from "./settings.ts";

describe("sound settings", () => {
  test("round-trip through storage", () => {
    const s = { volume: 0.35, sfxMuted: true, musicMuted: false };
    expect(parseSettings(serializeSettings(s))).toEqual(s);
  });

  test("nothing saved, or garbage: the defaults", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("not json")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("null")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"volume":"loud","sfxMuted":1}')).toEqual(DEFAULT_SETTINGS);
  });

  test("the volume is kept within 0..1", () => {
    expect(parseSettings('{"volume":4}').volume).toBe(1);
    expect(parseSettings('{"volume":-1}').volume).toBe(0);
  });

  test("the shortcut mutes everything, then brings everything back", () => {
    const off = toggleAll({ volume: 0.5, sfxMuted: false, musicMuted: true });
    expect(off).toEqual({ volume: 0.5, sfxMuted: true, musicMuted: true });
    expect(toggleAll(off)).toEqual({ volume: 0.5, sfxMuted: false, musicMuted: false });
  });
});
