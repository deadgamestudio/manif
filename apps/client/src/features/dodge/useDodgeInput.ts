import { net } from "../../shared/net/index.ts";
import { useActions } from "../controls/index.ts";

const DODGE = ["dodge"] as const;

/**
 * Dodge (#9): either Shift by default (#72). The server picks the direction
 * (the held move keys, or the facing when standing still) and enforces the
 * cooldown, so holding the key or mashing it does nothing extra.
 */
export function useDodgeInput() {
  useActions(DODGE, (_, pressed) => {
    if (pressed) net.sendDodge();
  });
}
