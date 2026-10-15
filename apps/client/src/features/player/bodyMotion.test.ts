import { describe, expect, test } from "bun:test";
import { AnimationClip, Bone, Group, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from "three";
import { Animator } from "../models/index.ts";
import { BodyMotion } from "./bodyMotion.ts";

const UPRIGHT = [0, 0, 0, 1];
/** Lying face down: the hips turned a quarter turn about X, as the ragdoll leaves them. */
const LYING = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);

/**
 * Like Jordan's walk: the hips bob up and down, but their rotation is the same
 * on every key (still tracks are what the mixer skips rewriting).
 */
const walk = new AnimationClip("walk", 1, [
  new VectorKeyframeTrack("hips.position", [0, 0.5, 1], [0, 0.88, 0, 0, 0.91, 0, 0, 0.88, 0]),
  new QuaternionKeyframeTrack("hips.quaternion", [0, 1], [...UPRIGHT, ...UPRIGHT]),
]);
/** A grab pair's clip, lying on the ground (the victim dragged by the collar). */
const dragged = new AnimationClip("dragged", 1, [
  new QuaternionKeyframeTrack("hips.quaternion", [0, 1], [...LYING.toArray(), ...LYING.toArray()]),
  new VectorKeyframeTrack("hips.position", [0, 1], [0, 0.2, 0, 0, 0.2, 0]),
]);

function body() {
  const root = new Group();
  const hips = new Bone();
  hips.name = "hips";
  hips.position.set(0, 0.92, 0);
  root.add(hips);
  const animator = new Animator(root, new Map([["walk", walk]]));
  const motion = new BodyMotion(animator);
  // Walk for a while: the mixer has written the upright hips.
  for (let i = 0; i < 10; i++) {
    motion.drive({ name: "walk", hold: false, timeScale: 1 }, 1);
    motion.tick(1 / 60, true);
  }
  return { root, hips, animator, motion };
}

/** What the ragdoll does to the bones on a fall (ragdoll/skinnedBody.ts `apply`). */
function knockFlat(hips: Bone) {
  hips.quaternion.copy(LYING);
  hips.position.set(0.3, 0.15, 0.2);
}

const upright = (hips: Bone) => Math.abs(hips.quaternion.w) > 0.999 && hips.position.y > 0.8;

describe("a protester body after something else posed its bones (#103)", () => {
  test("the cause: the mixer alone never rewrites a still track", () => {
    const { hips, animator } = body();
    knockFlat(hips);
    for (let i = 0; i < 30; i++) animator.update(1 / 60);
    // The bob is rewritten, the rotation is not: lying face down, walking.
    expect(Math.abs(hips.quaternion.w)).toBeLessThan(0.8);
  });

  test("stands up again once the ragdoll lets go", () => {
    const { hips, motion } = body();
    knockFlat(hips);
    motion.drive({ name: "walk", hold: false, timeScale: 1 }, 1);
    motion.tick(1 / 60, true);
    expect(upright(hips)).toBe(true);
  });

  test("off screen too, where the mixer skips frames", () => {
    const { hips, motion } = body();
    knockFlat(hips);
    motion.tick(1 / 60, false);
    expect(upright(hips)).toBe(true);
  });

  test("stands up again after a grab pair that started on the ground", () => {
    const { root, hips, motion } = body();
    // Grabbed while lying: the pair's Animator takes the bones in the ragdoll's pose, and gives them back so when it ends.
    knockFlat(hips);
    const pair = new Animator(root, new Map([["dragged", dragged]]));
    pair.play("dragged", { fade: 0 });
    for (let i = 0; i < 10; i++) pair.update(1 / 60);
    expect(Math.abs(hips.quaternion.w)).toBeLessThan(0.8);
    pair.dispose();
    motion.drive({ name: "walk", hold: false, timeScale: 1 }, 1);
    motion.tick(1 / 60, true);
    expect(upright(hips)).toBe(true);
  });

  test("the get-up blend sees the animated pose every frame, so it ends upright", () => {
    const { hips, motion } = body();
    knockFlat(hips);
    const lying = hips.quaternion.clone();
    // ragdoll/skinnedBody.ts `blendFromSaved`: from the saved lying pose to what is on the bones after the Animator.
    for (let k = 0.1; k <= 1.0001; k += 0.1) {
      motion.tick(1 / 60, true);
      hips.quaternion.slerpQuaternions(lying, hips.quaternion.clone(), k);
    }
    motion.tick(1 / 60, true);
    expect(upright(hips)).toBe(true);
  });
});
