import { net } from "../../shared/net/index.ts";
import { aimFrom } from "./aim.ts";

/**
 * The attack input while carrying (#8): Space or a click throws the item
 * towards the mouse (along the facing if the mouse never moved over the game
 * view). Touch controls (#42) pass their own `aim` instead, a ground
 * direction (zero = along the facing). Returns false when empty-handed, so the
 * caller swings instead.
 */
export function tryThrow(aim?: { x: number; z: number }): boolean {
  const id = net.getSnapshot().sessionId;
  const me = id ? net.getPlayer(id) : undefined;
  if (!me || !me.carrying) return false;
  const dir = aim ?? aimFrom(me.x, me.z);
  net.sendThrow(dir.x, dir.z);
  return true;
}
