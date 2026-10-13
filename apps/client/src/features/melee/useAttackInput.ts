import { useEffect } from "react";
import { net } from "../../shared/net/index.ts";
import { tryThrow } from "../throwable/index.ts";

/**
 * Swing (#4): Space, or a left click on the game view (not on the HUD). The
 * server decides what the swing lands on; the facing is the avatar's own
 * (where it last walked). Carrying an item (#8), the same keys throw it
 * towards the mouse instead. A finger on the screen never swings (#42): the
 * touch controls have their own Taper button, and a stray tap on the street
 * does nothing.
 */
function attack() {
  if (!tryThrow()) net.sendAttack();
}

export function useAttackInput() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      if (!e.repeat) attack();
    };
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (e.button === 0 && e.target instanceof HTMLCanvasElement) attack();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, []);
}
