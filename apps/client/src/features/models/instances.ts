/**
 * Turning a loaded GLTF into something to draw (#28). The GLTF itself is
 * shared by every user of that URL, so each drawn copy is a clone:
 *
 * - `cloneStatic`: props, scenery, effects. A new node tree that shares the
 *   geometry and the materials with every other copy (cheap, and three.js
 *   keeps one shader program).
 * - `cloneSkinned`: characters. SkeletonUtils.clone, so each copy has its
 *   own bones to animate.
 *
 * Shared materials are a trap: change one copy's colour, opacity or emissive
 * and every bin in the street flashes with it. Before changing a material,
 * call `cloneMaterials(copy)` on that copy, change what it returns, and
 * dispose of those on unmount (`disposeMaterials`).
 *
 * Draw with `<primitive object={copy} dispose={null} />`: dispose={null}
 * stops React Three Fiber from disposing of the shared geometry when that one
 * copy unmounts.
 */
import { useEffect, useMemo } from "react";
import { Box3, Mesh, SkinnedMesh, Vector3, type Material, type Object3D } from "three";
import { clone as cloneWithSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useGltf, type GLTF } from "./loader.ts";

/** A copy of a static model: own nodes, shared geometry and materials. Casts and receives shadows. */
export function cloneStatic(gltf: GLTF): Object3D {
  const copy = gltf.scene.clone(true);
  copy.traverse((o) => {
    if (o instanceof Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return copy;
}

/**
 * A copy of a character: own bones (ready for an Animator), shared geometry
 * and materials. Skinned meshes are never frustum-culled: their bounds are
 * the bind pose, so a body lying down would vanish at the screen's edge.
 */
export function cloneSkinned(gltf: GLTF): Object3D {
  const copy = cloneWithSkeleton(gltf.scene);
  copy.traverse((o) => {
    if (o instanceof Mesh) {
      o.castShadow = true;
      if (o instanceof SkinnedMesh) o.frustumCulled = false;
    }
  });
  return copy;
}

/**
 * Gives this copy its own materials, so changing them touches no other copy.
 * Returns them (each once, even if several meshes shared one). Call it once
 * per copy, then `disposeMaterials` on unmount.
 */
export function cloneMaterials(copy: Object3D): Material[] {
  const made = new Map<Material, Material>();
  const own = (m: Material) => {
    let c = made.get(m);
    if (!c) {
      c = m.clone();
      made.set(m, c);
    }
    return c;
  };
  copy.traverse((o) => {
    if (o instanceof Mesh) o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material as Material);
  });
  return [...made.values()];
}

/** Frees materials made by `cloneMaterials`. The textures stay: they are shared. */
export function disposeMaterials(materials: readonly Material[]): void {
  for (const m of materials) m.dispose();
}

/** A static copy of the model at `url` for this component, or null while it loads (keep the placeholder). */
export function useStaticModel(url: string | null): Object3D | null {
  const gltf = useGltf(url);
  return useMemo(() => (gltf ? cloneStatic(gltf) : null), [gltf]);
}

/** A skinned copy of the model at `url` for this component, or null while it loads (keep the placeholder). */
export function useSkinnedModel(url: string | null): Object3D | null {
  const gltf = useGltf(url);
  return useMemo(() => (gltf ? cloneSkinned(gltf) : null), [gltf]);
}

/**
 * Like `cloneMaterials`, as a hook: the copy's own materials, made once and
 * disposed of on unmount. Empty while the copy is null.
 */
export function useOwnMaterials(copy: Object3D | null): readonly Material[] {
  const materials = useMemo(() => (copy ? cloneMaterials(copy) : []), [copy]);
  useEffect(() => () => disposeMaterials(materials), [materials]);
  return materials;
}

const boundsCache = new WeakMap<GLTF, Box3>();

/** The model's bounds in its own frame, at rest (computed once per GLTF). */
export function modelBounds(gltf: GLTF): Box3 {
  let b = boundsCache.get(gltf);
  if (!b) {
    gltf.scene.updateMatrixWorld(true);
    b = new Box3().setFromObject(gltf.scene);
    boundsCache.set(gltf, b);
  }
  return b;
}

export type Vec3 = [number, number, number];

/**
 * How to stretch a model over a box of `size` (width X, height Y, depth Z,
 * in the model's own frame), standing on y = 0 and centred on x and z.
 * Draw it as
 * `<group scale={fit.scale}><primitive object={copy} position={fit.offset} dispose={null} /></group>`.
 * Most of Jordan's models already match their collision box, so the scale is
 * usually 1 and this only guards against drift.
 */
export function fitToBox(gltf: GLTF, size: Vec3): { scale: Vec3; offset: Vec3 } {
  const b = modelBounds(gltf);
  const s = b.getSize(new Vector3());
  const c = b.getCenter(new Vector3());
  const ratio = (want: number, have: number) => (have > 1e-6 ? want / have : 1);
  return {
    scale: [ratio(size[0], s.x), ratio(size[1], s.y), ratio(size[2], s.z)],
    offset: [-c.x, -b.min.y, -c.z],
  };
}
