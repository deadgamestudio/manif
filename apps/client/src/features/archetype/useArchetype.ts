import { useCallback, useSyncExternalStore } from "react";
import { archetypeStats, type ArchetypeStats } from "@manif/shared";
import { net } from "../../shared/net/index.ts";

const FIELDS = ["archetype"] as const;

/**
 * The archetype stats (#14) of player `id`, for HUDs that show a number the
 * archetype changes (max HP, the dodge cooldown). Re-renders only when the
 * pick changes, which is only ever in the lobby. The default's without a player.
 */
export function useArchetypeStats(id: string | null): ArchetypeStats {
  const subscribe = useCallback((listener: () => void) => (id ? net.watchPlayer(id, FIELDS, listener) : () => undefined), [id]);
  const archetype = useSyncExternalStore(subscribe, () => (id ? (net.getPlayer(id)?.archetype ?? 0) : 0));
  return archetypeStats(archetype);
}
