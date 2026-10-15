/*
 * A protester's body from Jordan's models (#28): the skinned copy, the one
 * skin colour, its own materials (for the hurt tint) and an Animator on the
 * shared protester clip libraries (bodyMotion.ts plays them). Plus a registry
 * so a pair animation (a CRS grabbing a protester, through `setPoseOwner`)
 * can reach a body's root and Animator.
 *
 * The same hook draws Moluchan's stand-in body (moluchanVisuals.tsx).
 */
import { useMemo } from "react";
import type { Material, Object3D } from "three";
import { MODELS, applySkin, useAnimator, useClips, useOwnMaterials, useSkinnedModel, type Animator } from "../models/index.ts";
import { SKIN } from "../archetype/index.ts";

/** Every protester body plays these (one rig): the v03 core clips, then v04's extras. */
const PROTESTER_CLIPS = [MODELS.clipLibraries.protesterCore, MODELS.clipLibraries.protesterExtra];

export interface ProtesterBody {
  /** The skinned copy to draw: feet at its origin, facing +Z. */
  root: Object3D;
  animator: Animator;
  /** Its own materials (skin already painted): tint them freely. */
  materials: readonly Material[];
}

const painted = new WeakSet<Object3D>();

/**
 * The body at `url`, ready to draw and animate, or null while the model or
 * the clips load (or if they failed): keep the placeholder then.
 */
export function useProtesterBody(url: string | null): ProtesterBody | null {
  const copy = useSkinnedModel(url);
  // Paint the skin before taking own materials, so the clones keep it. Once per copy (StrictMode runs memos twice).
  const skinned = useMemo(() => {
    if (copy && !painted.has(copy)) {
      applySkin(copy, SKIN);
      painted.add(copy);
    }
    return copy;
  }, [copy]);
  const materials = useOwnMaterials(skinned);
  const clips = useClips(PROTESTER_CLIPS);
  const animator = useAnimator(skinned, clips);
  return useMemo(() => (skinned && animator ? { root: skinned, animator, materials } : null), [skinned, animator, materials]);
}

/** What a pair animation needs of an avatar whose pose it takes over (see models/poseOwner.ts). */
export interface AvatarBody {
  /** The avatar's root group, placed in the world: set its position and the body's yaw through it. */
  root: Object3D;
  /** The skinned body inside it. */
  body: Object3D;
  animator: Animator;
}

const bodies = new Map<string, AvatarBody>();

/** Registered by PlayerAvatar while its model is drawn. */
export function setAvatarBody(id: string, body: AvatarBody | null): void {
  if (body) bodies.set(id, body);
  else bodies.delete(id);
}

/** The drawn body of player (or disguised BAC) `id`, if its model is in. */
export function getAvatarBody(id: string): AvatarBody | null {
  return bodies.get(id) ?? null;
}
