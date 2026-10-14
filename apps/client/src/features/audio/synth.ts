/**
 * The sounds made in code (#57): short blips and stings that need no file
 * and no licence. Each builds a tiny Web Audio graph into `out` starting at
 * `t0` and returns how long it lasts, in seconds.
 */
import type { SynthSoundName } from "./sounds.ts";

type Note = readonly [frequency: number, seconds: number];

/** A gain envelope: quick attack, hold, release. */
function envelope(ctx: BaseAudioContext, out: AudioNode, t0: number, seconds: number, peak = 1, attack = 0.01): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.setValueAtTime(peak, t0 + Math.max(attack, seconds * 0.6));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
  g.connect(out);
  return g;
}

function tone(ctx: BaseAudioContext, out: AudioNode, type: OscillatorType, t0: number, notes: readonly Note[], peak = 1): number {
  let t = t0;
  for (const [frequency, seconds] of notes) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    osc.connect(envelope(ctx, out, t, seconds, peak));
    osc.start(t);
    osc.stop(t + seconds + 0.02);
    t += seconds;
  }
  return t - t0;
}

/** A cartoon boing: up, then settling down. */
function hop(ctx: BaseAudioContext, out: AudioNode, t0: number): number {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(240, t0);
  osc.frequency.exponentialRampToValueAtTime(720, t0 + 0.09);
  osc.frequency.exponentialRampToValueAtTime(460, t0 + 0.22);
  osc.connect(envelope(ctx, out, t0, 0.24));
  osc.start(t0);
  osc.stop(t0 + 0.26);
  return 0.24;
}

/**
 * A CRS LBD taking aim (#73): quick beeps climbing in pitch and coming
 * closer together, like a toy locking on. About as long as the aim.
 */
function charge(ctx: BaseAudioContext, out: AudioNode, t0: number): number {
  const beeps = 7;
  let t = t0;
  for (let i = 0; i < beeps; i++) {
    const f = 660 * Math.pow(2, i / (beeps - 1));
    const length = 0.045;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.linearRampToValueAtTime(f * 1.06, t + length);
    osc.connect(envelope(ctx, out, t, length, 0.6, 0.005));
    osc.start(t);
    osc.stop(t + length + 0.02);
    t += length + 0.11 * (1 - i / beeps);
  }
  return t - t0;
}

/**
 * The LBD's rubber ball landing (#73): a cartoon boing, a quick swoop up
 * then a wobbling tone settling down, the wobble dying out. Slapstick only.
 */
function boing(ctx: BaseAudioContext, out: AudioNode, t0: number): number {
  const seconds = 0.6;
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(140, t0);
  osc.frequency.exponentialRampToValueAtTime(520, t0 + 0.05);
  osc.frequency.exponentialRampToValueAtTime(300, t0 + seconds);
  // The wobble: a fast vibrato whose depth dies away.
  const lfo = ctx.createOscillator();
  const depth = ctx.createGain();
  lfo.frequency.setValueAtTime(16, t0);
  lfo.frequency.linearRampToValueAtTime(9, t0 + seconds);
  depth.gain.setValueAtTime(110, t0 + 0.05);
  depth.gain.exponentialRampToValueAtTime(4, t0 + seconds);
  lfo.connect(depth).connect(osc.frequency);
  osc.connect(envelope(ctx, out, t0, seconds, 1, 0.008));
  lfo.start(t0);
  osc.start(t0);
  lfo.stop(t0 + seconds + 0.02);
  osc.stop(t0 + seconds + 0.02);
  return seconds;
}

/** The sad trombone of a lost march: four notes down, the last one wobbling. */
function sadTrombone(ctx: BaseAudioContext, out: AudioNode, t0: number): number {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1100;
  filter.connect(out);
  const notes: Note[] = [
    [233, 0.38],
    [220, 0.38],
    [208, 0.38],
    [196, 1.1],
  ];
  let t = t0;
  notes.forEach(([frequency, seconds], i) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(frequency, t);
    if (i === notes.length - 1) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 6;
      depth.gain.value = 5;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + seconds + 0.02);
    }
    osc.connect(envelope(ctx, filter, t, seconds, 0.6, 0.03));
    osc.start(t);
    osc.stop(t + seconds + 0.02);
    t += seconds;
  });
  return t - t0;
}

let curve: Float32Array<ArrayBuffer> | null = null;
/** A soft clip, for the megaphone's crackle. */
function distortion(): Float32Array<ArrayBuffer> {
  if (curve) return curve;
  const n = 1024;
  curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(4 * x);
  }
  return curve;
}

/**
 * Megaphone gibberish somewhere in the cortège: a buzzy voice-like tone,
 * syllables at random pitches, through a narrow, crackly band. No words, no
 * slogan, nobody's voice.
 */
function megaphone(ctx: BaseAudioContext, out: AudioNode, t0: number): number {
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1400;
  band.Q.value = 1.4;
  const shaper = ctx.createWaveShaper();
  shaper.curve = distortion();
  const high = ctx.createBiquadFilter();
  high.type = "highpass";
  high.frequency.value = 450;
  shaper.connect(band).connect(high).connect(out);

  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t0);
  osc.connect(amp).connect(shaper);
  let t = t0;
  const syllables = 6 + Math.floor(Math.random() * 6);
  for (let i = 0; i < syllables; i++) {
    const length = 0.08 + Math.random() * 0.12;
    osc.frequency.setValueAtTime(170 + Math.random() * 110, t);
    osc.frequency.linearRampToValueAtTime(150 + Math.random() * 140, t + length);
    amp.gain.linearRampToValueAtTime(0.9, t + 0.02);
    amp.gain.setValueAtTime(0.9, t + length * 0.7);
    amp.gain.linearRampToValueAtTime(0.05, t + length);
    // Now and then a breath between words.
    t += length + (Math.random() < 0.25 ? 0.12 : 0.02);
  }
  amp.gain.linearRampToValueAtTime(0, t + 0.05);
  osc.start(t0);
  osc.stop(t + 0.1);
  return t + 0.1 - t0;
}

/** Builds sound `name` into `out` at `t0`; returns its length in seconds. */
export function synthesize(ctx: BaseAudioContext, name: SynthSoundName, out: AudioNode, t0: number): number {
  switch (name) {
    case "hop":
      return hop(ctx, out, t0);
    case "rescue":
      return tone(ctx, out, "triangle", t0, [
        [523, 0.07],
        [659, 0.07],
        [784, 0.07],
        [1047, 0.22],
      ]);
    case "tick":
      return tone(ctx, out, "square", t0, [[1250, 0.05]], 0.5);
    case "blip":
      return tone(ctx, out, "sine", t0, [[880, 0.06]]);
    case "fanfare":
      return tone(ctx, out, "triangle", t0, [
        [392, 0.12],
        [523, 0.12],
        [659, 0.12],
        [784, 0.2],
        [659, 0.1],
        [784, 0.6],
      ]);
    case "sad-trombone":
      return sadTrombone(ctx, out, t0);
    case "megaphone":
      return megaphone(ctx, out, t0);
    case "charge":
      return charge(ctx, out, t0);
    case "boing":
      return boing(ctx, out, t0);
  }
}
