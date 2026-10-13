import { useRound } from "./useRound.ts";
import { clock } from "./text.ts";

/**
 * Top of the screen while marching (#12): the round timer and the cortège's
 * progress from the start to the Préfecture.
 */
export function RoundHud() {
  const { timeLeft, progress } = useRound();
  return (
    <div className="round-hud">
      <div className="round-timer" data-low={timeLeft <= 30 || undefined} aria-label="Temps restant">
        {clock(timeLeft)}
      </div>
      <div
        className="round-progress"
        role="meter"
        aria-label="Avancée du cortège"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div className="round-progress-fill" style={{ width: `${progress}%` }} />
        <span className="round-progress-end">Préfecture</span>
      </div>
    </div>
  );
}
