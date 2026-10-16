/**
 * The cameos' voiced lines (#137), the pure part: which clip starts or stops
 * when the synced lines change, how loud it is from where the player stands,
 * and the light effect on each voice.
 *
 * A cameo's synced `line` is the bubble on screen (-1: none). The server lets
 * only one cameo bubble up at a time, so at most one clip plays: a new line
 * starts its clip (cutting whatever was playing, as a key moment cuts the
 * bubble). A clip whose bubble just came down plays out its last word (the
 * bubble lasts the clip, so that is a fraction of a second at most); one whose
 * cameo left the street stops.
 */
import { BENANAS_ID, MOLUCHAN_ID } from "@manif/shared";
import { place, type Point } from "./spatial.ts";

/** A cameo line being voiced. */
export interface VoiceLine {
  cameo: string;
  line: number;
}

export interface VoiceStep {
  /** Stop the clip that is playing. */
  stop: boolean;
  /** Start this line's clip (after stopping the old one). */
  start: VoiceLine | null;
}

const NOTHING: VoiceStep = { stop: false, start: null };

/**
 * What to do with the cameo voice, given each cameo's synced line before
 * (`prev`, null for "first look after joining": what is already up stays
 * silent) and now (a missing cameo has left), and what is `playing`.
 */
export function voiceStep(prev: ReadonlyMap<string, number> | null, now: ReadonlyMap<string, number>, playing: VoiceLine | null): VoiceStep {
  let start: VoiceLine | null = null;
  if (prev) {
    for (const [cameo, line] of now) {
      if (line >= 0 && prev.get(cameo) !== line) {
        start = { cameo, line };
        break;
      }
    }
  }
  if (start) return { stop: playing !== null, start };
  if (playing && !now.has(playing.cameo)) return { stop: true, start: null };
  return NOTHING;
}

/** A cameo voice is at full volume up to here (metres)... */
export const VOICE_NEAR = 6;
/** ...and fades down to VOICE_FLOOR here, not further: you hear him shouting down the street. */
export const VOICE_FAR = 40;
export const VOICE_FLOOR = 0.15;

/** Gain and pan of a cameo's voice at `source` for a listener at `listener` (none: full, centred). */
export function voicePlacement(listener: Point | null, source: Point | null): { gain: number; pan: number } {
  if (!listener || !source) return { gain: 1, pan: 0 };
  const distance = Math.hypot(source.x - listener.x, source.z - listener.z);
  if (!Number.isFinite(distance)) return { gain: VOICE_FLOOR, pan: 0 };
  let gain = 1;
  if (distance >= VOICE_FAR) gain = VOICE_FLOOR;
  else if (distance > VOICE_NEAR) {
    const t = 1 - (distance - VOICE_NEAR) / (VOICE_FAR - VOICE_NEAR);
    gain = VOICE_FLOOR + (1 - VOICE_FLOOR) * t * t;
  }
  return { gain, pan: place(listener, source).pan };
}

/** The light effect on a cameo's voice: Moluchan's megaphone, Bénanas muffled under his helmet. */
export type VoiceEffect = "megaphone" | "helmet" | null;

export function voiceEffect(cameo: string): VoiceEffect {
  if (cameo === MOLUCHAN_ID) return "megaphone";
  if (cameo === BENANAS_ID) return "helmet";
  return null;
}
