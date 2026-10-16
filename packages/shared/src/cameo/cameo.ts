/**
 * The rare cameos together (#132), the pure rules both the arrival roll and
 * the speech bubbles follow, the same for the three of them.
 *
 * When: each cameo rolls its chance once per minute of march (CAMEO.rollEvery
 * on the round's clock), until it has come once. Never when too little of the
 * round is left for its visit. Each rolls on its own: all three may be on the
 * street at once.
 *
 * Speaking: one cameo bubble on screen at a time, across all of them. A line
 * shows for CAMEO.bubble, or as long as its voice clip (#137, cameoHold), then that cameo keeps quiet for a rolled
 * CAMEO.silenceMin..silenceMax. An ordinary line waits for its turn (nobody
 * talking, the cameo's own silence over, CAMEO.gap after the last bubble). A
 * key moment (arrival, leaving, grabbed, unmasked, a hit) always speaks and
 * cuts whoever was talking. The server decides, so every client sees the same.
 */
import { CAMEO } from "./constants.js";

/** One cameo's arrival roll over a round. */
export interface CameoSchedule {
  /** March time (`Round.elapsed`) of the next roll. */
  next: number;
  /** It came this round already: no more rolls. */
  came: boolean;
}

/** A new round: the first roll at CAMEO.firstRoll, nobody came yet. */
export function freshCameoSchedule(): CameoSchedule {
  return { next: CAMEO.firstRoll, came: false };
}

/**
 * Once a tick: whether the cameo arrives now. Rolls `chance` once each time
 * the march clock `elapsed` passes the next roll time (just one roll even if
 * several minutes went by in one call), and only while `timeLeft` (of the
 * march) is at least `stay`, the length of its visit. Arriving marks
 * `schedule.came`: one visit a round at most. Mutates `schedule`.
 */
export function cameoArrives(schedule: CameoSchedule, elapsed: number, timeLeft: number, stay: number, chance: number, random: () => number = Math.random): boolean {
  if (schedule.came || elapsed < schedule.next) return false;
  while (schedule.next <= elapsed) schedule.next += CAMEO.rollEvery;
  if (timeLeft < stay) return false;
  if (!(random() < chance)) return false;
  schedule.came = true;
  return true;
}

/** How many rolls a cameo gets in a round of `duration` s of march, given its visit of `stay` s. */
export function cameoRolls(duration: number, stay: number): number {
  let n = 0;
  for (let t = CAMEO.firstRoll; t < duration; t += CAMEO.rollEvery) if (duration - t >= stay) n++;
  return n;
}

/** The chance a cameo comes at all in a full round of `duration` s, its visit `stay` s. */
export function cameoRoundChance(chance: number, duration: number, stay: number): number {
  return 1 - (1 - chance) ** cameoRolls(duration, stay);
}

/** Who has the bubble, shared by every cameo in a room. */
export interface CameoVoices {
  /** The cameo whose bubble is up (until `until`), or null. */
  speaker: string | null;
  /** Room time the last bubble ends (or ended). */
  until: number;
  /** Per cameo: room time its silence ends. */
  readonly quiet: Map<string, number>;
}

export function createCameoVoices(): CameoVoices {
  return { speaker: null, until: -Infinity, quiet: new Map() };
}

/**
 * Cameo `id` wants to say something at `now`. True when it may: its bubble
 * goes up for CAMEO.bubble, then it keeps quiet a rolled silence. A `key`
 * moment always may, and takes the bubble from whoever had it. Mutates `voices`.
 */
export function cameoSpeak(voices: CameoVoices, id: string, now: number, key: boolean, random: () => number = Math.random): boolean {
  if (!key) {
    if (now < voices.until + CAMEO.gap) return false;
    if (now < (voices.quiet.get(id) ?? -Infinity)) return false;
  }
  voices.speaker = id;
  voices.until = now + CAMEO.bubble;
  voices.quiet.set(id, voices.until + CAMEO.silenceMin + (CAMEO.silenceMax - CAMEO.silenceMin) * random());
  return true;
}

/**
 * Cameo `id`, who just got the bubble at `now`, keeps it up `seconds` (never
 * under CAMEO.bubble): its voiced line (#137) is longer than a plain bubble.
 * Its silence moves back by the same amount. Nothing if it isn't the speaker.
 */
export function cameoHold(voices: CameoVoices, id: string, now: number, seconds: number): void {
  if (voices.speaker !== id) return;
  const until = now + Math.max(CAMEO.bubble, seconds);
  const shift = until - voices.until;
  voices.until = until;
  const quiet = voices.quiet.get(id);
  if (quiet !== undefined) voices.quiet.set(id, quiet + shift);
}

/** Whether cameo `id`'s bubble is up at `now`. */
export function cameoSpeaking(voices: CameoVoices, id: string, now: number): boolean {
  return voices.speaker === id && now < voices.until;
}

/** Cameo `id` is gone (left the street, the round ended): its bubble comes down and its silence is forgotten. */
export function cameoHush(voices: CameoVoices, id: string, now: number): void {
  if (voices.speaker === id) {
    voices.speaker = null;
    voices.until = Math.min(voices.until, now);
  }
  voices.quiet.delete(id);
}
