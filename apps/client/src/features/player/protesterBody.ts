/*
 * A protester's body from Jordan's models (#28): the skinned copy, the one
 * skin colour, its own materials (for the hurt tint) and an Animator on the
 * shared protester clip libraries. Plus `BodyMotion`, which plays what
 * clipChoice.ts picks, and a registry so a pair animation (a CRS grabbing a
 * protester, through `setPoseOwner`) can reach a body's root and Animator.
 *
 * The same hook draws Moluchan's stand-in body (moluchanVisuals.tsx).
 */
import { useMemo } from "react";
import type { Material, Object3D } from "three";
import { MODELS, applySkin, useAnimator, useClips, useOwnMaterials, useSkinnedModel, type Animator } from "../models/index.ts";
import { SKIN } from "../archetype/index.ts";
import { actionClip, cutsAction, type ClipChoice } from "./clipChoice.ts";

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

/** Off-screen, the mixer only catches up this often (seconds): nobody sees it, but it shouldn't freeze for good. */
const OFFSCREEN_STEP = 0.25;
/** The longest catch-up step, so a body back on screen doesn't jump through half a clip. */
const MAX_STEP = 0.5;

/**
 * Plays one body's clips: the state clip every frame, actions on top until
 * they end or a stronger state cuts them, held poses (KO, knockdown) once,
 * and a get-up after a held pose.
 */
export class BodyMotion {
  private readonly animator: Animator;
  /** The action (one-shot) playing, by name. */
  private action: string | null = null;
  /** The held pose showing, by name. */
  private held: string | null = null;
  private pending = 0;

  constructor(animator: Animator) {
    this.animator = animator;
  }

  /** Start an action now (a swing, a dodge). Ignored while a pose is held (KO). */
  act(choice: ClipChoice): void {
    if (this.held) return;
    if (this.animator.playOnce(choice.name, { timeScale: choice.timeScale, fade: 0.1 })) this.action = choice.name;
  }

  /** Each frame: what the state calls for, at `speed` (m/s, for the get-up giving way to running). */
  drive(state: ClipChoice, speed: number): void {
    if (state.hold) {
      if (this.held !== state.name) {
        this.animator.playOnce(state.name, { hold: true, timeScale: state.timeScale, fade: 0.15 });
        this.held = state.name;
        this.action = null;
      }
      return;
    }
    if (this.held) {
      // Back up from a held pose: the get-up, as an action.
      this.held = null;
      this.act(actionClip("getUp", Infinity));
    }
    if (this.action && this.animator.busy && !cutsAction(state, this.action, speed)) return;
    this.action = null;
    this.animator.play(state.name, { timeScale: state.timeScale });
  }

  /** Forget held poses and actions (respawn): the next `drive` starts clean. */
  reset(): void {
    this.held = null;
    this.action = null;
  }

  /** Advance the mixer; off-screen, only every OFFSCREEN_STEP. */
  tick(dt: number, visible: boolean): void {
    this.pending += dt;
    if (!visible && this.pending < OFFSCREEN_STEP) return;
    this.animator.update(Math.min(this.pending, MAX_STEP));
    this.pending = 0;
  }
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
