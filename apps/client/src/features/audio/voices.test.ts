import { describe, expect, test } from "bun:test";
import { MIN_GAIN, admit, type Voice } from "./voices.ts";

const voice = (id: number, sound: string, gain: number, endsAt = 10): Voice => ({ id, sound, gain, endsAt });

describe("admit", () => {
  test("plays freely under both caps", () => {
    expect(admit([voice(1, "baton", 0.5)], "baton", 0.4, 0, 3, 10)).toEqual({ accept: true, evict: [] });
  });

  test("inaudible sounds take no voice", () => {
    expect(admit([], "baton", MIN_GAIN / 2, 0, 3, 10).accept).toBe(false);
    expect(admit([], "baton", 0, 0, 3, 10).accept).toBe(false);
  });

  test("per-sound cap: a closer copy replaces the farthest one", () => {
    const playing = [voice(1, "baton", 0.9), voice(2, "baton", 0.1), voice(3, "baton", 0.5)];
    expect(admit(playing, "baton", 0.6, 0, 3, 10)).toEqual({ accept: true, evict: [2] });
  });

  test("per-sound cap: a copy farther than all the others is dropped", () => {
    const playing = [voice(1, "baton", 0.9), voice(2, "baton", 0.3), voice(3, "baton", 0.5)];
    expect(admit(playing, "baton", 0.2, 0, 3, 10).accept).toBe(false);
  });

  test("global cap: the farthest of any sound goes first", () => {
    const playing = [voice(1, "baton", 0.9), voice(2, "splat", 0.05), voice(3, "glass", 0.5)];
    expect(admit(playing, "pave", 0.4, 0, 3, 3)).toEqual({ accept: true, evict: [2] });
    expect(admit(playing, "pave", 0.04, 0, 3, 3).accept).toBe(false);
  });

  test("finished voices don't count", () => {
    const playing = [voice(1, "baton", 0.9, 1), voice(2, "baton", 0.9, 1), voice(3, "baton", 0.9, 1)];
    expect(admit(playing, "baton", 0.1, 2, 3, 3)).toEqual({ accept: true, evict: [] });
  });

  test("a big melee never goes over the caps", () => {
    let playing: Voice[] = [];
    let id = 0;
    const sounds = ["baton-1", "baton-2", "punch-1", "swing", "shield"];
    // 300 hits in a second, at random distances, each lasting half a second.
    for (let i = 0; i < 300; i++) {
      const now = i / 300;
      const sound = sounds[i % sounds.length] ?? "swing";
      const gain = ((i * 7919) % 100) / 100;
      const decision = admit(playing, sound, gain, now, 3, 14);
      playing = playing.filter((v) => v.endsAt > now && !decision.evict.includes(v.id));
      if (decision.accept) playing.push(voice(++id, sound, gain, now + 0.5));
      expect(playing.length).toBeLessThanOrEqual(14);
      for (const s of sounds) expect(playing.filter((v) => v.sound === s).length).toBeLessThanOrEqual(3);
    }
  });
});
