import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { clearAim, updateAim } from "./aim.ts";

/**
 * Keeps the throw aim (#8) on the mouse: each frame, the pointer projected on
 * the ground. Recomputed every frame (not only on mouse moves) because the
 * camera follows the player. Mount inside the Canvas.
 */
export function AimTracker() {
  const canvas = useThree((s) => s.gl.domElement);
  const seen = useRef(false);

  useEffect(() => {
    const onMove = () => {
      seen.current = true;
    };
    const onLeave = () => {
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
