import { net } from "../../shared/net/index.ts";
import { aimFrom } from "./aim.ts";

/**
 * The attack input while carrying (#8): Space or a click throws the item
 * towards the mouse (along the facing if the mouse never moved over the game
 * view). Returns false when empty-handed, so the caller swings instead.
 */
export function tryThrow(): boolean {
  const id = net.getSnapshot().sessionId;
  const me = id ? net.getPlayer(id) : undefined;
  if (!me || !me.carrying) return false;
  const aim = aimFrom(me.x, me.z);
  net.sendThrow(aim.x, aim.z);
  return true;
}
