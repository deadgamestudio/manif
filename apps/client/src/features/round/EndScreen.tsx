import { RoundResult, roundAwards } from "@manif/shared";
import { useRound } from "./useRound.ts";
import { clock, resultText } from "./text.ts";

/**
 * Over the frozen street once a round is decided (#12): win or lose, the time
 * taken and the joke awards, until the room goes back to the lobby screen.
 * The awards come from ServerMessage.RoundEnd; a player who joined during the
 * end screen sees the result without them.
 */
export function EndScreen() {
  const { result, timeLeft, end } = useRound();
  const { title, line } = resultText(result);
  const awards = end ? roundAwards(end.players) : [];
  return (
    <div className="round-end" data-won={result === RoundResult.Won || undefined}>
      <div className="round-end-card">
        <h2 className="round-end-title">{title}</h2>
        <p className="round-end-line">{line}</p>
        {end && <p className="round-end-time">Manif de {clock(end.seconds)}</p>}
        {awards.length > 0 && (
          <ul className="round-end-awards">
            {awards.map((a) => (
              <li key={a.title}>
                <b>{a.title}</b> : {a.name} <span className="round-end-unit">({a.value} {a.unit})</span>
              </li>
            ))}
          </ul>
        )}
        <p className="round-end-next">Retour au point de rendez-vous dans {timeLeft} s…</p>
      </div>
    </div>
  );
}
