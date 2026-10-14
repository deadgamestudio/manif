import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { audio } from "./engine.ts";
import { toggleAll, type SoundSettings } from "./settings.ts";
import { useActions, useKeyLabels } from "../controls/index.ts";
import "./audio.css";

/**
 * The default mute shortcut's name. The live one is in the keymap (#72): M on
 * AZERTY and QWERTY alike by default, rebindable; typing in a field never mutes.
 */
export const MUTE_KEY_LABEL = "M";

const MUTE = ["mute"] as const;

function useSoundSettings(): SoundSettings {
  return useSyncExternalStore(audio.subscribeSettings, audio.getSettings);
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <path d="M3 7.5h3.2L10.5 4v12l-4.3-3.5H3z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      {muted ? (
        <path d="M13.2 7.3l4.6 5.4M17.8 7.3l-4.6 5.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      ) : (
        <path d="M13.3 7.2a4 4 0 0 1 0 5.6M15.6 5a7 7 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  );
}

/**
 * The sound button (#57): a speaker chip that opens one volume slider and
 * the two mutes (effects; music and ambience), remembered on this browser.
 * The mute key (M by default, #72) mutes or brings back everything. `placement` "lobby" pins it to the top
 * right of the lobby screen; "hud" sits in the HUD's corner, by the "?".
 */
export function SoundControl({ placement, touch = false }: { placement: "hud" | "lobby"; touch?: boolean }) {
  const settings = useSoundSettings();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const allMuted = (settings.sfxMuted && settings.musicMuted) || settings.volume === 0;

  const keys = useKeyLabels();
  useActions(MUTE, (_, pressed) => {
    if (pressed) audio.setSettings(toggleAll(audio.getSettings()));
  });

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, []);

  const set = (patch: Partial<SoundSettings>) => {
    // The button itself is a gesture: make sure the engine runs when sound comes back.
    audio.unlock();
    audio.setSettings({ ...audio.getSettings(), ...patch });
  };

  const button = (
    <button
      type="button"
      className="hud-chip sound-btn"
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={allMuted ? "Son coupé : régler le son" : "Régler le son"}
      title={touch ? "Son" : `Son (${keys.mute} pour couper)`}
      onClick={() => setOpen((o) => !o)}
    >
      <SpeakerIcon muted={allMuted} />
    </button>
  );

  const panel = open && (
    <section id={panelId} className="sound-panel" aria-label="Son">
      <h2 className="sound-title">Le son</h2>
      <label className="sound-row sound-volume">
        <span>Volume</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(settings.volume * 100)}
          onChange={(e) => set({ volume: Number(e.target.value) / 100 })}
        />
      </label>
      <label className="sound-row">
        <input type="checkbox" checked={!settings.sfxMuted} onChange={(e) => set({ sfxMuted: !e.target.checked })} />
        <span>Bruitages</span>
      </label>
      <label className="sound-row">
        <input type="checkbox" checked={!settings.musicMuted} onChange={(e) => set({ musicMuted: !e.target.checked })} />
        <span>Musique et ambiance</span>
      </label>
      {!touch && (
        <p className="sound-hint">
          <kbd>{keys.mute}</kbd> coupe ou remet tout.
        </p>
      )}
    </section>
  );

  if (placement === "lobby") {
    return (
      <div className="sound-corner">
        {button}
        {panel}
      </div>
    );
  }
  return (
    <div className="sound-hud">
      {button}
      {panel}
    </div>
  );
}
