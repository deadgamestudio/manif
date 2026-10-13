import { ARCHETYPES, RoundResult, archetypeOf } from "@manif/shared";
import { archetypeLook } from "../archetype/index.ts";
import { useRound } from "./useRound.ts";
import { clock, resultText } from "./text.ts";
import { laureates, type Laureate } from "./podium.ts";

function Badge({ archetype }: { archetype: number }) {
  const id = archetypeOf(archetype);
  const look = archetypeLook(id);
  return (
    <span className="podium-badge" title={ARCHETYPES[id].name}>
      <span className="podium-swatch" style={{ background: look.clothes }} aria-hidden="true">
        {look.icon}
      </span>
      <span className="podium-archetype">{ARCHETYPES[id].name}</span>
    </span>
  );
}

function Step({ laureate, place }: { laureate: Laureate; place: number }) {
  return (
    <li className="podium-step" data-place={place} data-me={laureate.isMe || undefined}>
      <div className="podium-who">
        <span className="podium-name">
          {laureate.name}
          {laureate.isMe && <span className="podium-me"> (toi)</span>}
        </span>
        <Badge archetype={laureate.archetype} />
      </div>
      <ul className="podium-awards">
        {laureate.awards.map((a) => (
          <li key={a.title}>
            <b>{a.title}</b>
            <span className="podium-unit">
              {a.value} {a.unit}
            </span>
          </li>
        ))}
      </ul>
      <span className="podium-block" aria-hidden="true">
        {place}
      </span>
    </li>
  );
}

/**
 * Over the frozen street once a round is decided (#12): win or lose, how long
 * it lasted and the joke awards on a small podium, until the room goes back
 * to the lobby. The awards come from ServerMessage.RoundEnd; a player who
 * joined during the end screen sees the result without them.
 */
export function EndScreen({ localId }: { localId: string | null }) {
  const { result, timeLeft, end } = useRound();
  const { title, line } = resultText(result);
  const ranked = end ? laureates(end.players, localId) : [];
  const top = ranked.slice(0, 3);
  // Second on the left, first in the middle, third on the right.
  const podium = [top[1], top[0], top[2]].flatMap((l) => (l ? [{ l, place: top.indexOf(l) + 1 }] : []));
  const rest = ranked.slice(3);
  return (
    <div className="round-end" data-won={result === RoundResult.Won || undefined}>
      <section className="round-end-card" aria-labelledby="round-end-title">
        <h2 id="round-end-title" className="round-end-title">
          {title}
        </h2>
        <p className="round-end-line">{line}</p>
        {end && <p className="round-end-time">Durée : {clock(end.seconds)}</p>}
        {podium.length > 0 && (
          <ol className="podium" aria-label="Le palmarès">
            {podium.map(({ l, place }) => (
              <Step key={l.name} laureate={l} place={place} />
            ))}
          </ol>
        )}
        {rest.length > 0 && (
          <ul className="podium-rest">
            {rest.map((l) => (
              <li key={l.name} data-me={l.isMe || undefined}>
                <Badge archetype={l.archetype} />
                <span className="podium-name">{l.name}</span> : {l.awards.map((a) => a.title).join(", ")}
              </li>
            ))}
          </ul>
        )}
        <p className="round-end-next" role="status">
          Retour au point de rendez-vous dans <b>{timeLeft} s</b> pour la prochaine manif…
        </p>
      </section>
    </div>
  );
}
