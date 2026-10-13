/** The sound settings (#57): one volume and two mutes, remembered on this browser. */

export interface SoundSettings {
  /** Master volume, 0..1. */
  volume: number;
  /** Effects off. */
  sfxMuted: boolean;
  /** Music and the crowd ambience off. */
  musicMuted: boolean;
}

export const DEFAULT_SETTINGS: SoundSettings = { volume: 0.8, sfxMuted: false, musicMuted: false };

const KEY = "manif.sound";

/** Reads what `serializeSettings` wrote; anything missing or broken falls back to the default. */
export function parseSettings(raw: string | null): SoundSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const data = JSON.parse(raw) as Partial<Record<keyof SoundSettings, unknown>> | null;
    if (!data || typeof data !== "object") return DEFAULT_SETTINGS;
    const volume = typeof data.volume === "number" && Number.isFinite(data.volume) ? Math.min(1, Math.max(0, data.volume)) : DEFAULT_SETTINGS.volume;
    return {
      volume,
      sfxMuted: typeof data.sfxMuted === "boolean" ? data.sfxMuted : DEFAULT_SETTINGS.sfxMuted,
      musicMuted: typeof data.musicMuted === "boolean" ? data.musicMuted : DEFAULT_SETTINGS.musicMuted,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function serializeSettings(s: SoundSettings): string {
  return JSON.stringify({ volume: s.volume, sfxMuted: s.sfxMuted, musicMuted: s.musicMuted });
}

// localStorage can throw (private mode, blocked storage): the settings then just aren't remembered.

export function loadSettings(): SoundSettings {
  try {
    return parseSettings(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: SoundSettings) {
  try {
    localStorage.setItem(KEY, serializeSettings(s));
  } catch {
    // not remembered, that's all
  }
}

/** The mute shortcut: everything off, or everything back on if all was already off. */
export function toggleAll(s: SoundSettings): SoundSettings {
  const allOff = s.sfxMuted && s.musicMuted;
  return { ...s, sfxMuted: !allOff, musicMuted: !allOff };
}
