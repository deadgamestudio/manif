/*
 * The drawn police bodies (#28), so a grab pair (features/grab) can take one
 * over through `setPoseOwner`, like `getAvatarBody` for the protesters.
 */
import type { Object3D } from "three";

const bodies = new Map<string, Object3D>();

/** Registered by policeModels.tsx (FootModel) while Jordan's body on foot is drawn and animated. */
export function setCrsBody(id: string, body: Object3D | null): void {
  if (body) bodies.set(id, body);
  else bodies.delete(id);
}

/** The skinned body of bot `id`, inside its avatar's yaw group, if its model on foot is in. */
export function getCrsBody(id: string): Object3D | null {
  return bodies.get(id) ?? null;
}

const muzzles = new Map<string, Object3D>();

/** Registered by policeModels.tsx while an LBD's model holds its launcher model: the `muzzle` node, for the laser. */
export function setLbdMuzzle(id: string, muzzle: Object3D | null): void {
  if (muzzle) muzzles.set(id, muzzle);
  else muzzles.delete(id);
}

/** The muzzle of LBD `id`'s launcher model, if it is drawn (else the toy launcher is, see LBD_MUZZLE). */
export function getLbdMuzzle(id: string): Object3D | null {
  return muzzles.get(id) ?? null;
}
