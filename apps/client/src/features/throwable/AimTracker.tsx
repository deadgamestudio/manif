import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { clearAim, updateAim } from "./aim.ts";

/**
 * Keeps the throw aim (#8) on the mouse: each frame, the pointer projected on
 * the ground. Recomputed every frame (not only on mouse moves) because the
 * camera follows the player. Mouse and pen only: a finger on the street is
 * not an aim (touch throws along the stick, #42). Mount inside the Canvas.
 */
export function AimTracker() {
  const canvas = useThree((s) => s.gl.domElement);
  const seen = useRef(false);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      seen.current = true;
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      seen.current = false;
      clearAim();
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      clearAim();
    };
  }, [canvas]);

  useFrame(({ pointer, camera }) => {
    if (seen.current) updateAim(pointer, camera);
  });
  return null;
}
