import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Plane, Raycaster, Vector3 } from "three";
import { clearAim, setAim } from "./aim.ts";

const ground = new Plane(new Vector3(0, 1, 0), 0);
const raycaster = new Raycaster();
const hit = new Vector3();

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
    if (!seen.current) return;
    // Project the pointer onto the ground plane.
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(ground, hit)) setAim(hit.x, hit.z);
  });
  return null;
}
