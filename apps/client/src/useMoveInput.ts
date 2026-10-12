import { useEffect } from "react";
import { SCREEN_RIGHT, SCREEN_UP } from "./iso.ts";
import { net } from "./net.ts";

const KEYS: Record<string, "up" | "down" | "left" | "right"> = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

/** Maps WASD / arrows to an isometric ground direction and sends it on change. */
export function useMoveInput() {
  useEffect(() => {
    const held = new Set<string>();

    const push = () => {
      const fwd = (held.has("up") ? 1 : 0) - (held.has("down") ? 1 : 0);
      const side = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
      const x = SCREEN_UP.x * fwd + SCREEN_RIGHT.x * side;
      const z = SCREEN_UP.z * fwd + SCREEN_RIGHT.z * side;
      net.sendMove(x, z); // normalized and de-duplicated inside
    };

    const onKey = (pressed: boolean) => (e: KeyboardEvent) => {
      const dir = KEYS[e.code];
      if (!dir) return;
      e.preventDefault();
      if (pressed) held.add(dir);
      else held.delete(dir);
      push();
    };
    const onDown = onKey(true);
    const onUp = onKey(false);
    const onBlur = () => {
      held.clear();
      push();
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
}
