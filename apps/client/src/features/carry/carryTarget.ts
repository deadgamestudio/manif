import {
  PICKUP_RANGE,
  PLAYER_RADIUS,
  PlayerStatus,
  ThrowableKind,
  nearestItem,
  pickCarryTarget,
  pickFireAction,
  pickInteract,
  type BurningView,
  type CarrySubject,
} from "@manif/shared";
import { net, type LobbyPlayer } from "../../shared/net/index.ts";
import { rescueTarget } from "../rescue/index.ts";

/** Player `id` as the carry rules see them (#11), from the live state. */
function subject(id: string): CarrySubject | null {
  const p = net.getPlayer(id);
  if (!p) return null;
  return {
    id,
    x: p.x,
    z: p.z,
    status: p.status,
    down: p.down,
    onFire: p.onFire,
    item: p.carrying,
    carried: p.carriedBy !== "",
    carrying: net.getCarried(id) !== null,
  };
}

/** The nearest item an empty-handed `me` could pick up (#8), or null. */
function itemFor(me: CarrySubject): string | null {
  if (me.item !== ThrowableKind.None) return null;
  const items: [string, { x: number; z: number }][] = [];
  for (const id of net.getItemIds()) {
    const item = net.getItem(id);
    if (item) items.push([id, item]);
  }
  return nearestItem(me, items, PICKUP_RANGE);
}

/**
 * The teammate an interact press would pick up right now (#11), or null,
 * with the server's own priority (`pickInteract`): a rescue, a burning
 * teammate to pat out or an item comes first; lighting a prop comes after,
 * so it need not be looked at.
 */
export function carryTargetFor(localId: string, players: readonly LobbyPlayer[]): string | null {
  const me = subject(localId);
  if (!me || me.status !== PlayerStatus.Free || me.down) return null;
  const others: CarrySubject[] = [];
  const burning: BurningView[] = [];
  for (const p of players) {
    const s = subject(p.id);
    if (!s) continue;
    others.push(s);
    if (s.onFire) burning.push({ id: s.id, x: s.x, z: s.z, onFire: true });
  }
  const choice = pickInteract({
    carryingTeammate: me.carrying,
    rescue: rescueTarget(localId, players),
    fire: pickFireAction(me, PLAYER_RADIUS, burning, []),
    teammate: pickCarryTarget(me, others),
    item: itemFor(me),
  });
  return choice?.kind === "carry" ? choice.target : null;
}
