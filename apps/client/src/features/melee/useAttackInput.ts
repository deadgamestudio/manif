import { useEffect } from "react";
import { net } from "../../shared/net/index.ts";
import { tryThrow } from "../throwable/index.ts";

/**
 * Swing (#4): a left click on the game view (not on the HUD). Space hops
 * since #45 (features/jump). The server decides what the swing lands on; the
 * facing is the avatar's own (where it last walked). Carrying an item (#8),
 * the click throws it towards the mouse instead. A finger on the screen never swings (#42): the
 * touch controls have their own Taper button, and a stray tap on the street
 * does nothing.
 */
function attack() {
  if (!tryThrow()) net.sendAttack();
}

export function useAttackInput() {
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (e.button === 0 && e.target instanceof HTMLCanvasElement) attack();
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, []);
}
