/**
 * Who drives a character's pose (#28), for animations that move two bodies
 * at once: a CRS seizing a protester by the collar, then dragging them along
 * the ground. Such a pair has to place and animate both bodies together, from
 * the offsets in assets/manif/reports/<batch>/pairs.json.
 *
 * The rule: while `getPoseOwner(id)` is not null, the avatar of `id` (a
 * PlayerAvatar or a CrsAvatar) skips its own clip choice and its own
 * placement (position and yaw) and leaves its body to the owner, which
 * places it and runs its Animator. The avatar keeps drawing everything else
 * (name tag, bars, markers). The owner sets itself when the pair starts and
 * clears itself (`setPoseOwner(id, null)`) when it ends or unmounts.
 *
 * A plain registry, read every frame from useFrame: setting it causes no
 * React render.
 */

/** Who holds the pose: a short label such as `grab:<crsId>`, for debugging. */
export type PoseOwner = string;

const owners = new Map<string, PoseOwner>();

/** Hand the pose of entity `entityId` (a player or CRS id) to `owner`, or give it back with null. */
export function setPoseOwner(entityId: string, owner: PoseOwner | null): void {
  if (owner === null) owners.delete(entityId);
  else owners.set(entityId, owner);
}

/** Who drives the pose of `entityId` now, or null when its own avatar does. */
export function getPoseOwner(entityId: string): PoseOwner | null {
  return owners.get(entityId) ?? null;
}
