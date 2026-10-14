/**
 * Where the mouse points on the ground (#8), for the throw aim. Set every
 * frame by `AimTracker` once the mouse has moved over the game view; until
 * then there is no aim and a throw goes along the facing. Plain numbers, no
 * three.js: the touch controls reach this through `tryThrow`, and they load
 * before the 3D scene does (#88).
 */
let aimX = 0;
let aimZ = 0;
let hasAim = false;

/** The ground point under the mouse. */
export function setAim(x: number, z: number): void {
  aimX = x;
  aimZ = z;
  hasAim = true;
}

/** Forget the aim (the mouse left the game view). */
export function clearAim(): void {
  hasAim = false;
}

/** The throw direction from (x, z) towards the mouse, unnormalized; zero without an aim (the server then uses the facing). */
export function aimFrom(x: number, z: number): { x: number; z: number } {
  return hasAim ? { x: aimX - x, z: aimZ - z } : { x: 0, z: 0 };
}
