import { useEffect } from "react";
import { net } from "../../shared/net/index.ts";

/**
 * Hop (#45): Space. The server enforces the cooldown and the state, so
 * holding the key or mashing it does nothing extra.
 */
export function useJumpInput() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      if (!e.repeat) net.sendJump();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
