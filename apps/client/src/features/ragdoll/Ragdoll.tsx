import { useEffect, useState, type ReactNode } from "react";
import type { Color, Group, MeshStandardMaterial } from "three";
import { RagdollController, type Hit } from "./controller.ts";
import type { RagdollLook } from "./ragdollVisuals.tsx";
import { SEGMENTS, SEGMENT_COUNT, restLayout, type SegmentId } from "./skeleton.ts";

export interface RagdollRig {
  /**
   * Call once per frame from the avatar's useFrame, after it has moved its
   * root group to (x, z). Returns true while the ragdoll is drawn: hide the
   * normal avatar and skip its tip-over then.
   */
  update(dt: number, lying: boolean, x: number, z: number, yaw: number, hit: Hit | undefined): boolean;
  /** Stop and free the slot (arrested, respawned). Unmounting does it too. */
  reset(): void;
  /** Body colour of the ragdoll (local / other / hurt, a CRS hit flash). */
  setColor(color: Color): void;
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
  const controller = new RagdollController(look.proportions);
  let root: Group | null = null;
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
    update(dt, lying, x, z, yaw, hit) {
      const shown = controller.update(dt, lying, x, z, yaw, hit);
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
    reset() {
      controller.reset();
      if (root) root.visible = false;
    },
    setColor(color) {
      for (let i = 0; i < materials.length; i++) materials[i]?.color.copy(color);
    },
    view,
  };
}
