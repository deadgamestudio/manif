import { useSyncExternalStore } from "react";
import { net, type RoundView } from "../../shared/net/index.ts";

/** The round's timer, progress, result and last end-of-round numbers (#12). Re-renders only when one changes. */
export function useRound(): RoundView {
  return useSyncExternalStore(net.subscribeRound, net.getRound);
}
