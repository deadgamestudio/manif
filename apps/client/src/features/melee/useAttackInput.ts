import { net } from "../../shared/net/index.ts";
import { tryThrow } from "../throwable/index.ts";
import { useActions } from "../controls/index.ts";

const ATTACK = ["attack"] as const;

/**
 * Swing (#4): a left click on the game view (not on the HUD) by default; #72
 * lets the player put it on a key or another mouse button. Space hops since
 * #45 (features/jump). The server decides what the swing lands on; the facing
 * is the avatar's own (where it last walked). Carrying an item (#8) or a
 * teammate (#11), the press throws it towards the mouse instead. Grabbed by a
 * CRS (#70), each press is a struggle instead (mash to break free), on
 * whatever the attack is bound to. A finger on the screen never swings (#42):
 * the touch controls have their own Taper button, and a stray tap on the
 * street does nothing.
 */
function attack() {
  if (net.isGrabbed()) net.sendStruggle();
  else if (!tryThrow()) net.sendAttack();
}

export function useAttackInput() {
  useActions(ATTACK, (_, pressed) => {
    if (pressed) attack();
  });
}
