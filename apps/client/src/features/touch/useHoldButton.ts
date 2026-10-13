import { useCallback, useRef, useState, type PointerEvent } from "react";
import { useReleaseOnHide } from "./useReleaseOnHide.ts";

/**
 * A touch button pressed by one finger at a time (#42). It follows its own
 * pointerId and captures it, so the stick's finger never presses or releases
 * it. `onPress` and `onRelease` must be stable. The release fires once per
 * press: on lift, on pointercancel, on a lost capture, and on blur / hide /
 * unmount.
 */
export function useHoldButton(onPress: () => void, onRelease?: () => void) {
  const pointer = useRef<number | null>(null);
  const [held, setHeld] = useState(false);

  const release = useCallback(() => {
    if (pointer.current === null) return;
    pointer.current = null;
    setHeld(false);
    onRelease?.();
  }, [onRelease]);
  useReleaseOnHide(release);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      // No synthetic mouse events, no focus, no text selection after a tap.
      e.preventDefault();
      if (pointer.current !== null) return;
      pointer.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      setHeld(true);
      onPress();
    },
    [onPress],
  );
  const onPointerEnd = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (e.pointerId === pointer.current) release();
    },
    [release],
  );

  return {
    held,
    handlers: {
      onPointerDown,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onLostPointerCapture: onPointerEnd,
    },
  };
}
