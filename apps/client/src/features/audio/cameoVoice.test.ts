import { describe, expect, test } from "bun:test";
import { BENANAS_ID, DOUANE_ID, LEZ_ID, MOLUCHAN_ID } from "@manif/shared";
import { VOICE_FAR, VOICE_FLOOR, VOICE_NEAR, voiceEffect, voicePlacement, voiceStep } from "./cameoVoice.ts";

const lines = (entries: [string, number][]) => new Map(entries);

describe("which cameo clip plays (#137)", () => {
  test("a new line starts its clip", () => {
    expect(voiceStep(lines([["moluchan", -1]]), lines([["moluchan", 3]]), null)).toEqual({ stop: false, start: { cameo: "moluchan", line: 3 } });
  });

  test("a cameo arriving with a line up starts it too", () => {
    expect(voiceStep(lines([]), lines([["douane", 0]]), null).start).toEqual({ cameo: "douane", line: 0 });
  });

  test("the same line still up: nothing, it plays once", () => {
    const playing = { cameo: "moluchan", line: 3 };
    expect(voiceStep(lines([["moluchan", 3]]), lines([["moluchan", 3]]), playing)).toEqual({ stop: false, start: null });
  });

  test("the bubble came down: the clip plays out its last word; the cameo left: it stops", () => {
    const playing = { cameo: "moluchan", line: 3 };
    expect(voiceStep(lines([["moluchan", 3]]), lines([["moluchan", -1]]), playing)).toEqual({ stop: false, start: null });
    expect(voiceStep(lines([["moluchan", 3]]), lines([]), playing)).toEqual({ stop: true, start: null });
  });

  test("a key moment of another cameo cuts the clip and starts its own: never two at once", () => {
    const playing = { cameo: "moluchan", line: 3 };
    const step = voiceStep(
      lines([
        ["moluchan", 3],
        ["benanas", -1],
      ]),
      lines([
        ["moluchan", -1],
        ["benanas", 7],
      ]),
      playing,
    );
    expect(step).toEqual({ stop: true, start: { cameo: "benanas", line: 7 } });
  });

  test("a line straight after another one of the same cameo restarts", () => {
    expect(voiceStep(lines([["lez", 1]]), lines([["lez", 5]]), { cameo: "lez", line: 1 })).toEqual({ stop: true, start: { cameo: "lez", line: 5 } });
  });

  test("the first look after joining starts nothing (no line mid-way)", () => {
    expect(voiceStep(null, lines([["moluchan", 3]]), null)).toEqual({ stop: false, start: null });
  });
});

describe("how loud a cameo is", () => {
  test("full up close, a floor far away, never louder further", () => {
    const me = { x: 0, z: 0 };
    expect(voicePlacement(me, { x: VOICE_NEAR, z: 0 }).gain).toBe(1);
    expect(voicePlacement(me, { x: VOICE_FAR + 50, z: 0 }).gain).toBe(VOICE_FLOOR);
    let last = 1;
    for (let d = 0; d <= VOICE_FAR + 5; d += 1) {
      const g = voicePlacement(me, { x: 0, z: d }).gain;
      expect(g).toBeLessThanOrEqual(last + 1e-9);
      expect(g).toBeGreaterThanOrEqual(VOICE_FLOOR);
      last = g;
    }
  });

  test("not in the street yet: full, centred", () => {
    expect(voicePlacement(null, { x: 30, z: 0 })).toEqual({ gain: 1, pan: 0 });
  });

  test("Moluchan through his megaphone, Bénanas under his helmet, the others plain", () => {
    expect(voiceEffect(MOLUCHAN_ID)).toBe("megaphone");
    expect(voiceEffect(BENANAS_ID)).toBe("helmet");
    expect(voiceEffect(DOUANE_ID)).toBeNull();
    expect(voiceEffect(LEZ_ID)).toBeNull();
  });
});
