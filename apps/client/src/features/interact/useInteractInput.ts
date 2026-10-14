import { net } from "../../shared/net/index.ts";
import { useActions } from "../controls/index.ts";

const INTERACT = ["interact"] as const;

/**
 * The interact key, E by default (#10 rescue, #8 pick-up, #72 rebinding). Sent
 * on press and on release: holding it next to a grabbed teammate pulls them
 * free; otherwise a press picks up the nearest item (pavé, tomate, crotte,
 * trottinette). The keymap lets go on blur, on a rebind and on unmount, so a
 * rescue never sticks on a key the page no longer sees.
 */
export function useInteractInput() {
  useActions(INTERACT, (_, pressed) => net.sendInteract(pressed));
}
