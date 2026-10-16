import { Component, Fragment, Suspense, lazy, useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { ARCHETYPE_IDS, ARCHETYPES, archetypeOf } from "@manif/shared";
import { net } from "../../shared/net/index.ts";
import { archetypeLook } from "./archetypeVisuals.tsx";
import { PORTRAIT_HEIGHT, PORTRAIT_WIDTH, portraitUrl } from "./portraits.ts";

// #128: the live 3D characters, a chunk of their own (three.js stays out of the first download).
const Turntable = lazy(() => import("./Turntable.tsx"));

/** pictures: the still portraits only (first, and with reduced motion); live: the 3D on top; failed: back to the pictures for good. */
type Mode = "pictures" | "live" | "failed";

const NONE: ReadonlySet<number> = new Set();

/**
 * The archetype menu on the lobby screen (#14): a tile per archetype with
 * its portrait (#126), the player's current pick highlighted, and its
 * description, strength and weakness under the grid. A tap sends the id; the highlight follows the
 * synced pick, so everyone (this player included) sees what the server took.
 * Shown only in `waiting`: the pick is locked during the march.
 *
 * The portraits start as the still pictures. Once the lobby is up, the 3D
 * turntable (Turntable.tsx, #128) loads and replaces each picture as soon as
 * its character is drawn; it goes back to the pictures if WebGL fails or is
 * lost. With reduced motion, the pictures stay.
 */
export function ArchetypePicker({ current }: { current: number }) {
  const picked = archetypeOf(current);
  const info = ARCHETYPES[picked];
  // The name labels the card: the portrait's alt text would say it twice.
  const labelId = useId();
  const [mode, setMode] = useState<Mode>("pictures");
  const [shown, setShown] = useState(NONE);
  const slots = useMemo(() => new Map<number, HTMLCanvasElement>(), []);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    return whenIdle(() => setMode((m) => (m === "pictures" ? "live" : m)));
  }, []);
  const onShown = useCallback((id: number) => setShown((s) => new Set(s).add(id)), []);
  const onLost = useCallback(() => {
    setMode("failed");
    setShown(NONE);
  }, []);
  const live = mode === "live";

  return (
    <section className="placard placard-archetype">
      <h2 className="placard-label">Ton personnage</h2>
      <div className="archetypes" role="radiogroup" aria-label="Choisis ton personnage">
        {ARCHETYPE_IDS.map((id) => {
          const selected = id === picked;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-labelledby={`${labelId}-${id}`}
              className="archetype-tile"
              data-selected={selected || undefined}
              onClick={() => net.pickArchetype(id)}
            >
              {/* #126: the archetype's body as in the game, pre-rendered (portraits.ts); #128: then live. */}
              <span className="archetype-portrait" data-live={(live && shown.has(id)) || undefined}>
                <img src={portraitUrl(id)} alt={ARCHETYPES[id].name} width={PORTRAIT_WIDTH} height={PORTRAIT_HEIGHT} decoding="async" />
                {live && (
                  <canvas
                    ref={(el) => {
                      if (el) slots.set(id, el);
                      else slots.delete(id);
                    }}
                    className="archetype-live"
                    width={PORTRAIT_WIDTH}
                    height={PORTRAIT_HEIGHT}
                    aria-hidden="true"
                  />
                )}
              </span>
              <span className="archetype-name" id={`${labelId}-${id}`}>
                <Words text={ARCHETYPES[id].name} />
              </span>
            </button>
          );
        })}
      </div>
      <div className="archetype-detail" aria-live="polite">
        <p className="archetype-desc">{info.description}</p>
        <p className="archetype-plus">+ {info.strength}</p>
        <p className="archetype-minus">− {info.weakness}</p>
      </div>
      {live && (
        <Fallback onError={onLost}>
          <Suspense fallback={null}>
            <Turntable slots={slots} picked={picked} onShown={onShown} onLost={onLost} />
          </Suspense>
        </Fallback>
      )}
    </section>
  );
}

/** `text` with each word kept whole: a name breaks between words only, never at "Manifestant·" / "e". */
function Words({ text }: { text: string }) {
  return text.split(" ").map((word, i) => (
    <Fragment key={i}>
      {i > 0 && " "}
      <span className="archetype-word">{word}</span>
    </Fragment>
  ));
}

/** Runs `run` once the browser is idle (the lobby drawn), at the latest after a second. Returns a cancel. */
function whenIdle(run: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(run, { timeout: 1000 });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(run, 200);
  return () => clearTimeout(handle);
}

/** The 3D failing (no WebGL, its chunk missing after a deploy) leaves the pictures, quietly. */
class Fallback extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    console.warn("[archetype] live portraits off, showing the pictures", error);
    this.props.onError();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** A player's archetype in the roster (#14): its swatch and name. */
export function ArchetypeBadge({ archetype }: { archetype: number }) {
  const id = archetypeOf(archetype);
  const look = archetypeLook(id);
  return (
    <span className="archetype-badge">
      <span className="archetype-swatch archetype-swatch-small" style={{ background: look.clothes }} aria-hidden="true">
        {look.icon}
      </span>
      {ARCHETYPES[id].name}
    </span>
  );
}
