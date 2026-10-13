/*
 * The ragdoll's skeleton (#26): named particles (joints) and the named
 * segments (bones) between them, plus the standing rest pose. Pure data and
 * maths, no React.
 *
 * Body frame: facing +Z, up +Y, so the body's LEFT side is +X (the capsule
 * avatar's arm is its left arm). Rest-pose bones then all have the body's yaw
 * as their rotation, which is what a skinned model's bind pose expects.
 */

/** Particles, by index. `L_` is the body's left (+X in the body frame). */
export const P = {
  Pelvis: 0,
  Chest: 1,
  Head: 2,
  LShoulder: 3,
  RShoulder: 4,
  LElbow: 5,
  RElbow: 6,
  LHand: 7,
  RHand: 8,
  LHip: 9,
  RHip: 10,
  LKnee: 11,
  RKnee: 12,
  LFoot: 13,
  RFoot: 14,
} as const;
export type ParticleId = (typeof P)[keyof typeof P];
export const PARTICLE_COUNT = 15;

/**
 * Bones: each goes from a parent joint to a child joint. Its transform (see
 * pose.ts) sits at the parent joint with local +Y pointing at the child, the
 * same convention as three.js / glTF skeletons, so a future skinned model can
 * copy these onto its bones one for one.
 */
export const S = {
  Torso: 0,
  Head: 1,
  LUpperArm: 2,
  LForearm: 3,
  RUpperArm: 4,
  RForearm: 5,
  LThigh: 6,
  LShin: 7,
  RThigh: 8,
  RShin: 9,
} as const;
export type SegmentId = (typeof S)[keyof typeof S];
export const SEGMENT_COUNT = 10;

export interface SegmentDef {
  name: string;
  from: ParticleId;
  to: ParticleId;
  /** Which pair of joints gives the bone's "left" axis (its roll): the shoulders or the hips. */
  side: "shoulders" | "hips";
}

export const SEGMENTS: readonly SegmentDef[] = [
  { name: "torso", from: P.Pelvis, to: P.Chest, side: "shoulders" },
  { name: "head", from: P.Chest, to: P.Head, side: "shoulders" },
  { name: "upperArm.L", from: P.LShoulder, to: P.LElbow, side: "shoulders" },
  { name: "forearm.L", from: P.LElbow, to: P.LHand, side: "shoulders" },
  { name: "upperArm.R", from: P.RShoulder, to: P.RElbow, side: "shoulders" },
  { name: "forearm.R", from: P.RElbow, to: P.RHand, side: "shoulders" },
  { name: "thigh.L", from: P.LHip, to: P.LKnee, side: "hips" },
  { name: "shin.L", from: P.LKnee, to: P.LFoot, side: "hips" },
  { name: "thigh.R", from: P.RHip, to: P.RKnee, side: "hips" },
  { name: "shin.R", from: P.RKnee, to: P.RFoot, side: "hips" },
];

/** Body size. The looks (ragdollVisuals.tsx) give one per kind of body. */
export interface RagdollProportions {
  /** Standing height, head top to feet, metres. */
  height: number;
  /** Half the shoulder width on each side (the left one matches the capsule avatar's arm). */
  leftShoulderX: number;
  rightShoulderX: number;
  /** Half the hip width. */
  hipX: number;
  /** Collision radius of the torso particles: also how high the pelvis lies on the ground. */
  torsoRadius: number;
  headRadius: number;
  limbRadius: number;
}

/** Standing joint heights, as fractions of the height. Roughly the capsule avatar's silhouette. */
const Y = {
  pelvis: 0.44,
  chest: 0.72,
  head: 0.92,
  shoulder: 0.68,
  elbow: 0.49,
  hand: 0.29,
  hip: 0.42,
  knee: 0.23,
  foot: 0.055,
};

/**
 * Standing rest pose in the body frame (facing +Z, feet at y = 0), as
 * [x, y, z] per particle. Its silhouette roughly overlaps the capsule avatar,
 * so swapping one for the other at the end of a get-up is invisible.
 */
export function restLayout(p: RagdollProportions): number[][] {
  const h = p.height;
  const out: number[][] = Array.from({ length: PARTICLE_COUNT }, () => [0, 0, 0]);
  out[P.Pelvis] = [0, Y.pelvis * h, 0];
  out[P.Chest] = [0, Y.chest * h, 0];
  out[P.Head] = [0, Y.head * h, 0];
  out[P.LShoulder] = [p.leftShoulderX, Y.shoulder * h, 0];
  out[P.RShoulder] = [-p.rightShoulderX, Y.shoulder * h, 0];
  out[P.LElbow] = [p.leftShoulderX, Y.elbow * h, 0];
  out[P.RElbow] = [-p.rightShoulderX, Y.elbow * h, 0];
  out[P.LHand] = [p.leftShoulderX, Y.hand * h, 0];
  out[P.RHand] = [-p.rightShoulderX, Y.hand * h, 0];
  out[P.LHip] = [p.hipX, Y.hip * h, 0];
  out[P.RHip] = [-p.hipX, Y.hip * h, 0];
  out[P.LKnee] = [p.hipX, Y.knee * h, 0];
  out[P.RKnee] = [-p.hipX, Y.knee * h, 0];
  out[P.LFoot] = [p.hipX, Y.foot * h, 0];
  out[P.RFoot] = [-p.hipX, Y.foot * h, 0];
  return out;
}

/** Collision radius of each particle against the ground. */
export function particleRadii(p: RagdollProportions): Float32Array {
  const r = new Float32Array(PARTICLE_COUNT).fill(p.limbRadius);
  r[P.Pelvis] = r[P.Chest] = p.torsoRadius;
  // The torso's corners are thinner, so it can roll over on the ground.
  for (const i of [P.LHip, P.RHip, P.LShoulder, P.RShoulder]) r[i] = p.limbRadius + 0.05;
  r[P.Head] = p.headRadius;
  return r;
}

export interface Constraint {
  a: ParticleId;
  b: ParticleId;
  rest: number;
  /** 0..1, the share of the error fixed per iteration. Below 1 is springy. */
  stiffness: number;
  /** Only push apart (a fold limit), never pull together. */
  minOnly: boolean;
}

/** The torso joints, held as one rigid piece (every pair braced). */
const TORSO: readonly ParticleId[] = [P.Pelvis, P.Chest, P.LShoulder, P.RShoulder, P.LHip, P.RHip];

/** The distance constraints between particles, with rest lengths from the rest pose. */
export function buildConstraints(p: RagdollProportions): Constraint[] {
  const rest = restLayout(p);
  const dist = (a: ParticleId, b: ParticleId) => {
    const pa = rest[a] as number[];
    const pb = rest[b] as number[];
    return Math.hypot((pa[0] as number) - (pb[0] as number), (pa[1] as number) - (pb[1] as number), (pa[2] as number) - (pb[2] as number));
  };
  const out: Constraint[] = [];
  const link = (a: ParticleId, b: ParticleId, stiffness = 1, minScale = 0) =>
    out.push({ a, b, rest: dist(a, b) * (minScale || 1), stiffness, minOnly: minScale > 0 });

  for (let i = 0; i < TORSO.length; i++) {
    for (let j = i + 1; j < TORSO.length; j++) link(TORSO[i] as ParticleId, TORSO[j] as ParticleId);
  }
  // Wobbly head: the neck is stiff, the braces to the shoulders are springy.
  link(P.Chest, P.Head);
  link(P.LShoulder, P.Head, 0.25);
  link(P.RShoulder, P.Head, 0.25);
  // Limbs: no joint limits (knees bending backwards is on-tone), just a fold limit
  // so an arm or a leg never collapses into a single point.
  link(P.LShoulder, P.LElbow);
  link(P.LElbow, P.LHand);
  link(P.RShoulder, P.RElbow);
  link(P.RElbow, P.RHand);
  link(P.LHip, P.LKnee);
  link(P.LKnee, P.LFoot);
  link(P.RHip, P.RKnee);
  link(P.RKnee, P.RFoot);
  link(P.LShoulder, P.LHand, 1, 0.45);
  link(P.RShoulder, P.RHand, 1, 0.45);
  link(P.LHip, P.LFoot, 1, 0.55);
  link(P.RHip, P.RFoot, 1, 0.55);
  return out;
}
