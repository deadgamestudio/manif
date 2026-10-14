import { useEffect, useEffectEvent } from "react";
import { actionFor, type Action } from "./keymap.ts";
import { controls } from "./store.ts";
import { createTracker } from "./tracker.ts";

/** Typing in a field (the name, the code) never triggers an action. */
export function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLTextAreaElement) return !target.readOnly;
  return target instanceof HTMLInputElement && !target.readOnly && target.type !== "range" && target.type !== "checkbox";
}

/**
 * Calls `handler(action, true)` when one of `actions` goes down and
 * `handler(action, false)` when it is let go, whatever key or mouse button the
 * player bound to it (#72). With two bindings on one action, it is down while
 * either is held.
 *
 * In one place for every input: keys are matched by `code` and their default
 * cancelled (Space doesn't scroll, a bound Tab doesn't move focus; an unbound
 * Tab behaves normally); nothing fires while typing in a field, with Ctrl,
 * Alt or Cmd held, or while the "Touches" panel waits for a key; a mouse
 * button counts only on the game view (the canvas), never on the HUD, and a
 * finger never counts (touch has its own buttons). Losing focus, going to the
 * background, a rebind or unmounting lets go of everything held, so no action
 * sticks "on".
 */
export function useActions(actions: readonly Action[], handler: (action: Action, pressed: boolean) => void) {
  const fire = useEffectEvent((action: Action, pressed: boolean) => handler(action, pressed));
  const wanted = actions.join(",");

  useEffect(() => {
    const mine = new Set(wanted.split(",") as Action[]);
    const tracker = createTracker(controls.get, mine, (action, pressed) => fire(action, pressed));
    const releaseAll = () => tracker.releaseAll();

    const onKeyDown = (e: KeyboardEvent) => {
      if (controls.isCapturing() || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      // A repeat of a key we never saw go down (held through a rebind or a focus change): not a new press.
      if (e.repeat && !tracker.isDown(e.code)) {
        const action = actionFor(controls.get(), e.code);
        if (action && mine.has(action)) e.preventDefault();
        return;
      }
      if (tracker.press(e.code)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => tracker.release(e.code);

    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const pressable = !controls.isCapturing() && e.target instanceof HTMLCanvasElement;
      const pressed = tracker.pointer(e.type, e.button, e.buttons, pressable);
      // Middle and side buttons: no autoscroll, no "back" (see useMouseGuard for the rest).
      if (pressed.some((button) => button !== 0)) e.preventDefault();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") releaseAll();
    };
    const onBlur = releaseAll;
    const unsubscribe = controls.subscribe(releaseAll);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("pointermove", onPointer);
    window.addEventListener("pointerup", onPointer);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerup", onPointer);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
      releaseAll();
    };
  }, [wanted]);
}

/**
 * While the street is up: the mouse's side buttons don't navigate back or
 * forward (that would leave the march), and a right click on the game view
 * opens no menu, so any mouse button can be bound (#72).
 */
export function useMouseGuard() {
  useEffect(() => {
    const onSide = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) e.preventDefault();
    };
    const onMenu = (e: MouseEvent) => {
      if (e.target instanceof HTMLCanvasElement) e.preventDefault();
    };
    window.addEventListener("mouseup", onSide);
    window.addEventListener("mousedown", onSide);
    window.addEventListener("auxclick", onSide);
    window.addEventListener("contextmenu", onMenu);
    return () => {
      window.removeEventListener("mouseup", onSide);
      window.removeEventListener("mousedown", onSide);
      window.removeEventListener("auxclick", onSide);
      window.removeEventListener("contextmenu", onMenu);
    };
  }, []);
}
