import { useEffect, useRef, useState } from "react";
import { useRound } from "./useRound.ts";
import "./tension.css";

/** How long the banner stays up, in ms. Matches the CSS animation. */
const BANNER_MS = 3500;

/**
 * The street turns hot (#98): a short placard over the street, once a round,
 * when the server says so (`state.hot`). From then on the CRS chase anyone.
 * Only on a change seen while playing: joining a round already hot shows nothing.
 */
export function TensionBanner() {
  const { hot } = useRound();
  const last = useRef(hot);
  const [banner, setBanner] = useState<{ n: number } | null>(null);

  useEffect(() => {
    const turned = hot && !last.current;
    last.current = hot;
    if (turned) setBanner((b) => ({ n: (b?.n ?? 0) + 1 }));
  }, [hot]);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), BANNER_MS);
    return () => window.clearTimeout(timer);
  }, [banner]);

  if (!banner) return null;
  return (
    // Keyed by count, so a new round's banner replays its animation.
    <div key={banner.n} className="tension-banner" role="status">
      <span aria-hidden="true">🔥</span> La tension monte…
    </div>
  );
}
