/**
 * Is a point near the screen (#28)? For skipping the animation work of
 * characters nobody can see: on a phone the street can hold 8 players and
 * 24 CRS, most of them off-screen. The camera's frustum is computed once per
 * frame, shared by every caller.
 */
import { Frustum, Matrix4, Sphere, type Camera } from "three";

const frustum = new Frustum();
const matrix = new Matrix4();
const sphere = new Sphere();
let stamp = Number.NaN;
let seen: Camera | null = null;

/**
 * True if a sphere of `radius` metres around (x, y, z) is in the camera's
 * view. `frameTime` tells frames apart (pass R3F's `state.clock.elapsedTime`).
 */
export function onScreen(camera: Camera, frameTime: number, x: number, y: number, z: number, radius: number): boolean {
  if (frameTime !== stamp || camera !== seen) {
    stamp = frameTime;
    seen = camera;
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(matrix);
  }
  sphere.center.set(x, y, z);
  sphere.radius = radius;
  return frustum.intersectsSphere(sphere);
}
