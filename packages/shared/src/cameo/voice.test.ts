import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CAMEO, CAMEO_CLIP_SECONDS, CAMEO_VOICE_LINES, CLIP_TAIL, cameoBubbleSeconds, cameoClipPath, cameoHold, cameoSpeak, cameoSpeaking, createCameoVoices } from "../index.js";

const PUBLIC = join(import.meta.dir, "../../../../apps/client/public");

describe("every cameo line is voiced (#137)", () => {
  for (const [cameo, lines] of Object.entries(CAMEO_VOICE_LINES)) {
    test(`${cameo}: a clip file and a length for each of its ${lines.length} lines`, () => {
      expect(CAMEO_CLIP_SECONDS[cameo]?.length).toBe(lines.length);
      lines.forEach((line, i) => {
        const path = cameoClipPath(cameo, i);
        expect(path).toBe(`voices/${cameo}/${line.kind}-${i}.mp3`);
        expect(existsSync(join(PUBLIC, path ?? ""))).toBe(true);
        const seconds = CAMEO_CLIP_SECONDS[cameo]?.[i] ?? 0;
        expect(seconds).toBeGreaterThan(0.3);
        expect(seconds).toBeLessThan(6);
      });
    });
  }

  test("no path for a line that doesn't exist", () => {
    expect(cameoClipPath("moluchan", -1)).toBeNull();
    expect(cameoClipPath("moluchan", 999)).toBeNull();
    expect(cameoClipPath("nobody", 0)).toBeNull();
  });

  test("a bubble lasts its clip and a short tail, never under CAMEO.bubble", () => {
    for (const [cameo, lines] of Object.entries(CAMEO_VOICE_LINES)) {
      lines.forEach((_, i) => {
        const clip = CAMEO_CLIP_SECONDS[cameo]?.[i] ?? 0;
        expect(cameoBubbleSeconds(cameo, i)).toBeCloseTo(Math.max(CAMEO.bubble, clip + CLIP_TAIL), 5);
      });
    }
    expect(cameoBubbleSeconds("nobody", 0)).toBe(CAMEO.bubble);
  });
});

describe("holding the bubble for the clip", () => {
  test("a longer clip keeps the bubble up, and the silence comes after it", () => {
    const v = createCameoVoices();
    cameoSpeak(v, "m", 0, false, () => 0);
    cameoHold(v, "m", 0, 3.4);
    expect(cameoSpeaking(v, "m", 3.39)).toBe(true);
    expect(cameoSpeaking(v, "m", 3.4)).toBe(false);
    // The rolled silence (silenceMin with random 0) starts when the bubble ends.
    expect(cameoSpeak(v, "m", 3.4 + CAMEO.silenceMin - 0.01, false)).toBe(false);
    expect(cameoSpeak(v, "m", 3.4 + CAMEO.silenceMin, false)).toBe(true);
  });

  test("a short clip still gets CAMEO.bubble; someone who isn't speaking changes nothing", () => {
    const v = createCameoVoices();
    cameoSpeak(v, "m", 0, false, () => 0);
    cameoHold(v, "m", 0, 1);
    expect(v.until).toBe(CAMEO.bubble);
    cameoHold(v, "d", 0, 5);
    expect(v.until).toBe(CAMEO.bubble);
    expect(v.speaker).toBe("m");
  });
});
