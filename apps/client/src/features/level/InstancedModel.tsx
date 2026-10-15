import { useMemo, type ReactNode } from "react";
import { Matrix4, Mesh, Quaternion, Vector3, type BufferGeometry, type InstancedMesh, type Material } from "three";
import { useGltf, type GLTF } from "../models/index.ts";
import type { Placement } from "./scenery.ts";

/*
 * Many copies of one static model as instanced meshes (#28): trees, lamp
 * posts, bollards, road dashes, crosswalks, pavement. One draw call per part
 * of the model, whatever the number of copies. The parts share the model's
 * geometry (its node transforms baked into a copy made once per model) and
 * its materials, which nothing changes.
 */

interface Part {
  geometry: BufferGeometry;
  material: Material | Material[];
}

const partsCache = new WeakMap<GLTF, Part[]>();

/** Each mesh of a model, its transform within the model baked in. Made once per model, kept for the session. */
function partsOf(gltf: GLTF): Part[] {
  let parts = partsCache.get(gltf);
  if (!parts) {
    const list: Part[] = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const geometry = (o.geometry as BufferGeometry).clone();
      geometry.applyMatrix4(o.matrixWorld);
      list.push({ geometry, material: o.material as Material | Material[] });
    });
    parts = list;
    partsCache.set(gltf, parts);
  }
  return parts;
}

const UP = new Vector3(0, 1, 0);

/**
 * A copy of the model at `url` at each placement, its origin at y = `y`;
 * `fallback` until it has loaded, or if it failed. `receiveOnly`: flat
 * ground pieces that take shadows but cast none.
 */
export function InstancedModel({ url, placements, y = 0, fallback = null, receiveOnly = false }: { url: string; placements: readonly Placement[]; y?: number; fallback?: ReactNode; receiveOnly?: boolean }) {
  const gltf = useGltf(url);
  const parts = useMemo(() => (gltf ? partsOf(gltf) : null), [gltf]);
  const matrices = useMemo(() => {
    const q = new Quaternion();
    const one = new Vector3(1, 1, 1);
    return placements.map((p) => new Matrix4().compose(new Vector3(p.x, y, p.z), q.setFromAxisAngle(UP, p.yaw), one));
  }, [placements, y]);
  if (!parts || placements.length === 0) return <>{fallback}</>;
  const fill = (mesh: InstancedMesh | null) => {
    if (!mesh) return;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  };
  return (
    <>
      {parts.map((part, i) => (
        <instancedMesh
          // A new count needs a new mesh.
          key={`${i}:${matrices.length}`}
          ref={fill}
          args={[part.geometry, part.material, matrices.length]}
          castShadow={!receiveOnly}
          receiveShadow
          dispose={null}
        />
      ))}
    </>
  );
}
