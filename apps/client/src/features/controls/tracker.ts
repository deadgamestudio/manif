/**
 * The press/release bookkeeping behind useActions (#72), without the DOM so it
 * can be unit-tested. Acts on each event as it comes, never on sampled state:
 * a key or click pressed and released within one frame still fires.
 */
import { actionFor, mouseBinding, type Action, type Binding, type Keymap } from "./keymap.ts";

/** `MouseEvent.buttons` bit for a `MouseEvent.button`, 0 for anything else. */
const BIT = [1, 4, 2, 8, 16] as const;
const bitOf = (button: number) => BIT[button] ?? 0;

export interface Tracker {
  /** A binding went down. True when it is one of ours (so its browser default should be blocked). */
  press(b: Binding): boolean;
  release(b: Binding): void;
  releaseAll(): void;
  isDown(b: Binding): boolean;
  /**
   * A mouse pointer event: its type, `button` and `buttons`. Presses count only
   * when `pressable` (on the game view, not waiting for a key). Returns the
   * buttons that went down and were ours.
   */
  pointer(type: string, button: number, buttons: number, pressable: boolean): number[];
}

export function createTracker(keymap: () => Keymap, mine: ReadonlySet<Action>, fire: (action: Action, pressed: boolean) => void): Tracker {
  /** Bindings held down, and the action each one pressed. */
  const down = new Map<Binding, Action>();
  const isHeld = (a: Action) => [...down.values()].includes(a);
  /** The mouse buttons last seen held. */
  let mask = 0;

  const t: Tracker = {
    press(b) {
      const action = actionFor(keymap(), b);
      if (!action || !mine.has(action)) return false;
      if (down.has(b)) return true;
      const was = isHeld(action);
      down.set(b, action);
      if (!was) fire(action, true);
      return true;
    },
    release(b) {
      const action = down.get(b);
      if (!action) return;
      down.delete(b);
      if (!isHeld(action)) fire(action, false);
    },
    releaseAll() {
      mask = 0;
      const held = new Set(down.values());
      down.clear();
      for (const a of held) fire(a, false);
    },
    isDown: (b) => down.has(b),
    pointer(type, button, buttons, pressable) {
      // Trust the event's own button over the mask: a pointerdown is that
      // button going down, a pointerup that button coming up, whatever
      // `buttons` says or what we missed in between.
      let next = buttons;
      if (type === "pointerdown") next |= bitOf(button);
      if (type === "pointerup") next &= ~bitOf(button);
      const pressed: number[] = [];
      BIT.forEach((bit, i) => {
        const was = (mask & bit) !== 0;
        const now = (next & bit) !== 0;
        const isThis = button === i;
        const goesDown = (now && !was) || (type === "pointerdown" && isThis);
        const goesUp = (!now && was) || (type === "pointerup" && isThis);
        if (goesDown) {
          // A down for a button we think is still held: its up was lost; count a fresh press.
          if (type === "pointerdown" && isThis) t.release(mouseBinding(i));
          if (pressable && t.press(mouseBinding(i))) pressed.push(i);
        } else if (goesUp) {
          t.release(mouseBinding(i));
        }
      });
      mask = next;
      return pressed;
    },
  };
  return t;
}
