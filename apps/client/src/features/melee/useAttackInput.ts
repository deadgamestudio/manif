import { useEffect } from "react";
import { net } from "../../shared/net/index.ts";

/**
 * Swing (#4): Space, or a left click on the game view (not on the HUD). The
 * server decides what the swing lands on; the facing is the avatar's own
 * (where it last walked).
 */
export function useAttackInput() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      if (!e.repeat) net.sendAttack();
    };
    const onPointer = (e: PointerEvent) => {
      if (e.button === 0 && e.target instanceof HTMLCanvasElement) net.sendAttack();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, []);
}
