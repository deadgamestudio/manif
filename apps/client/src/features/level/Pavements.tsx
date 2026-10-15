import { useMemo } from "react";
import type { Level, Rect } from "@manif/shared";
import { BoxGeometry, Matrix4, MeshStandardMaterial, PlaneGeometry, Quaternion, Vector3, type BufferGeometry, type InstancedMesh, type Material } from "three";
import { kerbLayout } from "./scenery.ts";

/*
 * The pavement along the facades and its edge (#102): from the iso camera the
 * edge of the road must read at a glance. A pale, slightly warm pavement (a
 * Paris pavement, not the asphalt's blue-grey), a light granite kerb on its
 * street edge, and a dark gutter line on the road against it, which reads as
 * the kerb's step and shadow. Three instanced meshes, one draw call each.
 *
 * Heights: everything stays under the player rings (y 0.03) and over the
 * crosswalk stripes (top at 0.01), which the pavement covers past the kerb.
 * The steps between the layers are a few millimetres: far more than the
 * orthographic camera's depth precision, so nothing flickers.
 */

/** Pale grey-beige, lighter and warmer than the asphalt. */
export const PAVEMENT_COLOR = "#b9b09e";
const KERB_COLOR = "#f0ece3";
const GUTTER_COLOR = "#44484f";

const PAVEMENT_Y = 0.012;
const KERB_TOP = 0.022;
const GUTTER_Y = 0.006;

// Shared for the session: the level is drawn once.
const FLAT = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
/** A unit box standing on y = 0. */
const BLOCK = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const PAVEMENT = new MeshStandardMaterial({ color: PAVEMENT_COLOR, roughness: 0.95 });
const KERB = new MeshStandardMaterial({ color: KERB_COLOR, roughness: 0.8 });
const GUTTER = new MeshStandardMaterial({ color: GUTTER_COLOR, roughness: 1 });

export function Pavements({ level }: { level: Level }) {
  const layout = useMemo(() => kerbLayout(level), [level]);
  return (
    <>
      <RectInstances rects={layout.pavements} geometry={FLAT} material={PAVEMENT} y={PAVEMENT_Y} />
      {/* The kerb stands from just under the asphalt to just over the pavement. */}
      <RectInstances rects={layout.kerbs} geometry={BLOCK} material={KERB} y={-0.01} height={KERB_TOP + 0.01} />
      <RectInstances rects={layout.gutters} geometry={FLAT} material={GUTTER} y={GUTTER_Y} />
    </>
  );
}

/** One instance of `geometry` (1 × 1 on the ground) stretched over each rectangle, at height `y`. */
function RectInstances({ rects, geometry, material, y, height = 1 }: { rects: readonly Rect[]; geometry: BufferGeometry; material: Material; y: number; height?: number }) {
  const matrices = useMemo(() => {
    const q = new Quaternion();
    return rects.map((r) =>
      new Matrix4().compose(new Vector3((r.minX + r.maxX) / 2, y, (r.minZ + r.maxZ) / 2), q, new Vector3(r.maxX - r.minX, height, r.maxZ - r.minZ)),
    );
  }, [rects, y, height]);
  if (matrices.length === 0) return null;
  const fill = (mesh: InstancedMesh | null) => {
    if (!mesh) return;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  };
  // A new count needs a new mesh.
  return <instancedMesh key={matrices.length} ref={fill} args={[geometry, material, matrices.length]} receiveShadow dispose={null} />;
}
