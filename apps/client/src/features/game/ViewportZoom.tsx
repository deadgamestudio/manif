import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import { cameraZoom } from "../../shared/iso/index.ts";

/**
 * Sets the camera's zoom from the size of the game view (#107), so a phone
 * zooms out to show about as much street as a desktop. Again on every resize
 * and rotation: R3F's `size` changes then. Mount inside the Canvas.
 */
export function ViewportZoom() {
  // The store's getter, not the camera itself: the camera is only read inside the effect.
  const get = useThree((s) => s.get);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  useLayoutEffect(() => {
    const { camera } = get();
    camera.zoom = cameraZoom(width, height);
    camera.updateProjectionMatrix();
  }, [get, width, height]);
  return null;
}
