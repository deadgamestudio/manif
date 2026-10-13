import { Plane, Raycaster, Vector2, Vector3, type Camera } from "three";

/**
 * Where the mouse points on the ground (#8), for the throw aim. Updated every
 * frame by `AimTracker` once the mouse has moved over the game view; until
 * then there is no aim and a throw goes along the facing.
 */
const ground = new Plane(new Vector3(0, 1, 0), 0);
const raycaster = new Raycaster();
const hit = new Vector3();
let aimX = 0;
let aimZ = 0;
let hasAim = false;

/** Project the pointer (normalized device coordinates) onto the ground plane. */
export function updateAim(pointer: Vector2, camera: Camera): void {
  raycaster.setFromCamera(pointer, camera);
  if (raycaster.ray.intersectPlane(ground, hit)) {
    aimX = hit.x;
    aimZ = hit.z;
    hasAim = true;
  }
}

/** Forget the aim (the mouse left the game view). */
export function clearAim(): void {
  hasAim = false;
}

/** The throw direction from (x, z) towards the mouse, unnormalized; zero without an aim (the server then uses the facing). */
export function aimFrom(x: number, z: number): { x: number; z: number } {
  return hasAim ? { x: aimX - x, z: aimZ - z } : { x: 0, z: 0 };
}
