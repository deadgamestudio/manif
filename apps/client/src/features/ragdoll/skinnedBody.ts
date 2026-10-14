/*
 * The ragdoll on a skinned body (#26, #28): copies the ragdoll's bone
 * transforms (pose.ts) onto the bones of one of Jordan's characters, instead
 * of placing primitive limbs.
 *
 * Every character shares one 19-bone rig (assets/manif/README.md): hips at the
 * root, spine, neck, head, arms, legs, hand and overhead sockets. The ragdoll
 * has 10 segments; each drives one bone (the torso the hips, the head the
 * neck, the limbs their bone), and every other bone keeps its own local pose,
 * so the spine, hands and feet ride along.
 *
 * Both skeletons have their bone's +Y along the limb, but their rolls and rest
 * angles differ (the rig's arms hang a little outwards). So at bind time we
 * keep, per bone, the rotation from its ragdoll segment's rest frame to the
 * bone's rest frame, and apply the same one on top of the live segment.
 *
 * Plain three.js maths, no React, allocation-free per frame. A body that
 * lacks a bone simply leaves that bone out.
 */
import { Matrix4, Quaternion, Vector3, type Bone, type Object3D } from "three";
import { createPose, poseFromParticles, type Pose } from "./pose.ts";
import { P, S, restLayout, type RagdollProportions, type SegmentId } from "./skeleton.ts";

/** Which bone each ragdoll segment drives, parents before children. */
export const SEGMENT_BONES: readonly (readonly [SegmentId, string])[] = [
  [S.Torso, "hips"],
  [S.Head, "neck"],
  [S.LUpperArm, "upper_arm_L"],
  [S.LForearm, "forearm_L"],
  [S.RUpperArm, "upper_arm_R"],
  [S.RForearm, "forearm_R"],
  [S.LThigh, "thigh_L"],
  [S.LShin, "shin_L"],
  [S.RThigh, "thigh_R"],
  [S.RShin, "shin_R"],
];

/**
 * Ragdoll proportions that match Jordan's rig (about 1.7 m, slim), so the
 * lying body touches the ground instead of floating on the fat placeholder
 * torso. The joint heights are fixed fractions of `height` (skeleton.ts);
 * 1.95 puts the ragdoll's pelvis, hips and shoulders at the rig's.
 */
export const RIG_RAGDOLL: RagdollProportions = {
  height: 1.95,
  leftShoulderX: 0.2,
  rightShoulderX: 0.2,
  hipX: 0.1,
  torsoRadius: 0.16,
  headRadius: 0.13,
  limbRadius: 0.07,
};

interface Driven {
  bone: Object3D;
  segment: SegmentId;
  /** Segment rest rotation → bone rest rotation, both in the model's frame. */
  offset: Quaternion;
}

const pq = new Quaternion();
const wq = new Quaternion();
const tmpQ = new Quaternion();
const tmpV = new Vector3();
const scratchM = new Matrix4();

/** A bone's rotation in `root`'s frame, from the local rotations along the way. */
function rotationIn(root: Object3D, node: Object3D, out: Quaternion): Quaternion {
  out.identity();
  for (let n: Object3D | null = node; n && n !== root; n = n.parent) out.premultiply(n.quaternion);
  return out;
}

/** Its position in `root`'s frame. */
function positionIn(root: Object3D, node: Object3D, out: Vector3): Vector3 {
  out.set(0, 0, 0);
  for (let n: Object3D | null = node; n && n !== root; n = n.parent) {
    n.updateMatrix();
    out.applyMatrix4(n.matrix);
  }
  return out;
}

/**
 * One skinned body, bound to the ragdoll. Make it while the body is still in
 * its rest pose (before its Animator first plays), since the rest is read off
 * the bones then.
 */
export class SkinnedRagdollBody {
  readonly root: Object3D;
  private readonly driven: Driven[] = [];
  private readonly hips: Object3D | null;
  /** From the pelvis to the hips bone, in the torso segment's rest frame. */
  private readonly hipsOffset = new Vector3();
  /** Every bone's local rotation and the hips' position, saved to blend the get-up from. */
  private readonly bones: Object3D[] = [];
  private readonly saved: Quaternion[] = [];
  private readonly savedHips = new Vector3();
  /** World rotation of each driven bone this frame, by its index in `driven`. */
  private readonly world: Quaternion[] = [];

  constructor(root: Object3D, proportions: RagdollProportions = RIG_RAGDOLL) {
    this.root = root;
    root.updateMatrix();
    const restPose = createPose();
    const rest = restLayout(proportions);
    poseFromParticles(rest.flat(), restPose);
    for (const [segment, name] of SEGMENT_BONES) {
      const bone = root.getObjectByName(name);
      const seg = restPose[segment];
      if (!bone || !seg) continue;
      const boneRest = rotationIn(root, bone, new Quaternion());
      this.driven.push({ bone, segment, offset: seg.quat.clone().invert().multiply(boneRest) });
      this.world.push(new Quaternion());
    }
    this.hips = root.getObjectByName("hips") ?? null;
    const torso = restPose[S.Torso];
    if (this.hips && torso) {
      const pelvis = rest[P.Pelvis] as number[];
      positionIn(root, this.hips, this.hipsOffset).sub(tmpV.set(pelvis[0] ?? 0, pelvis[1] ?? 0, pelvis[2] ?? 0));
      this.hipsOffset.applyQuaternion(tmpQ.copy(torso.quat).invert());
    }
    root.traverse((o) => {
      if ((o as Bone).isBone) {
        this.bones.push(o);
        this.saved.push(o.quaternion.clone());
      }
    });
  }

  /** True if the rig had the bones this needs. */
  get usable(): boolean {
    return this.hips !== null && this.driven.length > 0;
  }

  /** Poses the bones on the ragdoll's world bone transforms. */
  apply(pose: Pose): void {
    const hips = this.hips;
    if (!hips?.parent) return;
    // Parents' world matrices as drawn this frame (the avatar has just moved its groups).
    hips.parent.updateWorldMatrix(true, false);
    const torso = pose[S.Torso];
    if (torso) {
      tmpV.copy(this.hipsOffset).applyQuaternion(torso.quat).add(torso.pos);
      hips.position.copy(hips.parent.worldToLocal(tmpV));
    }
    for (let i = 0; i < this.driven.length; i++) {
      const d = this.driven[i] as Driven;
      const seg = pose[d.segment];
      const out = this.world[i] as Quaternion;
      if (!seg) continue;
      out.copy(seg.quat).multiply(d.offset);
      this.parentWorld(d.bone, i, pq);
      d.bone.quaternion.copy(pq.invert().multiply(out));
    }
  }

  /** Remember the pose drawn now (the last ragdoll frame), to blend the get-up from. */
  save(): void {
    for (let i = 0; i < this.bones.length; i++) (this.saved[i] as Quaternion).copy((this.bones[i] as Object3D).quaternion);
    if (this.hips) this.savedHips.copy(this.hips.position);
  }

  /**
   * Blends from the saved pose to the pose on the bones now (what the
   * Animator has just written): `t` 0 is all saved, 1 all animated.
   */
  blendFromSaved(t: number): void {
    const k = Math.min(1, Math.max(0, t));
    for (let i = 0; i < this.bones.length; i++) {
      const b = this.bones[i] as Object3D;
      b.quaternion.slerpQuaternions(this.saved[i] as Quaternion, tmpQ.copy(b.quaternion), k);
    }
    if (this.hips) this.hips.position.lerpVectors(this.savedHips, tmpV.copy(this.hips.position), k);
  }

  /**
   * World rotation of `bone`'s parent: from the driven bone above it (this
   * frame's value) and the local rotations in between, or the scene graph.
   */
  private parentWorld(bone: Object3D, upTo: number, out: Quaternion): Quaternion {
    out.identity();
    for (let n = bone.parent; n; n = n.parent) {
      for (let j = 0; j < upTo; j++) {
        if (this.driven[j]?.bone === n) return out.premultiply(this.world[j] as Quaternion);
      }
      if (n === this.hips?.parent || !n.parent) {
        n.updateWorldMatrix(true, false);
        scratchM.extractRotation(n.matrixWorld);
        return out.premultiply(wq.setFromRotationMatrix(scratchM));
      }
      out.premultiply(n.quaternion);
    }
    return out;
  }
}
