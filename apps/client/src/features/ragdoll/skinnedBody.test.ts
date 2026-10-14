import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Bone, Group, Quaternion, Vector3, type Object3D } from "three";
import { createPose, poseFromParticles, type Pose } from "./pose.ts";
import { restLayout } from "./skeleton.ts";
import { RIG_RAGDOLL, SEGMENT_BONES, SkinnedRagdollBody } from "./skinnedBody.ts";

interface GltfNode {
  name: string;
  children?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}

/** The node tree of a real body (the GLB's JSON chunk), as three.js bones under a group: the rig as Jordan shipped it. */
function loadRig(): Group {
  const file = join(import.meta.dir, "../../../public/models/manif/animations-manifestants-v03/lyceen-hoodie/lyceen-hoodie.glb");
  const buf = readFileSync(file);
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString()) as { nodes: GltfNode[]; scenes: { nodes: number[] }[] };
  const make = (i: number): Object3D => {
    const n = json.nodes[i] as GltfNode;
    const o: Object3D = n.children?.length || n.name.includes("_") || n.name === "hips" ? new Bone() : new Group();
    o.name = n.name;
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    for (const c of n.children ?? []) o.add(make(c));
    return o;
  };
  const root = new Group();
  for (const i of json.scenes[0]?.nodes ?? []) root.add(make(i));
  return root;
}

function restPose(yaw: number, x = 0, z = 0): Pose {
  const rest = restLayout(RIG_RAGDOLL);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const flat = rest.flatMap(([px = 0, py = 0, pz = 0]) => [x + px * cos + pz * sin, py, z - px * sin + pz * cos]);
  const pose = createPose();
  poseFromParticles(flat, pose);
  return pose;
}

function snapshot(root: Object3D): Map<string, Quaternion> {
  const out = new Map<string, Quaternion>();
  root.traverse((o) => out.set(o.name, o.quaternion.clone()));
  return out;
}

describe("skinned ragdoll body", () => {
  test("finds the ten driven bones of the shared rig", () => {
    const body = new SkinnedRagdollBody(loadRig());
    expect(body.usable).toBe(true);
    expect(SEGMENT_BONES).toHaveLength(10);
  });

  test("the ragdoll standing at rest gives back the rig's rest pose, wherever it stands and faces", () => {
    for (const [yaw, x, z] of [
      [0, 0, 0],
      [1.2, 4, -7],
    ] as const) {
      const rig = loadRig();
      const holder = new Group();
      holder.position.set(x, 0, z);
      holder.rotation.y = yaw;
      holder.add(rig);
      const body = new SkinnedRagdollBody(rig);
      const before = snapshot(rig);
      const hips = rig.getObjectByName("hips") as Object3D;
      const hipsBefore = hips.position.clone();
      body.apply(restPose(yaw, x, z));
      for (const [name, q] of snapshot(rig)) expect(Math.abs((before.get(name) as Quaternion).dot(q))).toBeCloseTo(1, 4);
      expect(hips.position.distanceTo(hipsBefore)).toBeLessThan(1e-4);
    }
  });

  test("a ragdoll lying on its back lays the hips flat, near the ground", () => {
    const rig = loadRig();
    const holder = new Group();
    holder.add(rig);
    const body = new SkinnedRagdollBody(rig);
    // The whole standing pose tipped 90° backwards about X, the pelvis lowered to its radius.
    const pose = restPose(0);
    const tip = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
    const pelvis = (pose[0] as { pos: Vector3 }).pos.clone();
    for (const b of pose) {
      b.pos.sub(pelvis).applyQuaternion(tip).add(new Vector3(0, RIG_RAGDOLL.torsoRadius, 0));
      b.quat.premultiply(tip);
    }
    body.apply(pose);
    holder.updateMatrixWorld(true);
    const hips = rig.getObjectByName("hips") as Object3D;
    const head = rig.getObjectByName("head") as Object3D;
    const hipsAt = hips.getWorldPosition(new Vector3());
    const headAt = head.getWorldPosition(new Vector3());
    expect(hipsAt.y).toBeLessThan(0.3);
    expect(headAt.y).toBeLessThan(0.4);
    // Lying backwards: the head ends up behind (-Z), far from the hips.
    expect(headAt.z).toBeLessThan(hipsAt.z - 0.4);
  });

  test("blends from the saved pose to the animated one", () => {
    const rig = loadRig();
    const body = new SkinnedRagdollBody(rig);
    const thigh = rig.getObjectByName("thigh_L") as Object3D;
    const rest = thigh.quaternion.clone();
    const bent = rest.clone().premultiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 1));
    thigh.quaternion.copy(bent);
    body.save();
    thigh.quaternion.copy(rest);
    body.blendFromSaved(0);
    expect(Math.abs(thigh.quaternion.dot(bent))).toBeCloseTo(1, 5);
    thigh.quaternion.copy(rest);
    body.blendFromSaved(1);
    expect(Math.abs(thigh.quaternion.dot(rest))).toBeCloseTo(1, 5);
  });
});
