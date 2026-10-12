import { useEffect } from "react";
import { net } from "../../shared/net/index.ts";

/**
 * Dodge (#9): Shift (either one). The server picks the direction (the held
 * move keys, or the facing when standing still) and enforces the cooldown,
 * so holding the key or mashing it does nothing extra.
 */
export function useDodgeInput() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "ShiftLeft" && e.code !== "ShiftRight") return;
      e.preventDefault();
      if (!e.repeat) net.sendDodge();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
