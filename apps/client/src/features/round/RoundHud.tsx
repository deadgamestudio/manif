import { MyScore } from "../score/index.ts";
import { useRound } from "./useRound.ts";
import { clock } from "./text.ts";

/** Under this many seconds the timer turns red. */
const LOW = 30;
/** Under this many it also pulses. */
const CRITICAL = 10;

/**
 * The round timer and the cortège's progress from the start to the Préfecture
 * (#12): bottom centre on a keyboard, top centre on touch, clear of the stick.
 * My round score (#41) sits at its right end.
 */
export function RoundHud({ localId }: { localId: string | null }) {
  const { timeLeft, progress } = useRound();
  return (
    <div className="round-hud">
      <div
        className="round-timer"
        data-low={timeLeft <= LOW || undefined}
        data-critical={(timeLeft > 0 && timeLeft <= CRITICAL) || undefined}
        aria-label="Temps restant"
      >
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
        <div className="round-progress-fill" style={{ transform: `scaleX(${Math.max(0, Math.min(100, progress)) / 100})` }} />
      </div>
      <span className="round-progress-end">Préfecture</span>
      <MyScore localId={localId} />
    </div>
  );
}
