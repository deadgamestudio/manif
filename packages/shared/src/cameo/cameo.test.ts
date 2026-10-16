import { describe, expect, test } from "bun:test";
import { ROUND_DURATION, TICK_DT } from "../index.js";
import {
  CAMEO,
  cameoArrives,
  cameoHush,
  cameoRolls,
  cameoRoundChance,
  cameoSpeak,
  cameoSpeaking,
  createCameoVoices,
  freshCameoSchedule,
} from "./index.js";

/** A seeded generator (Park-Miller), so the shares below are the same every run. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

/** Steps a whole march tick by tick; the march times at which `random` was asked. */
function rollTimes(stay: number, chance: number, random: () => number) {
  const s = freshCameoSchedule();
  const asked: number[] = [];
  let arrivedAt: number | null = null;
  for (let elapsed = 0; elapsed <= ROUND_DURATION; elapsed += TICK_DT) {
    const r = () => {
      asked.push(elapsed);
      return random();
    };
    if (cameoArrives(s, elapsed, ROUND_DURATION - elapsed, stay, chance, r)) arrivedAt ??= elapsed;
  }
  return { asked, arrivedAt, schedule: s };
}

describe("when a cameo comes (#132)", () => {
  test("one roll a minute of march, on the round's clock, not one a tick", () => {
    const { asked } = rollTimes(30, 0, () => 0.5);
    expect(asked.length).toBe(8);
    asked.forEach((t, i) => expect(t).toBeCloseTo(CAMEO.firstRoll + i * CAMEO.rollEvery, 1));
    expect(CAMEO.rollEvery).toBe(60);
  });

  test("below the chance he comes, at it he doesn't", () => {
    expect(cameoArrives(freshCameoSchedule(), CAMEO.firstRoll, 300, 30, 0.1, () => 0.099)).toBe(true);
    expect(cameoArrives(freshCameoSchedule(), CAMEO.firstRoll, 300, 30, 0.1, () => 0.1)).toBe(false);
    expect(cameoArrives(freshCameoSchedule(), CAMEO.firstRoll - 0.01, 300, 30, 1, () => 0)).toBe(false);
  });

  test("once a round: after the visit, no more rolls", () => {
    const { asked, arrivedAt, schedule } = rollTimes(30, 1, () => 0);
    expect(arrivedAt).toBeCloseTo(CAMEO.firstRoll, 1);
    expect(asked.length).toBe(1);
    expect(schedule.came).toBe(true);
  });

  test("a later minute when the earlier ones missed", () => {
    const rolls = [0.5, 0.5, 0.05];
    const { arrivedAt, asked } = rollTimes(30, 0.1, () => rolls.shift() ?? 0.9);
    expect(arrivedAt).toBeCloseTo(CAMEO.firstRoll + 2 * CAMEO.rollEvery, 1);
    expect(asked.length).toBe(3);
  });

  test("never with too little of the round left for the visit (the minute passes all the same)", () => {
    const s = freshCameoSchedule();
    expect(cameoArrives(s, CAMEO.firstRoll, 29, 30, 1, () => 0)).toBe(false);
    expect(s.next).toBe(CAMEO.firstRoll + CAMEO.rollEvery);
    expect(s.came).toBe(false);
    // A 50 s visit loses the last minute of an 8-minute round, a 30 s one doesn't.
    expect(cameoRolls(ROUND_DURATION, 30)).toBe(8);
    expect(cameoRolls(ROUND_DURATION, 50)).toBe(7);
  });

  test("a clock that jumped minutes ahead rolls once, not once per minute missed", () => {
    const s = freshCameoSchedule();
    let n = 0;
    cameoArrives(s, 300, 180, 30, 0, () => (n++, 0.5));
    expect(n).toBe(1);
    expect(s.next).toBeGreaterThan(300);
  });

  test("over many seeded rounds the share is about 1 - 0.9^rolls (about 57% for 8 rolls)", () => {
    const random = seeded(11);
    let came = 0;
    const rounds = 4000;
    for (let i = 0; i < rounds; i++) if (rollTimes(30, 0.1, random).arrivedAt !== null) came++;
    const expected = cameoRoundChance(0.1, ROUND_DURATION, 30);
    expect(expected).toBeCloseTo(0.57, 2);
    expect(Math.abs(came / rounds - expected)).toBeLessThan(0.03);
  });

  test("each cameo rolls on its own: several can be here at once", () => {
    const a = freshCameoSchedule();
    const b = freshCameoSchedule();
    const c = freshCameoSchedule();
    for (const s of [a, b, c]) expect(cameoArrives(s, CAMEO.firstRoll, 400, 50, 0.1, () => 0)).toBe(true);
  });
});

describe("one bubble at a time (#132)", () => {
  /** Who has a bubble up at `now`, over the three cameos. */
  const up = (v: ReturnType<typeof createCameoVoices>, now: number) => ["m", "d", "b"].filter((id) => cameoSpeaking(v, id, now));

  test("a line shows for the bubble's time, then that cameo keeps quiet 6 to 8 s", () => {
    for (const r of [0, 0.5, 0.999]) {
      const v = createCameoVoices();
      expect(cameoSpeak(v, "m", 0, false, () => r)).toBe(true);
      expect(cameoSpeaking(v, "m", CAMEO.bubble - 0.01)).toBe(true);
      expect(cameoSpeaking(v, "m", CAMEO.bubble)).toBe(false);
      const quietEnd = CAMEO.bubble + CAMEO.silenceMin + (CAMEO.silenceMax - CAMEO.silenceMin) * r;
      expect(cameoSpeak(v, "m", quietEnd - 0.01, false)).toBe(false);
      expect(cameoSpeak(v, "m", quietEnd, false)).toBe(true);
    }
    expect(CAMEO.bubble).toBe(2.5);
    expect(CAMEO.silenceMin).toBe(6);
    expect(CAMEO.silenceMax).toBe(8);
  });

  test("another cameo waits until the bubble is down, plus a short gap", () => {
    const v = createCameoVoices();
    cameoSpeak(v, "m", 0, false, () => 0);
    expect(cameoSpeak(v, "d", 1, false)).toBe(false);
    expect(cameoSpeak(v, "d", CAMEO.bubble + CAMEO.gap - 0.01, false)).toBe(false);
    expect(cameoSpeak(v, "d", CAMEO.bubble + CAMEO.gap, false)).toBe(true);
    expect(up(v, CAMEO.bubble + CAMEO.gap)).toEqual(["d"]);
  });

  test("a key moment always speaks, even in its own silence, and cuts whoever was talking", () => {
    const v = createCameoVoices();
    cameoSpeak(v, "m", 0, false, () => 0);
    cameoSpeak(v, "b", 0, true, () => 0);
    expect(up(v, 0.1)).toEqual(["b"]);
    // Bénanas in his silence: an ordinary line waits, a key one doesn't.
    expect(cameoSpeak(v, "b", 4, false)).toBe(false);
    expect(cameoSpeak(v, "b", 4, true)).toBe(true);
    expect(up(v, 4.1)).toEqual(["b"]);
  });

  test("three cameos all trying every tick: never two bubbles, and each has its silences", () => {
    const v = createCameoVoices();
    const random = seeded(3);
    const shown: Record<string, number> = { m: 0, d: 0, b: 0 };
    let silentTicks = 0;
    const ticks = Math.round(120 / TICK_DT);
    for (let i = 0; i < ticks; i++) {
      const now = i * TICK_DT;
      for (const id of ["m", "d", "b"]) cameoSpeak(v, id, now, false, random);
      const on = up(v, now);
      expect(on.length).toBeLessThanOrEqual(1);
      if (on[0]) shown[on[0]] = (shown[on[0]] ?? 0) + 1;
      else silentTicks++;
    }
    // Everyone gets turns; one cameo is up well under half the time.
    for (const id of ["m", "d", "b"]) {
      expect(shown[id]).toBeGreaterThan(0);
      expect((shown[id] ?? 0) / ticks).toBeLessThan(0.35);
    }
    expect(silentTicks).toBeGreaterThan(0);
  });

  test("a cameo that leaves takes its bubble down and frees the turn", () => {
    const v = createCameoVoices();
    cameoSpeak(v, "m", 0, false, () => 0);
    cameoHush(v, "m", 1);
    expect(up(v, 1)).toEqual([]);
    expect(cameoSpeak(v, "d", 1 + CAMEO.gap, false)).toBe(true);
    // Hushing someone who isn't talking changes nothing for the speaker.
    cameoHush(v, "b", 1.5);
    expect(up(v, 1.5 + CAMEO.gap)).toEqual(["d"]);
  });
});
