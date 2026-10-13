/*
 * Bone transforms from particle positions, and the get-up blend (#26).
 *
 * A pose is one world transform per segment (skeleton.ts SEGMENTS): position
 * at the parent joint, and a rotation whose local +Y points at the child
 * joint and whose local +X is the body's left (from the shoulders or the
 * hips), so the roll is stable instead of spinning around the bone. Today
 * the primitive limbs in ragdollVisuals.tsx are placed with it; a skinned
 * model would copy the same transforms onto its bones.
 *
 * Plain three.js maths, allocation-free after creation.
 */
import { Matrix4, Quaternion, Vector3 } from "three";
import { P, SEGMENTS, SEGMENT_COUNT } from "./skeleton.ts";

export interface Bone {
  /** World position of the parent joint. */
  pos: Vector3;
  /** World rotation: +Y towards the child joint, +X the body's left. */
  quat: Quaternion;
}
export type Pose = Bone[];

export function createPose(): Pose {
  return Array.from({ length: SEGMENT_COUNT }, () => ({ pos: new Vector3(), quat: new Quaternion() }));
}

const dir = new Vector3();
const side = new Vector3();
const fwd = new Vector3();
const basis = new Matrix4();
const tmp = new Vector3();

function read(pos: ArrayLike<number>, i: number, out: Vector3): Vector3 {
  return out.set(pos[i * 3] as number, pos[i * 3 + 1] as number, pos[i * 3 + 2] as number);
}

/** Fills `out` with the bone transforms of particle positions `pos` (xyz interleaved). */
export function poseFromParticles(pos: ArrayLike<number>, out: Pose): void {
  for (let s = 0; s < SEGMENT_COUNT; s++) {
    const def = SEGMENTS[s];
    const bone = out[s];
    if (!def || !bone) continue;
    read(pos, def.from, bone.pos);
    read(pos, def.to, dir).sub(bone.pos);
    if (dir.lengthSq() < 1e-10) dir.set(0, 1, 0);
    dir.normalize();
    // Left axis from the joint pair, made perpendicular to the bone.
    if (def.side === "shoulders") read(pos, P.LShoulder, side).sub(read(pos, P.RShoulder, tmp));
    else read(pos, P.LHip, side).sub(read(pos, P.RHip, tmp));
    side.addScaledVector(dir, -side.dot(dir));
    if (side.lengthSq() < 1e-8) {
      // Bone along the shoulder line: any perpendicular will do.
      side.set(dir.y, -dir.x, 0);
      if (side.lengthSq() < 1e-8) side.set(0, dir.z, -dir.y);
    }
    side.normalize();
    fwd.crossVectors(side, dir);
    basis.makeBasis(side, dir, fwd);
    bone.quat.setFromRotationMatrix(basis);
  }
}

/** Copies a pose. */
export function copyPose(from: Pose, out: Pose): void {
  for (let s = 0; s < SEGMENT_COUNT; s++) {
    const a = from[s];
    const o = out[s];
    if (!a || !o) continue;
    o.pos.copy(a.pos);
    o.quat.copy(a.quat);
  }
}

/** Moves every bone by (dx, 0, dz). */
export function shiftPose(pose: Pose, dx: number, dz: number): void {
  for (const b of pose) {
    b.pos.x += dx;
    b.pos.z += dz;
  }
}

/** `out` = `from` at t = 0, `to` at t = 1: positions lerped, rotations slerped. */
export function blendPose(from: Pose, to: Pose, t: number, out: Pose): void {
  const k = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 1;
  for (let s = 0; s < SEGMENT_COUNT; s++) {
    const a = from[s];
    const b = to[s];
    const o = out[s];
    if (!a || !b || !o) continue;
    o.pos.lerpVectors(a.pos, b.pos, k);
    o.quat.slerpQuaternions(a.quat, b.quat, k);
  }
}

/** Ease in and out, so the get-up starts and lands softly. */
export function smoothstep(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}
