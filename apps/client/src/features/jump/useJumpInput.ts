import { net } from "../../shared/net/index.ts";
import { useActions } from "../controls/index.ts";

const JUMP = ["jump"] as const;

/**
 * Hop (#45): Space by default (#72). The server enforces the cooldown and the
 * state, so holding the key or mashing it does nothing extra.
 */
export function useJumpInput() {
  useActions(JUMP, (_, pressed) => {
    if (pressed) net.sendJump();
  });
}
