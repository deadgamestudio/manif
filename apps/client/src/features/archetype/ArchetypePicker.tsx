import { useId } from "react";
import { ARCHETYPE_IDS, ARCHETYPES, archetypeOf } from "@manif/shared";
import { net } from "../../shared/net/index.ts";
import { archetypeLook } from "./archetypeVisuals.tsx";
import { PORTRAIT_HEIGHT, PORTRAIT_WIDTH, portraitUrl } from "./portraits.ts";

/**
 * The archetype menu on the lobby screen (#14): a tile per archetype with
 * its portrait (#126), the player's current pick highlighted, and its
 * description, strength and weakness under the grid. A tap sends the id; the highlight follows the
 * synced pick, so everyone (this player included) sees what the server took.
 * Shown only in `waiting`: the pick is locked during the march.
 */
export function ArchetypePicker({ current }: { current: number }) {
  const picked = archetypeOf(current);
  const info = ARCHETYPES[picked];
  // The name labels the card: the portrait's alt text would say it twice.
  const labelId = useId();
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
              {/* #126: the archetype's body as in the game, pre-rendered (portraits.ts). */}
              <span className="archetype-portrait">
                <img src={portraitUrl(id)} alt={ARCHETYPES[id].name} width={PORTRAIT_WIDTH} height={PORTRAIT_HEIGHT} decoding="async" />
              </span>
              <span className="archetype-name" id={`${labelId}-${id}`}>
                {ARCHETYPES[id].name}
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
    </section>
  );
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
