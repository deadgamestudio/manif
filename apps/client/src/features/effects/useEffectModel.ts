/**
 * One drawn copy of an effect model (#28): Jordan's flames, smoke, gas and
 * water are small opaque meshes moved by a looping clip of object
 * transforms (the clip has the asset's name). Each copy gets its own nodes
 * and its own mixer, so they can loop out of step; geometry is always
 * shared.
 *
 * Materials, by `materials`:
 * - "shared": the model's own, shared by every copy (flames, water).
 * - "translucent": one see-through version per source material, shared by
 *   every copy that asks for it (smoke). Made once, never per frame; the
 *   first caller's `opacity` sets it.
 * - "own": this copy's see-through materials, to fade it (a gas cloud
 *   running out). Disposed of on unmount.
 *
 * The owner calls `tick(dt)` from its useFrame, and skips it while the
 * effect is hidden, so a hidden effect costs nothing.
 */
import { useEffect, useMemo } from "react";
import { FrontSide, Mesh, type Material, type Object3D } from "three";
import { Animator, bareClipName, cloneStatic, clipsOf, disposeMaterials, useGltf } from "../models/index.ts";

export type EffectMaterials = "shared" | "translucent" | "own";

export interface EffectModel {
  copy: Object3D;
  /** Fade this copy (only with "own" materials; does nothing otherwise). */
  setOpacity: (opacity: number) => void;
  /** Advance the loop by `dt` seconds. */
  tick: (dt: number) => void;
}

/** See-through clones of source materials, keyed by the source, shared by every "translucent" copy. */
const translucent = new WeakMap<Material, Material>();

function seeThrough(m: Material, opacity: number): Material {
  const c = m.clone();
  c.transparent = true;
  c.opacity = opacity;
  c.depthWrite = false;
  // Double-sided puffs drawn see-through show their own insides as dark patches.
  c.side = FrontSide;
  return c;
}

function sharedSeeThrough(m: Material, opacity: number): Material {
  let c = translucent.get(m);
  if (!c) {
    c = seeThrough(m, opacity);
    translucent.set(m, c);
  }
  return c;
}

function eachMesh(root: Object3D, fn: (mesh: Mesh) => void): void {
  root.traverse((o) => {
    if (o instanceof Mesh) fn(o);
  });
}

/**
 * A copy of the effect at `url`, looping its clip, or null while it loads or
 * if it failed (keep the placeholder). Pass null to load nothing yet.
 * `opacity` is the starting opacity of "translucent" and "own" materials.
 */
export function useEffectModel(
  url: string | null,
  { materials = "shared", opacity = 1, timeScale = 1 }: { materials?: EffectMaterials; opacity?: number; timeScale?: number } = {},
): EffectModel | null {
  const gltf = useGltf(url);
  const made = useMemo(() => {
    if (!gltf) return null;
    const copy = cloneStatic(gltf);
    const own = new Map<Material, Material>();
    eachMesh(copy, (mesh) => {
      // Flames and smoke casting shadows look wrong and cost a shadow pass.
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      if (materials === "shared") return;
      const swap = (m: Material) => {
        if (materials === "translucent") return sharedSeeThrough(m, opacity);
        let c = own.get(m);
        if (!c) {
          c = seeThrough(m, opacity);
          own.set(m, c);
        }
        return c;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material as Material);
    });
    const clip = gltf.animations[0];
    const animator = clip ? new Animator(copy, clipsOf(gltf)) : null;
    const owned = [...own.values()];
    return {
      copy,
      materials: owned,
      setOpacity: (o: number) => {
        for (const m of owned) m.opacity = o;
      },
      animator,
      clipName: clip ? bareClipName(clip.name) : "",
    };
  }, [gltf, materials, opacity]);

  useEffect(
    () => () => {
      made?.animator?.dispose();
      if (made) disposeMaterials(made.materials);
    },
    [made],
  );

  return useMemo(() => {
    if (!made) return null;
    const { copy, animator, clipName } = made;
    let started = false;
    return {
      copy,
      setOpacity: made.setOpacity,
      tick: (dt: number) => {
        if (!animator) return;
        animator.play(clipName, { fade: 0, timeScale });
        // Start each copy somewhere in its loop, so two fires never flicker in step.
        animator.update(started ? dt : Math.random() * 2);
        started = true;
      },
    };
  }, [made, timeScale]);
}
