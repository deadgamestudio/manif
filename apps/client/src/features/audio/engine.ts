/**
 * The Web Audio side of the sound layer (#57): one AudioContext, a master
 * gain and two buses (effects; music and ambience), the decoded files, the
 * one-shots under the voice caps, and the loops (fires, hoses, the crowd bed,
 * the lobby music).
 *
 * Nothing exists before `unlock()`, which must run inside a real click or
 * key press: browsers refuse to start audio otherwise, and some warn in the
 * console if a context is even created earlier.
 */
import { FILE_SOUNDS, MAX_VOICES, SYNTH_SOUNDS, isFileSound, maxVoicesOf, soundsToLoad, type Bus, type FileSoundName, type SoundName } from "./sounds.ts";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type SoundSettings } from "./settings.ts";
import { synthesize } from "./synth.ts";
import { MIN_GAIN, admit, type Voice } from "./voices.ts";
import type { VoiceEffect } from "./cameoVoice.ts";

/** One loop the game wants playing right now, at this level. */
export interface LoopWish {
  sound: FileSoundName;
  gain: number;
  pan?: number;
}

interface PlayingVoice extends Voice {
  bus: Bus;
  stop: () => void;
}

interface Loop {
  sound: FileSoundName;
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  pan: StereoPannerNode | null;
}

/** Seconds for a loop to fade in or out, and for the mutes and the volume to settle. */
const FADE = 0.25;
const FADE_OUT_HIDDEN = 0.15;

/** Dev builds only: what played, what the caps dropped, for scripted checks (window.manifAudioDev). */
export interface AudioDevStats {
  played: Record<string, number>;
  dropped: number;
  maxActive: number;
  active: () => number;
  loops: () => string[];
  log: string[];
  state: () => string;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buses: Partial<Record<Bus, GainNode>> = {};
const buffers = new Map<FileSoundName, AudioBuffer>();
const loading = new Map<FileSoundName, Promise<void>>();
let voices: PlayingVoice[] = [];
let nextVoiceId = 1;
const loops = new Map<string, Loop>();
let settings: SoundSettings = DEFAULT_SETTINGS;
let settingsLoaded = false;
const settingsListeners = new Set<() => void>();
let bedWanted = false;
/** The cameos' voice clips (#137), by path under public/, fetched when a cameo shows up. */
const clips = new Map<string, AudioBuffer>();
const clipLoading = new Map<string, Promise<AudioBuffer | null>>();
/** The one cameo clip playing, if any. */
let clip: { path: string; source: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode | null; endsAt: number } | null = null;
/** A clip asked for before it was loaded: it starts when it is, if nothing else was asked meanwhile. */
let pendingClip: { path: string; gain: number; pan: number; effect: VoiceEffect; askedAt: number } | null = null;
/** A clip that loads later than this after its line came up (seconds) is skipped: too far out of sync with the bubble. */
const CLIP_LATE = 0.8;
let hidden = false;

const dev: AudioDevStats | null = import.meta.env.DEV
  ? {
      played: {},
      dropped: 0,
      maxActive: 0,
      active: () => liveVoices().filter((v) => v.bus === "sfx").length,
      loops: () => [...loops.keys()],
      log: [],
      state: () => ctx?.state ?? "none",
    }
  : null;
if (dev) (window as unknown as { manifAudioDev?: AudioDevStats }).manifAudioDev = dev;

function devLog(line: string) {
  if (!dev) return;
  dev.log.push(`${Math.round(performance.now())} ${line}`);
  if (dev.log.length > 400) dev.log.splice(0, dev.log.length - 400);
}

let lastCapReport = 0;
/** Dev builds: a sound dropped by the caps, reported in the console at most once a second. */
function devDropped(name: SoundName) {
  if (!dev) return;
  dev.dropped++;
  devLog(`drop ${name}`);
  const t = performance.now();
  if (t - lastCapReport < 1000) return;
  lastCapReport = t;
  console.debug(`[audio] voice cap: ${dev.dropped} sounds dropped so far, at most ${dev.maxActive}/${MAX_VOICES} effects at once`);
}

function now(): number {
  return ctx ? ctx.currentTime : 0;
}

function liveVoices(): PlayingVoice[] {
  const t = now();
  voices = voices.filter((v) => v.endsAt > t);
  return voices;
}

function busGain(bus: Bus): number {
  return (bus === "sfx" ? settings.sfxMuted : settings.musicMuted) ? 0 : 1;
}

function applySettings() {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  // Squared: the slider feels even from quiet to loud.
  master.gain.setTargetAtTime(hidden ? 0 : settings.volume * settings.volume, t, FADE / 3);
  for (const bus of ["sfx", "music"] as const) buses[bus]?.gain.setTargetAtTime(busGain(bus), t, FADE / 3);
}

function ensureSettings() {
  if (settingsLoaded) return;
  settings = loadSettings();
  settingsLoaded = true;
}

function load(name: FileSoundName): Promise<void> {
  const existing = loading.get(name);
  if (existing) return existing;
  const context = ctx;
  if (!context) return Promise.resolve();
  const url = `${import.meta.env.BASE_URL}sounds/${FILE_SOUNDS[name].file}`;
  const attempt = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.arrayBuffer();
    })
    .then((data) => context.decodeAudioData(data))
    .then((buffer) => {
      buffers.set(name, buffer);
      devLog(`loaded ${name} ${buffer.duration.toFixed(3)}s`);
    })
    .catch((err: unknown) => {
      // A missing sound is only a missing sound; try again next time it's asked for.
      loading.delete(name);
      console.warn(`[audio] ${name} failed to load:`, err);
    });
  loading.set(name, attempt);
  return attempt;
}

function onVisibility() {
  hidden = document.visibilityState === "hidden";
  if (!ctx || !master) return;
  const context = ctx;
  if (hidden) {
    master.gain.setTargetAtTime(0, context.currentTime, FADE_OUT_HIDDEN / 3);
    window.setTimeout(() => {
      if (hidden && context.state === "running") void context.suspend();
    }, FADE_OUT_HIDDEN * 1000 + 50);
  } else {
    void context.resume().then(applySettings);
  }
}

/** A panner where the browser has one (Safari 14.1+); centred sound otherwise. */
function makePanner(context: AudioContext, pan: number): StereoPannerNode | null {
  if (typeof context.createStereoPanner !== "function") return null;
  const p = context.createStereoPanner();
  p.pan.value = pan;
  return p;
}

/**
 * The light effect on a cameo voice, between the clip and its gain: a
 * megaphone (a band of 500 to 3000 Hz and a little grit), or muffled under
 * a helmet (only the lows and mids).
 */
function voiceChain(context: AudioContext, effect: VoiceEffect, out: AudioNode): AudioNode {
  if (effect === "helmet") {
    const low = context.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 1500;
    low.Q.value = 0.9;
    low.connect(out);
    return low;
  }
  if (effect === "megaphone") {
    const high = context.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 500;
    const low = context.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 3000;
    const grit = context.createWaveShaper();
    grit.curve = megaphoneCurve();
    grit.oversample = "2x";
    // The soft clip about doubles a quiet signal: bring it back level with the others.
    const trim = context.createGain();
    trim.gain.value = 0.6;
    high.connect(grit).connect(low).connect(trim).connect(out);
    return high;
  }
  return out;
}

let gritCurve: Float32Array<ArrayBuffer> | null = null;
/** A soft clip, made once. */
function megaphoneCurve(): Float32Array<ArrayBuffer> {
  if (gritCurve) return gritCurve;
  const curve = new Float32Array(256);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(2.2 * x) / Math.tanh(2.2);
  }
  gritCurve = curve;
  return curve;
}

function loadClip(path: string): Promise<AudioBuffer | null> {
  const existing = clipLoading.get(path);
  if (existing) return existing;
  const context = ctx;
  if (!context) return Promise.resolve(null);
  const attempt = fetch(`${import.meta.env.BASE_URL}${path}`)
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.arrayBuffer();
    })
    .then((data) => context.decodeAudioData(data))
    .then((buffer) => {
      clips.set(path, buffer);
      devLog(`voice loaded ${path} ${buffer.duration.toFixed(2)}s`);
      return buffer;
    })
    .catch((err: unknown) => {
      // No clip (an old deploy, a bad network): the bubble still shows. Try again next visit.
      clipLoading.delete(path);
      console.warn(`[audio] ${path} failed to load:`, err);
      return null;
    });
  clipLoading.set(path, attempt);
  return attempt;
}

/** Start a loaded cameo clip now: the one clip playing. */
function startClip(path: string, buffer: AudioBuffer, gain: number, pan: number, effect: VoiceEffect) {
  const bus = buses.sfx;
  if (!ctx || !bus) return;
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = gain;
  const panner = makePanner(ctx, pan);
  if (panner) out.connect(panner).connect(bus);
  else out.connect(bus);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(voiceChain(ctx, effect, out));
  source.start(t);
  const playing = { path, source, gain: out, pan: panner, endsAt: t + buffer.duration };
  clip = playing;
  source.onended = () => {
    if (clip !== playing) return;
    clip = null;
    devLog(`voice end ${path}`);
  };
  if (dev) dev.played[`voice:${path}`] = (dev.played[`voice:${path}`] ?? 0) + 1;
  devLog(`voice start ${path} ${buffer.duration.toFixed(2)}s g=${gain.toFixed(2)} p=${pan.toFixed(2)}`);
}

export const audio = {
  /**
   * Create or resume the audio engine. Call it from a click or key handler
   * (Créer une manif, Rejoindre, or any first gesture). Safe to call often.
   */
  unlock() {
    ensureSettings();
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor({ latencyHint: "interactive" });
      master = ctx.createGain();
      master.connect(ctx.destination);
      for (const bus of ["sfx", "music"] as const) {
        const g = ctx.createGain();
        g.connect(master);
        buses[bus] = g;
      }
      master.gain.value = 0;
      hidden = document.visibilityState === "hidden";
      document.addEventListener("visibilitychange", onVisibility);
      for (const name of soundsToLoad("sfx")) void load(name);
      if (bedWanted) for (const name of soundsToLoad("bed")) void load(name);
      devLog("unlocked");
    }
    if (ctx.state !== "running" && !hidden) void ctx.resume().then(applySettings);
    else applySettings();
  },

  /** Fetch the music and ambience files: called once the lobby shows, so the homepage stays light. */
  loadBed() {
    bedWanted = true;
    if (ctx) for (const name of soundsToLoad("bed")) void load(name);
  },

  /** Play a one-shot. `gain` already includes the distance; `pan` -1..1; `rate` the pitch. */
  play(name: SoundName, gain: number, pan = 0, rate = 1) {
    if (!ctx || ctx.state !== "running" || hidden) return;
    const info = isFileSound(name) ? FILE_SOUNDS[name] : SYNTH_SOUNDS[name];
    const bus = buses[info.bus];
    if (!bus || busGain(info.bus) === 0) return;
    const level = gain * info.gain;
    // Out of earshot: not played, and not a cap drop either.
    if (level < MIN_GAIN) return;
    const t = ctx.currentTime;
    let buffer: AudioBuffer | undefined;
    if (isFileSound(name)) {
      buffer = buffers.get(name);
      if (!buffer) {
        void load(name);
        return;
      }
    }
    // Effects share the global cap; the music bus (stings, megaphone) has only the per-sound one.
    const pool = liveVoices().filter((v) => v.bus === info.bus);
    const decision = admit(pool, name, level, t, maxVoicesOf(name), info.bus === "sfx" ? MAX_VOICES : Infinity);
    if (!decision.accept) {
      devDropped(name);
      return;
    }
    for (const id of decision.evict) {
      const victim = voices.find((v) => v.id === id);
      victim?.stop();
      voices = voices.filter((v) => v.id !== id);
      devDropped((victim?.sound ?? name) as SoundName);
    }

    const out = ctx.createGain();
    out.gain.value = level;
    const panner = makePanner(ctx, pan);
    if (panner) out.connect(panner).connect(bus);
    else out.connect(bus);

    let length: number;
    let stop: () => void;
    if (buffer) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      source.connect(out);
      source.start(t);
      length = buffer.duration / rate;
      stop = () => {
        out.gain.setTargetAtTime(0, ctx?.currentTime ?? 0, 0.02);
        source.stop((ctx?.currentTime ?? 0) + 0.1);
      };
    } else {
      length = synthesize(ctx, name as Exclude<SoundName, FileSoundName>, out, t);
      stop = () => out.gain.setTargetAtTime(0, ctx?.currentTime ?? 0, 0.02);
    }
    voices.push({ id: nextVoiceId++, sound: name, bus: info.bus, gain: level, endsAt: t + length, stop });
    if (dev) {
      dev.played[name] = (dev.played[name] ?? 0) + 1;
      dev.maxActive = Math.max(dev.maxActive, voices.filter((v) => v.bus === "sfx").length);
      devLog(`play ${name} g=${level.toFixed(2)} p=${pan.toFixed(2)}`);
    }
  },

  /** Fetch and decode these cameo clips now (a cameo just arrived), so its lines play on time. */
  preloadClips(paths: readonly string[]): boolean {
    if (!ctx) return false;
    for (const path of paths) void loadClip(path);
    return true;
  },

  /**
   * Play a cameo's voice clip (#137), cutting the one before: never two at
   * once. On the effects bus (the effects mute silences it), outside the
   * effects' voice cap. Not loaded yet: it loads, and this line stays silent.
   */
  playClip(path: string, gain: number, pan: number, effect: VoiceEffect) {
    this.stopClip();
    if (!ctx || ctx.state !== "running" || hidden) return;
    if (!buses.sfx || busGain("sfx") === 0) return;
    const buffer = clips.get(path);
    if (buffer) {
      startClip(path, buffer, gain, pan, effect);
      return;
    }
    // Not loaded yet (the cameo's arrival line comes with the cameo): start it as soon as it is.
    const asked = { path, gain, pan, effect, askedAt: ctx.currentTime };
    pendingClip = asked;
    devLog(`voice waiting ${path}`);
    void loadClip(path).then((loaded) => {
      if (pendingClip !== asked) return;
      pendingClip = null;
      if (!loaded || !ctx || ctx.currentTime - asked.askedAt > CLIP_LATE) {
        devLog(`voice skipped ${path}`);
        return;
      }
      startClip(path, loaded, asked.gain, asked.pan, asked.effect);
    });
  },

  /** Follow the speaking cameo as he (or the player) moves. */
  moveClip(gain: number, pan: number) {
    if (pendingClip) {
      pendingClip.gain = gain;
      pendingClip.pan = pan;
    }
    if (!ctx || !clip) return;
    const t = ctx.currentTime;
    clip.gain.gain.setTargetAtTime(gain, t, 0.08);
    clip.pan?.pan.setTargetAtTime(pan, t, 0.08);
  },

  /** Stop the cameo clip that is playing (or waiting to), with a short fade: another line cut it, or its cameo left. */
  stopClip() {
    pendingClip = null;
    const playing = clip;
    if (!playing) return;
    clip = null;
    const t = ctx?.currentTime ?? 0;
    if (t >= playing.endsAt) return;
    playing.gain.gain.setTargetAtTime(0, t, 0.03);
    playing.source.stop(t + 0.15);
    devLog(`voice stop ${playing.path}`);
  },

  /**
   * The loops that should be playing now, by key (a fire's id, "crowd"...):
   * new keys start (fading in), known ones glide to their new level, and
   * missing ones fade out and stop. Call it as often as the levels change.
   */
  setLoops(wishes: ReadonlyMap<string, LoopWish>) {
    const context = ctx;
    if (!context) return;
    const t = context.currentTime;
    for (const [key, loop] of loops) {
      if (wishes.get(key)?.sound === loop.sound) continue;
      loop.gain.gain.setTargetAtTime(0, t, FADE / 3);
      const source = loop.source;
      if (source) source.stop(t + FADE * 2);
      loops.delete(key);
      devLog(`loop stop ${key}`);
    }
    for (const [key, wish] of wishes) {
      const info = FILE_SOUNDS[wish.sound];
      const bus = buses[info.bus];
      if (!bus) continue;
      const level = Math.max(0, wish.gain * info.gain);
      let loop = loops.get(key);
      if (!loop) {
        const buffer = buffers.get(wish.sound);
        if (!buffer) {
          // Not loaded yet: it starts on a later call, once it is.
          void load(wish.sound);
          continue;
        }
        const gain = context.createGain();
        gain.gain.value = 0;
        const pan = makePanner(context, wish.pan ?? 0);
        if (pan) gain.connect(pan).connect(bus);
        else gain.connect(bus);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(gain);
        // Start each loop somewhere inside it, so two fires don't crackle in step.
        source.start(t, Math.random() * buffer.duration);
        loop = { sound: wish.sound, source, gain, pan };
        loops.set(key, loop);
        devLog(`loop start ${key} ${wish.sound}`);
      }
      loop.gain.gain.setTargetAtTime(level, t, FADE / 3);
      if (loop.pan && wish.pan !== undefined) loop.pan.pan.setTargetAtTime(wish.pan, t, FADE / 3);
    }
  },

  /** Stop every loop (round over, back home). One-shots finish on their own. */
  stopLoops() {
    this.setLoops(new Map());
  },

  getSettings(): SoundSettings {
    ensureSettings();
    return settings;
  },

  setSettings(next: SoundSettings) {
    ensureSettings();
    settings = next;
    saveSettings(next);
    applySettings();
    for (const listener of settingsListeners) listener();
  },

  subscribeSettings(listener: () => void): () => void {
    settingsListeners.add(listener);
    return () => settingsListeners.delete(listener);
  },
};
