import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MoluchanPhase } from "@manif/shared";
import { net } from "../../shared/net/index.ts";
import { MOLUCHAN_BANNERS, bannerFor, type MoluchanBanner } from "./banner.ts";
import "./moluchan.css";

/** How long a banner stays up, in ms. Matches the CSS animation. */
const BANNER_MS = 4000;

/**
 * Jeun-Lac Moluchan's moments (#85), as a short banner over the street: he
 * joins the cortège, he leaves untouched (protected), or a CRS gets him.
 * Only on a change seen while playing: joining mid-visit shows nothing.
 */
export function MoluchanHud() {
  const phase = useSyncExternalStore(net.subscribeMoluchan, net.getMoluchanPhase);
  const last = useRef<MoluchanPhase | null>(phase);
  const [banner, setBanner] = useState<{ kind: MoluchanBanner; n: number } | null>(null);

  useEffect(() => {
    const kind = bannerFor(last.current, phase);
    last.current = phase;
    if (!kind) return;
    setBanner((b) => ({ kind, n: (b?.n ?? 0) + 1 }));
  }, [phase]);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), BANNER_MS);
    return () => window.clearTimeout(timer);
  }, [banner]);

  if (!banner) return null;
  const { icon, text } = MOLUCHAN_BANNERS[banner.kind];
  return (
    // Keyed by count, so a new banner replays its animation.
    <div key={banner.n} className="moluchan-banner" data-kind={banner.kind} role="status">
      <span aria-hidden="true">{icon}</span> {text}
    </div>
  );
}
