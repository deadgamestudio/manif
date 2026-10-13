import { describe, expect, test } from "bun:test";
import { Quaternion, Vector3 } from "three";
import { blendPose, createPose, poseFromParticles } from "./pose.ts";
import { createSim, kick, seedStanding, STEP, stepSim, writeRestPose } from "./sim.ts";
import { PARTICLE_COUNT, SEGMENTS, SEGMENT_COUNT, restLayout, type RagdollProportions } from "./skeleton.ts";

const BODY: RagdollProportions = {
  height: 1.8,
  leftShoulderX: 0.48,
  rightShoulderX: 0.28,
  hipX: 0.17,
  torsoRadius: 0.34,
  headRadius: 0.2,
  limbRadius: 0.11,
};

function ragdollPose() {
  const sim = createSim(BODY);
  seedStanding(sim, 0, 0, 0);
  kick(sim, 1, 0, 1, 0);
  for (let i = 0; i < 40; i++) stepSim(sim, STEP, 0, 0, 0);
  const pose = createPose();
  poseFromParticles(sim.pos, pose);
  return { sim, pose };
}

function restPose(x: number, z: number, yaw: number) {
  const pos = new Float32Array(PARTICLE_COUNT * 3);
  writeRestPose(restLayout(BODY), x, z, yaw, pos);
  const pose = createPose();
  poseFromParticles(pos, pose);
  return pose;
}

describe("bone transforms", () => {
  test("standing, every bone is the body's yaw rotation", () => {
    const yaw = 0.7;
    const pose = restPose(2, 3, yaw);
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
    for (let s = 0; s < SEGMENT_COUNT; s++) {
      const bone = pose[s];
      if (!bone) throw new Error("missing bone");
      // Torso and head point up; the hanging limbs point down (a half turn about the left axis).
      const def = SEGMENTS[s];
      const up = def?.name === "torso" || def?.name === "head";
      const expected = up ? q : q.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI));
      expect(Math.abs(bone.quat.dot(expected))).toBeCloseTo(1, 5);
    }
  });

  test("each bone's +Y reaches its child joint", () => {
    const { sim, pose } = ragdollPose();
    for (let s = 0; s < SEGMENT_COUNT; s++) {
      const def = SEGMENTS[s];
      const bone = pose[s];
      if (!def || !bone) throw new Error("missing bone");
      const child = new Vector3(sim.pos[def.to * 3], sim.pos[def.to * 3 + 1], sim.pos[def.to * 3 + 2]);
      const len = child.distanceTo(bone.pos);
      const tip = new Vector3(0, len, 0).applyQuaternion(bone.quat).add(bone.pos);
      expect(tip.distanceTo(child)).toBeLessThan(1e-4);
    }
  });
});

describe("get-up blend", () => {
  test("0 is the ragdoll pose, 1 the rest pose", () => {
    const { pose: from } = ragdollPose();
    const to = restPose(0.5, -0.5, 1.2);
    const out = createPose();
    for (const [t, target] of [
      [0, from],
      [1, to],
    ] as const) {
      blendPose(from, to, t, out);
      for (let s = 0; s < SEGMENT_COUNT; s++) {
        expect(out[s]?.pos.distanceTo(target[s]?.pos ?? new Vector3())).toBeLessThan(1e-6);
        expect(Math.abs(out[s]?.quat.dot(target[s]?.quat ?? new Quaternion()) ?? 0)).toBeCloseTo(1, 6);
      }
    }
  });
});
