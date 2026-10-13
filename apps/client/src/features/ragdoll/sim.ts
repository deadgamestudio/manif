/*
 * The ragdoll physics (#26): verlet particles, distance constraints and a
 * ground plane. Pure maths, no React, no three.js scene.
 *
 * Why not Rapier: its WASM build is about 2 MB, and all we need is cosmetic
 * floppy limbs pinned to a root the server owns, falling on flat ground. A
 * few dozen lines of verlet do that with no dependency, cost next to nothing
 * per body, and are easy to unit test.
 *
 * The pelvis is pinned: each step it is set to the root position the caller
 * gives (the avatar's interpolated server position) and never moves by
 * itself, so the ragdoll can never drift from where the server says the body is.
 */
import {
  P,
  PARTICLE_COUNT,
  buildConstraints,
  particleRadii,
  restLayout,
  type Constraint,
  type RagdollProportions,
} from "./skeleton.ts";

/** Fixed physics step, seconds. */
export const STEP = 1 / 60;
/** At most this many steps per frame: a long frame (tab switch) just slows the ragdoll down instead of exploding it. */
export const MAX_STEPS = 4;
/** Constraint passes per step. */
export const ITERATIONS = 4;
/** A bit more than real gravity: snappier, more cartoony falls. */
export const GRAVITY = 14;
/** Share of the velocity kept per step (air drag). */
const DAMPING = 0.985;
/** Share of the sliding speed lost per step while touching the ground. */
const GROUND_FRICTION = 0.25;
/** How fast the pinned pelvis drops from standing to lying height, per second. */
const PELVIS_DROP_RATE = 7;
/**
 * Once kicked, the upper body is pulled along the fall and the feet the other
 * way (m/s², horizontal). With the pelvis pinned the torso is an upside-down
 * pendulum that the folded legs can prop upright; this makes sure the body
 * always ends up lying along the hit.
 */
const FALL_PULL: readonly number[] = (() => {
  const k = new Array<number>(PARTICLE_COUNT).fill(0);
  k[P.Head] = 9;
  k[P.Chest] = 7;
  k[P.LShoulder] = 4;
  k[P.RShoulder] = 4;
  k[P.LKnee] = -3;
  k[P.RKnee] = -3;
  k[P.LFoot] = -5;
  k[P.RFoot] = -5;
  return k;
})();
/**
 * And the hips and shoulders are pulled level across the fall (m/s²), so the
 * torso rolls onto its back or its front (whichever is closer) instead of
 * lying on its side, its plane across the fall.
 */
const ROLL_PULL = 6;

export interface RagdollSim {
  /** Particle positions and previous positions, xyz interleaved, world space. */
  pos: Float32Array;
  prev: Float32Array;
  radii: Float32Array;
  constraints: Constraint[];
  rest: number[][];
  /** Height the pinned pelvis is held at; drops from standing to lying. */
  pelvisY: number;
  standingPelvisY: number;
  lyingPelvisY: number;
  /** Unspent frame time, seconds. */
  acc: number;
  /** Ground direction of the fall (unit), 0 before the first kick. */
  fallX: number;
  fallZ: number;
}

export function createSim(p: RagdollProportions): RagdollSim {
  const rest = restLayout(p);
  const standing = (rest[P.Pelvis] as number[])[1] as number;
  return {
    pos: new Float32Array(PARTICLE_COUNT * 3),
    prev: new Float32Array(PARTICLE_COUNT * 3),
    radii: particleRadii(p),
    constraints: buildConstraints(p),
    rest,
    pelvisY: standing,
    standingPelvisY: standing,
    lyingPelvisY: p.torsoRadius,
    acc: 0,
    fallX: 0,
    fallZ: 0,
  };
}

/**
 * Writes the standing rest pose at root (x, z) facing `yaw` (three.js
 * rotation.y: forward is (sin yaw, cos yaw)) into `out`, xyz interleaved.
 */
export function writeRestPose(rest: number[][], x: number, z: number, yaw: number, out: Float32Array): void {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const r = rest[i] as number[];
    const lx = r[0] as number;
    const lz = r[2] as number;
    out[i * 3] = x + lx * c + lz * s;
    out[i * 3 + 1] = r[1] as number;
    out[i * 3 + 2] = z - lx * s + lz * c;
  }
}

/**
 * Puts the ragdoll standing at the root, at rest, `lift` metres off the ground
 * (floored mid-hop, #45: it falls from where the avatar was drawn, no pop).
 */
export function seedStanding(sim: RagdollSim, x: number, z: number, yaw: number, lift = 0): void {
  writeRestPose(sim.rest, x, z, yaw, sim.pos);
  const up = Number.isFinite(lift) && lift > 0 ? lift : 0;
  if (up > 0) for (let i = 1; i < sim.pos.length; i += 3) sim.pos[i] = (sim.pos[i] as number) + up;
  sim.prev.set(sim.pos);
  sim.pelvisY = sim.standingPelvisY + up;
  sim.acc = 0;
  sim.fallX = 0;
  sim.fallZ = 0;
}

/**
 * How hard each particle is thrown by a hit, along the push / straight up /
 * sideways (left +, right -). The upper body whips over along the push, the
 * feet are swept back and up from under it, the arms flail outwards. On
 * purpose a bit much: slapstick.
 */
const KICK: readonly (readonly [number, number, number])[] = (() => {
  const k: [number, number, number][] = Array.from({ length: PARTICLE_COUNT }, () => [0, 0, 0]);
  k[P.Head] = [1.3, 1.2, 0];
  k[P.Chest] = [1, 0.8, 0];
  k[P.LShoulder] = [0.9, 0.8, 0.2];
  k[P.RShoulder] = [0.9, 0.8, -0.2];
  k[P.LElbow] = [1, 2, 1.2];
  k[P.RElbow] = [0.8, 1.4, -1.4];
  k[P.LHand] = [1.4, 3, 1.8];
  k[P.RHand] = [1.1, 2.2, -2.2];
  k[P.LHip] = [0, 0.3, 0];
  k[P.RHip] = [0, 0.3, 0];
  k[P.LKnee] = [-0.6, 1.2, 0.3];
  k[P.RKnee] = [-0.5, 0.9, -0.3];
  k[P.LFoot] = [-1.1, 2.2, 0.4];
  k[P.RFoot] = [-0.9, 1.6, -0.5];
  return k;
})();
/** Kick speed for a reference (heavy) hit, m/s. */
const KICK_SPEED = 4.5;

/**
 * Throws the limbs along ground direction (dirX, dirZ), `power` 1 for a
 * heavy hit. The body's facing (`yaw`) only orients the sideways flail.
 */
export function kick(sim: RagdollSim, dirX: number, dirZ: number, power: number, yaw: number): void {
  const len = Math.hypot(dirX, dirZ);
  if (!(len > 1e-6) || !Number.isFinite(power)) return;
  const dx = dirX / len;
  const dz = dirZ / len;
  // Body's left in world space.
  const lx = Math.cos(yaw);
  const lz = -Math.sin(yaw);
  const v = KICK_SPEED * Math.min(1.6, Math.max(0.5, power));
  sim.fallX = dx;
  sim.fallZ = dz;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    if (i === P.Pelvis) continue;
    const [push, up, side] = KICK[i] as readonly [number, number, number];
    // Verlet velocity lives in pos - prev.
    sim.prev[i * 3] = (sim.prev[i * 3] as number) - (dx * push + lx * side) * v * STEP;
    sim.prev[i * 3 + 1] = (sim.prev[i * 3 + 1] as number) - up * v * 0.5 * STEP;
    sim.prev[i * 3 + 2] = (sim.prev[i * 3 + 2] as number) - (dz * push + lz * side) * v * STEP;
  }
}

/** Holds the pelvis exactly at the root (pinned: no velocity of its own). */
function pin(sim: RagdollSim, x: number, z: number): void {
  const i = P.Pelvis * 3;
  sim.pos[i] = sim.prev[i] = x;
  sim.pos[i + 1] = sim.prev[i + 1] = sim.pelvisY;
  sim.pos[i + 2] = sim.prev[i + 2] = z;
}

function integrate(sim: RagdollSim): void {
  const { pos, prev } = sim;
  const s2 = STEP * STEP;
  // Horizontal axis across the fall, signed towards where the body's left already is.
  let ax = -sim.fallZ;
  let az = sim.fallX;
  const lx = (pos[P.LHip * 3] as number) - (pos[P.RHip * 3] as number) + (pos[P.LShoulder * 3] as number) - (pos[P.RShoulder * 3] as number);
  const lz =
    (pos[P.LHip * 3 + 2] as number) - (pos[P.RHip * 3 + 2] as number) + (pos[P.LShoulder * 3 + 2] as number) - (pos[P.RShoulder * 3 + 2] as number);
  if (lx * ax + lz * az < 0) {
    ax = -ax;
    az = -az;
  }
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    if (i === P.Pelvis) continue;
    const pull = (FALL_PULL[i] as number) * s2;
    const roll = (i === P.LHip || i === P.LShoulder ? ROLL_PULL : i === P.RHip || i === P.RShoulder ? -ROLL_PULL : 0) * s2;
    for (let k = 0; k < 3; k++) {
      const j = i * 3 + k;
      const p = pos[j] as number;
      const v = (p - (prev[j] as number)) * DAMPING;
      const a = k === 0 ? sim.fallX * pull + ax * roll : k === 2 ? sim.fallZ * pull + az * roll : -GRAVITY * s2;
      prev[j] = p;
      pos[j] = p + v + a;
    }
  }
}

function solveConstraints(sim: RagdollSim): void {
  const { pos } = sim;
  for (const c of sim.constraints) {
    const a = c.a * 3;
    const b = c.b * 3;
    const dx = (pos[b] as number) - (pos[a] as number);
    const dy = (pos[b + 1] as number) - (pos[a + 1] as number);
    const dz = (pos[b + 2] as number) - (pos[a + 2] as number);
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 1e-6) continue;
    if (c.minOnly && d >= c.rest) continue;
    const diff = ((d - c.rest) / d) * c.stiffness;
    // The pelvis is pinned (infinite mass): only the other end moves.
    const wa = c.a === P.Pelvis ? 0 : c.b === P.Pelvis ? 1 : 0.5;
    const wb = c.b === P.Pelvis ? 0 : c.a === P.Pelvis ? 1 : 0.5;
    pos[a] = (pos[a] as number) + dx * diff * wa;
    pos[a + 1] = (pos[a + 1] as number) + dy * diff * wa;
    pos[a + 2] = (pos[a + 2] as number) + dz * diff * wa;
    pos[b] = (pos[b] as number) - dx * diff * wb;
    pos[b + 1] = (pos[b + 1] as number) - dy * diff * wb;
    pos[b + 2] = (pos[b + 2] as number) - dz * diff * wb;
  }
}

/** Nothing goes below the ground; what touches it slides to a stop. */
function collideGround(sim: RagdollSim): void {
  const { pos, prev, radii } = sim;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    if (i === P.Pelvis) continue;
    const r = radii[i] as number;
    const y = i * 3 + 1;
    if ((pos[y] as number) >= r) continue;
    pos[y] = r;
    // No bounce, and friction on the sliding part of the velocity.
    if ((prev[y] as number) < r) prev[y] = r;
    const x = i * 3;
    const z = i * 3 + 2;
    prev[x] = (pos[x] as number) - ((pos[x] as number) - (prev[x] as number)) * (1 - GROUND_FRICTION);
    prev[z] = (pos[z] as number) - ((pos[z] as number) - (prev[z] as number)) * (1 - GROUND_FRICTION);
  }
}

/** If anything went non-finite, start again standing at the root rather than draw garbage. */
function sane(sim: RagdollSim): boolean {
  for (let i = 0; i < sim.pos.length; i++) if (!Number.isFinite(sim.pos[i] as number) || !Number.isFinite(sim.prev[i] as number)) return false;
  return true;
}

/**
 * Advances the ragdoll by frame time `dt` (seconds), pinned to root (x, z).
 * Runs whole fixed steps only; a long frame is clamped to MAX_STEPS. Only
 * reads x and z: the root is the server's, the ragdoll never writes it.
 */
export function stepSim(sim: RagdollSim, dt: number, x: number, z: number, yaw: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return;
  const frame = Number.isFinite(dt) && dt > 0 ? Math.min(dt, MAX_STEPS * STEP) : 0;
  sim.acc = Math.min(sim.acc + frame, MAX_STEPS * STEP);
  while (sim.acc >= STEP) {
    sim.acc -= STEP;
    sim.pelvisY += (sim.lyingPelvisY - sim.pelvisY) * (1 - Math.exp(-PELVIS_DROP_RATE * STEP));
    pin(sim, x, z);
    integrate(sim);
    for (let k = 0; k < ITERATIONS; k++) {
      solveConstraints(sim);
      collideGround(sim);
    }
  }
  // Always exactly on the root, even on a frame with no whole step.
  pin(sim, x, z);
  if (!sane(sim)) seedStanding(sim, x, z, Number.isFinite(yaw) ? yaw : 0);
}
