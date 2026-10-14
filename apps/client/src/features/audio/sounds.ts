/**
 * The sound catalogue (#57): every sound the game plays, file or generated.
 * The files are CC0 (see public/sounds/CREDITS.md), served from public/ so
 * they never end up in the JS bundle, and fetched only after the first click.
 */

/** Which mute toggle a sound obeys: effects, or music and ambience. */
export type Bus = "sfx" | "music";

/** When a file is fetched: `sfx` on the first click, `bed` (music and ambience) once the lobby shows. */
type LoadGroup = "sfx" | "bed";

export interface FileSound {
  file: string;
  bus: Bus;
  load: LoadGroup;
  /** Base gain, 0..1, before distance and the volume settings. */
  gain: number;
  /** How many copies may play at once. */
  maxVoices: number;
  /** Random pitch spread, ±fraction (0.08 = ±8%), so repeats don't sound robotic. */
  jitter: number;
}

const sfx = (file: string, gain: number, maxVoices: number, jitter = 0.08): FileSound => ({
  file,
  bus: "sfx",
  load: "sfx",
  gain,
  maxVoices,
  jitter,
});
const bed = (file: string, gain: number): FileSound => ({ file, bus: "music", load: "bed", gain, maxVoices: 1, jitter: 0 });

export const FILE_SOUNDS = {
  swing: sfx("swing.mp3", 0.45, 4, 0.12),
  throw: sfx("throw.mp3", 0.55, 3, 0.1),
  "punch-1": sfx("punch-1.mp3", 0.8, 3),
  "punch-2": sfx("punch-2.mp3", 0.8, 3),
  "baton-1": sfx("baton-1.mp3", 0.9, 3),
  "baton-2": sfx("baton-2.mp3", 0.9, 3),
  shield: sfx("shield.mp3", 0.7, 3),
  pickup: sfx("pickup.mp3", 0.6, 2),
  pave: sfx("pave.mp3", 0.9, 3),
  metal: sfx("metal.mp3", 0.9, 2),
  splat: sfx("splat.mp3", 0.8, 3, 0.12),
  glass: sfx("glass.mp3", 0.75, 2),
  car: sfx("car.mp3", 0.7, 2),
  wood: sfx("wood.mp3", 0.8, 2),
  bin: sfx("bin.mp3", 0.8, 2),
  ignite: sfx("ignite.mp3", 0.6, 2),
  launch: sfx("launch.mp3", 0.8, 2),
  hiss: sfx("hiss.mp3", 0.55, 2),
  cough: sfx("cough.mp3", 0.7, 1, 0.1),
  cuffs: sfx("cuffs.mp3", 0.8, 2),
  "van-door": sfx("van-door.mp3", 0.9, 2),
  moped: sfx("moped.mp3", 0.8, 2, 0.05),
  whistle: sfx("whistle.mp3", 0.55, 2, 0.06),
  "whistle-long": sfx("whistle-long.mp3", 0.6, 1, 0),
  cheer: sfx("cheer.mp3", 0.6, 1, 0),
  "fire-loop": sfx("fire-loop.mp3", 0.6, 3, 0),
  "hose-loop": sfx("hose-loop.mp3", 0.5, 2, 0),
  "crowd-loop": bed("crowd-loop.mp3", 0.5),
  "drums-loop": bed("drums-loop.mp3", 0.3),
  "boo-loop": bed("boo-loop.mp3", 0.35),
  "lobby-music": bed("lobby-music.mp3", 0.4),
  // The same whistle, far off in the cortège: part of the ambience, so it obeys the music/ambience mute.
  "crowd-whistle": { ...bed("whistle.mp3", 0.35), maxVoices: 2, jitter: 0.08 },
} as const satisfies Record<string, FileSound>;
export type FileSoundName = keyof typeof FILE_SOUNDS;

/**
 * Sounds made in code (Web Audio oscillators and noise): short blips that
 * need no file and no licence. See synth.ts.
 */
export const SYNTH_SOUNDS = {
  hop: { bus: "sfx", gain: 0.35, maxVoices: 3 },
  rescue: { bus: "sfx", gain: 0.45, maxVoices: 2 },
  tick: { bus: "sfx", gain: 0.35, maxVoices: 1 },
  fanfare: { bus: "music", gain: 0.45, maxVoices: 1 },
  "sad-trombone": { bus: "music", gain: 0.5, maxVoices: 1 },
  megaphone: { bus: "music", gain: 0.3, maxVoices: 1 },
  blip: { bus: "sfx", gain: 0.3, maxVoices: 1 },
  // The CRS LBD (#73): its aim's rising beeps, and the rubber ball's boing.
  charge: { bus: "sfx", gain: 0.3, maxVoices: 2 },
  boing: { bus: "sfx", gain: 0.55, maxVoices: 3 },
} as const satisfies Record<string, { bus: Bus; gain: number; maxVoices: number }>;
export type SynthSoundName = keyof typeof SYNTH_SOUNDS;

export type SoundName = FileSoundName | SynthSoundName;

export function isFileSound(name: SoundName): name is FileSoundName {
  return name in FILE_SOUNDS;
}

/** Per-sound cap on simultaneous copies. */
export function maxVoicesOf(name: SoundName): number {
  return isFileSound(name) ? FILE_SOUNDS[name].maxVoices : SYNTH_SOUNDS[name].maxVoices;
}

/** All one-shot effects together: past this, the farthest are dropped first. */
export const MAX_VOICES = 14;

/** The files of one load group, by name. */
export function soundsToLoad(group: LoadGroup): FileSoundName[] {
  return (Object.keys(FILE_SOUNDS) as FileSoundName[]).filter((name) => FILE_SOUNDS[name].load === group);
}
