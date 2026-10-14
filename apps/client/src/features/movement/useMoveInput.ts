import { useRef } from "react";
import { SCREEN_RIGHT, SCREEN_UP } from "../../shared/iso/index.ts";
import { net } from "../../shared/net/index.ts";
import { useActions, type Action } from "../controls/index.ts";

const MOVES: readonly Action[] = ["up", "down", "left", "right"];

/**
 * Maps the four move actions (ZQSD and the arrows by default; #72 lets the
 * player rebind them) to an isometric ground direction and sends it on change.
 * The keymap lets go of everything on blur, so the avatar never walks on alone.
 */
export function useMoveInput() {
  const held = useRef(new Set<Action>());
  useActions(MOVES, (action, pressed) => {
    if (pressed) held.current.add(action);
    else held.current.delete(action);
    const h = held.current;
    const fwd = (h.has("up") ? 1 : 0) - (h.has("down") ? 1 : 0);
    const side = (h.has("right") ? 1 : 0) - (h.has("left") ? 1 : 0);
    const x = SCREEN_UP.x * fwd + SCREEN_RIGHT.x * side;
    const z = SCREEN_UP.z * fwd + SCREEN_RIGHT.z * side;
    net.sendMove(x, z); // normalized and de-duplicated inside
  });
}
