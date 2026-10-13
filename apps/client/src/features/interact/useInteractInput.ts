import { useEffect } from "react";
import { net } from "../../shared/net/index.ts";

/**
 * The interact key, E (#10 rescue; #8 pick-up will use it too). Sent on
 * press and on release: holding it next to a grabbed teammate pulls them free.
 * Losing focus counts as a release, so a rescue never sticks on a key the
 * page no longer sees.
 */
export function useInteractInput() {
  useEffect(() => {
    let held = false;
    const set = (next: boolean) => {
      if (held === next) return;
      held = next;
      net.sendInteract(next);
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== "KeyE") return;
      e.preventDefault();
      set(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === "KeyE") set(false);
    };
    const onBlur = () => set(false);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
      set(false);
    };
  }, []);
}
