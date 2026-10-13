import { useEffect, useState } from "react";
import { PICKUP_RANGE, PlayerStatus, ThrowableKind, nearestItem } from "@manif/shared";
import { net, type LobbyPlayer } from "../../shared/net/index.ts";
import { rescueTarget } from "../rescue/index.ts";
import { fireActionFor } from "../fire/index.ts";
import { carryTargetFor } from "../carry/index.ts";

/** How often the hint looks around, in ms, like the rescue prompt. */
const POLL_MS = 100;

/** Empty-handed, free and next to an item: the rule the server picks up with (#8). */
function canPickUp(localId: string): boolean {
  const me = net.getPlayer(localId);
  if (!me || me.status !== PlayerStatus.Free || me.down || me.carriedBy || me.carrying !== ThrowableKind.None) return false;
  const items: [string, { x: number; z: number }][] = [];
  for (const id of net.getItemIds()) {
    const item = net.getItem(id);
    if (item) items.push([id, item]);
  }
  return nearestItem(me, items, PICKUP_RANGE) !== null;
}

/**
 * Whether the Action button would do something right now (#42): free a
 * grabbed teammate (the same rule as the rescue prompt), pick up a teammate
 * or put them down (#11), pick up an item, or (held) pat out a burning
 * teammate or light a bin or a car (#16).
 * Polls a few times a second and re-renders only when the answer changes.
 */
export function useActionHint(localId: string | null, players: readonly LobbyPlayer[]): boolean {
  const [hint, setHint] = useState(false);
  useEffect(() => {
    if (!localId) return undefined;
    const update = () =>
      setHint(
        net.getCarried(localId) !== null ||
          rescueTarget(localId, players) !== null ||
          carryTargetFor(localId, players) !== null ||
          canPickUp(localId) ||
          fireActionFor(localId, players) !== null,
      );
    update();
    const timer = window.setInterval(update, POLL_MS);
    return () => window.clearInterval(timer);
  }, [localId, players]);
  return hint;
}
