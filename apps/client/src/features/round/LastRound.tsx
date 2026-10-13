import { RoundResult } from "@manif/shared";
import { useRound } from "./useRound.ts";
import { resultText } from "./text.ts";

/** On the lobby screen after a round (#12): how the last march ended. Nothing before the first one. */
export function LastRound() {
  const { result } = useRound();
  if (result === RoundResult.None) return null;
  const { title, line } = resultText(result);
  return (
    <p className="last-round" data-won={result === RoundResult.Won || undefined}>
      <b>Dernière manif : {title}</b> {line}
    </p>
  );
}
