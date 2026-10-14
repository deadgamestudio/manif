import { ARCHETYPES, RoundResult, archetypeOf } from "@manif/shared";
import { archetypeLook } from "../archetype/index.ts";
import { points } from "../score/index.ts";
import { useRound } from "./useRound.ts";
import { bankText, clock, resultText } from "./text.ts";
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

/** The round's points (#41), and the lasting total once banked. */
function Score({ laureate }: { laureate: Laureate }) {
  return (
    <span className="podium-score">
      <b>{points(laureate.score)}</b>
      {laureate.total !== undefined && <span className="podium-total">total {points(laureate.total)}</span>}
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
        <Score laureate={laureate} />
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
 * it lasted, and every protester ranked by round score (#41) with their joke
 * awards: the top three on a small podium, the others under it. Each shows
 * their new lasting total once the round is banked. Everything comes from
 * ServerMessage.RoundEnd; a player who joined during the end screen sees the
 * result without it.
 */
export function EndScreen({ localId }: { localId: string | null }) {
  const { result, timeLeft, end } = useRound();
  const { title, line } = resultText(result);
  const ranked = end ? laureates(end.players, localId) : [];
  const top = ranked.slice(0, 3);
  // Second on the left, first in the middle, third on the right.
  const podium = [top[1], top[0], top[2]].flatMap((l) => (l ? [{ l, place: top.indexOf(l) + 1 }] : []));
  const rest = ranked.slice(3);
  const bankNote = end ? bankText(end.bank) : null;
  return (
    <div className="round-end" data-won={result === RoundResult.Won || undefined}>
      <section className="round-end-card" aria-labelledby="round-end-title">
        <h2 id="round-end-title" className="round-end-title">
          {title}
        </h2>
        <p className="round-end-line">{line}</p>
        {end && <p className="round-end-time">Durée : {clock(end.seconds)}</p>}
        {bankNote && <p className="round-end-bank">{bankNote}</p>}
        {podium.length > 0 && (
          <ol className="podium" aria-label="Le classement de la manif">
            {podium.map(({ l, place }) => (
              <Step key={l.id} laureate={l} place={place} />
            ))}
          </ol>
        )}
        {rest.length > 0 && (
          <ol className="podium-rest" start={4}>
            {rest.map((l, i) => (
              <li key={l.id} data-me={l.isMe || undefined}>
                <span className="podium-rest-rank">{i + 4}</span>
                <Badge archetype={l.archetype} />
                <span className="podium-name">{l.name}</span> <Score laureate={l} />
                {l.awards.length > 0 && <span className="podium-rest-awards"> · {l.awards.map((a) => a.title).join(", ")}</span>}
              </li>
            ))}
          </ol>
        )}
        <p className="round-end-next" role="status">
          Retour au point de rendez-vous dans <b>{timeLeft} s</b> pour la prochaine manif…
        </p>
      </section>
    </div>
  );
}
