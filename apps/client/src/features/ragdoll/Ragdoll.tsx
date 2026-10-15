import { useEffect, useState, type ReactNode } from "react";
import type { Color, Group, MeshStandardMaterial, Object3D, Vector3 } from "three";
import { RagdollController, type Hit } from "./controller.ts";
import type { RagdollLook } from "./ragdollVisuals.tsx";
import { S, SEGMENTS, SEGMENT_COUNT, restLayout, type RagdollProportions, type SegmentId } from "./skeleton.ts";
import { RIG_RAGDOLL, SkinnedRagdollBody } from "./skinnedBody.ts";

export interface RagdollRig {
  /**
   * Call once per frame from the avatar's useFrame, after it has moved its
   * root group to (x, z). Returns true while the ragdoll is drawn: hide the
   * normal avatar and skip its tip-over then. `lift` (metres, default 0) is
   * how high the avatar is drawn right now (a hop, #45): a fall starts there.
   */
  update(dt: number, lying: boolean, x: number, z: number, yaw: number, hit: Hit | undefined, lift?: number): boolean;
  /**
   * Drive a skinned body's bones (one of Jordan's characters, on the shared
   * 19-bone rig) instead of the primitive limbs, or go back to them with
   * null. Call it with a fresh copy, still in its rest pose (before its
   * Animator first plays), e.g. from a layout effect when the model arrives.
   * `proportions` defaults to the rig's (RIG_RAGDOLL).
   *
   * With a body bound, `update` returns true only while the ragdoll owns the
   * bones (falling, lying): skip the Animator then, and keep the body drawn
   * (don't tip or hide it). While it gets back up `update` returns false:
   * run the Animator as usual, then call `afterAnimate()`, which blends from
   * the lying pose to the clip's.
   */
  bindBody(body: Object3D | null, proportions?: RagdollProportions): void;
  /** With a skinned body, after its Animator has run this frame: the get-up blend. No-op otherwise. */
  afterAnimate(): void;
  /** Stop and free the slot (arrested, respawned). Unmounting does it too. */
  reset(): void;
  /** Body colour of the ragdoll (local / other / hurt, a CRS hit flash). */
  setColor(color: Color): void;
  /**
   * Where the torso starts (the pelvis), relative to the avatar's root group,
   * written into `out`: for things that ride on the body, like the flames of
   * a burning one (#16). False (and `out` untouched) while the ragdoll is not drawn.
   */
  torso(out: Vector3): boolean;
  /** Put this under the avatar's root group, outside its tilt and yaw groups. */
  view: ReactNode;
}

/**
 * The cosmetic ragdoll (#26) of one avatar: the controller (pure, see
 * controller.ts) plus its primitive limbs. Shares the global slot budget;
 * all per-frame work happens in `update`, with no React state and no allocation.
 */
export function useRagdoll(look: RagdollLook): RagdollRig {
  const [rig] = useState(() => createRig(look));
  useEffect(() => () => rig.reset(), [rig]);
  return rig;
}

function createRig(look: RagdollLook): RagdollRig {
  const primitive = new RagdollController(look.proportions);
  let controller = primitive;
  /** The skinned body bound (#28), and whether its lying pose is saved for the get-up. */
  let skinned: SkinnedRagdollBody | null = null;
  let saved = false;
  let root: Group | null = null;
  // Where the root was on the last drawn frame (the pose is in world space).
  let shown = false;
  let rootX = 0;
  let rootZ = 0;
  const bones: (Group | null)[] = Array.from({ length: SEGMENT_COUNT }, () => null);
  const materials: MeshStandardMaterial[] = [];
  const register = (m: MeshStandardMaterial | null) => {
    if (m && !materials.includes(m)) materials.push(m);
  };
  const rest = restLayout(look.proportions);
  const lengths = SEGMENTS.map((s) => {
    const a = rest[s.from] as number[];
    const b = rest[s.to] as number[];
    return Math.hypot((b[0] as number) - (a[0] as number), (b[1] as number) - (a[1] as number), (b[2] as number) - (a[2] as number));
  });

  const view = (
    <group
      ref={(g) => {
        root = g;
      }}
      visible={false}
    >
      {SEGMENTS.map((s, i) => (
        <group
          key={s.name}
          ref={(g) => {
            bones[i] = g;
          }}
        >
          {look.renderSegment(i as SegmentId, lengths[i] as number, register)}
        </group>
      ))}
    </group>
  );

  return {
    update(dt, lying, x, z, yaw, hit, lift = 0) {
      shown = controller.update(dt, lying, x, z, yaw, hit, lift);
      rootX = x;
      rootZ = z;
      if (skinned) {
        if (root) root.visible = false;
        if (!shown) return false;
        if (controller.gettingUp) {
          // The bones still hold the last lying frame: keep it to blend from.
          if (!saved) skinned.save();
          saved = true;
          return false;
        }
        saved = false;
        skinned.apply(controller.pose);
        return true;
      }
      if (root) {
        root.visible = shown;
        // The pose is in world space; cancel the root group's offset.
        if (shown) root.position.set(-x, 0, -z);
      }
      if (!shown) return false;
      for (let i = 0; i < SEGMENT_COUNT; i++) {
        const g = bones[i];
        const bone = controller.pose[i];
        if (!g || !bone) continue;
        g.position.copy(bone.pos);
        g.quaternion.copy(bone.quat);
      }
      return true;
    },
    torso(out) {
      const bone = controller.pose[S.Torso];
      if (!shown || !bone) return false;
      out.set(bone.pos.x - rootX, bone.pos.y, bone.pos.z - rootZ);
      return true;
    },
    bindBody(body, proportions = RIG_RAGDOLL) {
      controller.reset();
      shown = false;
      saved = false;
      const made = body ? new SkinnedRagdollBody(body, proportions) : null;
      skinned = made?.usable ? made : null;
      controller = skinned ? new RagdollController(proportions) : primitive;
    },
    afterAnimate() {
      if (skinned && saved && controller.gettingUp) skinned.blendFromSaved(controller.getUpAmount);
    },
    reset() {
      shown = false;
      saved = false;
      controller.reset();
      if (root) root.visible = false;
    },
    setColor(color) {
      for (let i = 0; i < materials.length; i++) materials[i]?.color.copy(color);
    },
    view,
  };
}
