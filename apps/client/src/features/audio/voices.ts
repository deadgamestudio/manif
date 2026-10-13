/**
 * The cap on simultaneous sounds (#57). With 8 players and a full CRS wave a
 * melee can ask for dozens of baton hits in a second: each sound has its own
 * cap and all effects share a global one. When a cap is reached, the quietest
 * (the farthest) copy is dropped to make room for a louder one; a sound
 * quieter than everything playing is simply not played.
 */

export interface Voice {
  id: number;
  sound: string;
  /** Effective gain after distance, used to rank who goes first. */
  gain: number;
  /** When it finishes (same clock as `now`). */
  endsAt: number;
}

export interface Admission {
  /** Play the new sound. */
  accept: boolean;
  /** Voices to stop now to make room (the farthest first). */
  evict: number[];
}

/** Quieter than this after distance: inaudible, not worth a voice. */
export const MIN_GAIN = 0.02;

const REJECT: Admission = { accept: false, evict: [] };

function quietest(voices: readonly Voice[], skip: ReadonlySet<number>, sound?: string): Voice | null {
  let best: Voice | null = null;
  for (const v of voices) {
    if (skip.has(v.id) || (sound !== undefined && v.sound !== sound)) continue;
    if (!best || v.gain < best.gain) best = v;
  }
  return best;
}

/**
 * Whether a new copy of `sound` at `gain` may play, given the voices still
 * playing at `now` (finished ones are ignored), a per-sound cap and a global cap.
 */
export function admit(
  playing: readonly Voice[],
  sound: string,
  gain: number,
  now: number,
  perSound: number,
  global: number,
): Admission {
  if (!(gain >= MIN_GAIN) || perSound <= 0 || global <= 0) return REJECT;
  const live = playing.filter((v) => v.endsAt > now);
  const evict = new Set<number>();
  let same = 0;
  for (const v of live) if (v.sound === sound) same++;
  if (same >= perSound) {
    const victim = quietest(live, evict, sound);
    if (!victim || victim.gain >= gain) return REJECT;
    evict.add(victim.id);
  }
  if (live.length - evict.size >= global) {
    const victim = quietest(live, evict);
    if (!victim || victim.gain >= gain) return REJECT;
    evict.add(victim.id);
  }
  return { accept: true, evict: [...evict] };
}
