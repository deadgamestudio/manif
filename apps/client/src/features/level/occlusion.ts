/*
 * Which boxes stand between the camera and the characters that matter (#80).
 * Pure and cheap: a segment against axis-aligned box footprints in the ground
 * plane, plus the box height. No three.js raycaster, no scene graph.
 */

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** An axis-aligned box standing on the ground, from y = 0 to y = height. */
export interface OccluderBox {
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  height: number;
}

/**
 * The camera as the occlusion test needs it. `direction` is where it looks
 * (normalised). With `orthographic`, rays are parallel to `direction`, so a
 * character's line of sight goes straight back along it rather than to
 * `position`; with a perspective camera (a future third-person view, #20) it
 * goes to `position`.
 */
export interface OcclusionCamera {
  position: Point3;
  direction: Point3;
  orthographic: boolean;
}

/**
 * Where a line of sight from `target` back to the camera ends: the camera
 * itself for a perspective camera, or for an orthographic one the point on the
 * camera's plane straight back along the view direction.
 */
export function eyeFor(target: Point3, cam: OcclusionCamera): Point3 {
  if (!cam.orthographic) return cam.position;
  const d = cam.direction;
  const depth = (target.x - cam.position.x) * d.x + (target.y - cam.position.y) * d.y + (target.z - cam.position.z) * d.z;
  return { x: target.x - d.x * depth, y: target.y - d.y * depth, z: target.z - d.z * depth };
}

/**
 * Whether the segment from `from` to `to` passes through the box. Slab test on
 * the footprint gives the stretch [t0, t1] of the segment above it; y is
 * linear along the segment, so it is lowest at one end of that stretch.
 * Touching a face counts as outside, so a character standing against a wall
 * does not fade it.
 */
export function segmentHitsBox(from: Point3, to: Point3, box: OccluderBox): boolean {
  let t0 = 0;
  let t1 = 1;
  const axes: [number, number, number, number][] = [
    [from.x, to.x - from.x, box.x - box.halfX, box.x + box.halfX],
    [from.z, to.z - from.z, box.z - box.halfZ, box.z + box.halfZ],
  ];
  for (const [p, d, min, max] of axes) {
    if (d === 0) {
      if (p <= min || p >= max) return false;
      continue;
    }
    let a = (min - p) / d;
    let b = (max - p) / d;
    if (a > b) [a, b] = [b, a];
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 >= t1) return false;
  }
  const y0 = from.y + (to.y - from.y) * t0;
  const y1 = from.y + (to.y - from.y) * t1;
  return Math.min(y0, y1) < box.height && Math.max(y0, y1) > 0;
}

/**
 * Indices of the boxes that hide at least one target from the camera. Works
 * from any list of boxes, so a target inside a box (a room behind a facade,
 * #84) counts as hidden by it too. Writes into `out` to spare garbage when
 * called a few times a second.
 */
export function findOccluders(
  boxes: readonly OccluderBox[],
  targets: readonly Point3[],
  cam: OcclusionCamera,
  out: Set<number> = new Set(),
): Set<number> {
  out.clear();
  for (const target of targets) {
    const eye = eyeFor(target, cam);
    for (let i = 0; i < boxes.length; i++) {
      if (out.has(i)) continue;
      if (segmentHitsBox(target, eye, boxes[i]!)) out.add(i);
    }
  }
  return out;
}
