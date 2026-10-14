import { useEffect, useEffectEvent } from "react";
import { actionFor, mouseBinding, mouseChanges, type Action, type Binding } from "./keymap.ts";
import { controls } from "./store.ts";

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
    /** Bindings held down, and the action each one pressed. */
    const down = new Map<Binding, Action>();
    const isHeld = (a: Action) => [...down.values()].includes(a);

    /** True when the binding belongs to one of ours (and should not do its browser default). */
    const press = (b: Binding): boolean => {
      const action = actionFor(controls.get(), b);
      if (!action || !mine.has(action)) return false;
      if (down.has(b)) return true;
      const was = isHeld(action);
      down.set(b, action);
      if (!was) fire(action, true);
      return true;
    };
    const release = (b: Binding) => {
      const action = down.get(b);
      if (!action) return;
      down.delete(b);
      if (!isHeld(action)) fire(action, false);
    };
    const releaseAll = () => {
      const held = new Set(down.values());
      down.clear();
      for (const a of held) fire(a, false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (controls.isCapturing() || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      // A repeat of a key we never saw go down (held through a rebind or a focus change): not a new press.
      if (e.repeat && !down.has(e.code)) {
        const action = actionFor(controls.get(), e.code);
        if (action && mine.has(action)) e.preventDefault();
        return;
      }
      if (press(e.code)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => release(e.code);

    let buttons = 0;
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const changes = mouseChanges(buttons, e.buttons);
      buttons = e.buttons;
      for (const { button, down: isDown } of changes) {
        const b = mouseBinding(button);
        if (!isDown) release(b);
        else if (!controls.isCapturing() && e.target instanceof HTMLCanvasElement) {
          // Middle and side buttons: no autoscroll, no "back" (see useMouseGuard for the rest).
          if (press(b) && button !== 0) e.preventDefault();
        }
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") releaseAll();
    };
    const onBlur = () => {
      buttons = 0;
      releaseAll();
    };
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
