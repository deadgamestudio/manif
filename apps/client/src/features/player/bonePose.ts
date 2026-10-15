/*
 * The pose a body's own Animator last wrote on its bones (#103), to put back
 * before its next update.
 *
 * Why: three.js's AnimationMixer only writes a bone when the value it computes
 * differs from the one it computed last time. Most of Jordan's loops keep some
 * tracks still (the hips' rotation never moves in walk, idle, panic-run, the
 * carries...). So when something else poses the bones in between (the ragdoll
 * on a fall, the get-up blend, a grab pair's own Animator), the mixer never
 * writes those still tracks back, and the body walks off lying face down.
 * Restoring this snapshot first gives the mixer back the bones it expects.
 *
 * Plain three.js, allocation-free per frame.
 */
import { Quaternion, Vector3, type Bone, type Object3D } from "three";

export class BonePose {
  private readonly bones: Object3D[] = [];
  private readonly positions: Vector3[] = [];
  private readonly rotations: Quaternion[] = [];
  private readonly scales: Vector3[] = [];
  private taken = false;

  constructor(root: Object3D) {
    root.traverse((o) => {
      if (!(o as Bone).isBone) return;
      this.bones.push(o);
      this.positions.push(o.position.clone());
      this.rotations.push(o.quaternion.clone());
      this.scales.push(o.scale.clone());
    });
  }

  /** Remember the bones as they are now: call it right after the Animator's update. */
  capture(): void {
    for (let i = 0; i < this.bones.length; i++) {
      const b = this.bones[i] as Object3D;
      (this.positions[i] as Vector3).copy(b.position);
      (this.rotations[i] as Quaternion).copy(b.quaternion);
      (this.scales[i] as Vector3).copy(b.scale);
    }
    this.taken = true;
  }

  /** Put the captured pose back on the bones (nothing before the first capture). */
  restore(): void {
    if (!this.taken) return;
    for (let i = 0; i < this.bones.length; i++) {
      const b = this.bones[i] as Object3D;
      b.position.copy(this.positions[i] as Vector3);
      b.quaternion.copy(this.rotations[i] as Quaternion);
      b.scale.copy(this.scales[i] as Vector3);
    }
  }
}
