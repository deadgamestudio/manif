import { ARCHETYPE_IDS, ARCHETYPES, archetypeOf } from "@manif/shared";
import { net } from "../../shared/net/index.ts";
import { archetypeLook } from "./archetypeVisuals.tsx";

/**
 * The archetype menu on the lobby screen (#14): a tile per archetype, the
 * player's current pick highlighted, and its description, strength and
 * weakness under the grid. A tap sends the id; the highlight follows the
 * synced pick, so everyone (this player included) sees what the server took.
 * Shown only in `waiting`: the pick is locked during the march.
 */
export function ArchetypePicker({ current }: { current: number }) {
  const picked = archetypeOf(current);
  const info = ARCHETYPES[picked];
  return (
    <section className="placard placard-archetype">
      <h2 className="placard-label">Ton personnage</h2>
      <div className="archetypes" role="radiogroup" aria-label="Choisis ton personnage">
        {ARCHETYPE_IDS.map((id) => {
          const look = archetypeLook(id);
          const selected = id === picked;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              className="archetype-tile"
              data-selected={selected || undefined}
              onClick={() => net.pickArchetype(id)}
            >
              <span className="archetype-swatch" style={{ background: look.clothes }} aria-hidden="true">
                {look.icon}
              </span>
              <span className="archetype-name">{ARCHETYPES[id].name}</span>
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
