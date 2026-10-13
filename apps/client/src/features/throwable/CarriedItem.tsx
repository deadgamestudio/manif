import { useCallback, useSyncExternalStore } from "react";
import { net } from "../../shared/net/index.ts";
import { lookOf } from "./throwableVisuals.tsx";

/**
 * What player `id` carries (#8), drawn in their hand. Mount it inside the
 * arm, at the hand. Re-renders only when `carrying` changes.
 */
export function CarriedItem({ id }: { id: string }) {
  const subscribe = useCallback((listener: () => void) => net.watchPlayer(id, ["carrying"], listener), [id]);
  const kind = useSyncExternalStore(subscribe, () => net.getPlayer(id)?.carrying ?? 0);
  const look = lookOf(kind);
  if (!look) return null;
  return <group position-y={look.handY}>{look.model()}</group>;
}
