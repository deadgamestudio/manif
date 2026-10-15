/*
 * One body's ragdoll life (#26): fall, tumble, get up. Pure TS: the avatar
 * feeds it, each frame, the frame time, whether the body is lying, the root
 * (its interpolated server position), its yaw and the last impulse event,
 * and draws `pose` while `update` returns true.
 *
 *   idle ──lying, slot free──▶ ragdoll ──lying ends──▶ getup (blend) ──▶ idle
 *     └──lying, no slot──▶ fallback (the avatar's tip-over) ──lying ends──▶ idle
 */
import { HEAVY_IMPULSE, type ImpulseEvent } from "@manif/shared";
import { ragdollSlots, type RagdollBudget } from "./budget.ts";
import { blendPose, copyPose, createPose, poseFromParticles, shiftPose, smoothstep, type Pose } from "./pose.ts";
import { PARTICLE_COUNT, type RagdollProportions } from "./skeleton.ts";
import { createSim, kick, seedStanding, stepSim, writeRestPose, type RagdollSim } from "./sim.ts";

/** Get-up blend, seconds: long enough to read as getting up, short enough not to feel stuck. */
export const BLEND_TIME = 0.5;
/** An impulse first seen this recently (seconds) counts as the hit that floored the body. */
export const FRESH_HIT = 0.3;
/**
 * The impulse event and the `down` patch can arrive in either order: wait
 * this long (seconds) for the impulse before falling backwards anyway.
 */
export const KICK_WINDOW = 0.12;
/** Falling with no hit seen (a KO from damage, joined late): a softer kick, backwards. */
const NO_HIT_POWER = 0.6;

export type Hit = Pick<ImpulseEvent, "dirX" | "dirZ" | "strength">;

const Mode = { Idle: 0, Ragdoll: 1, GetUp: 2, Fallback: 3 } as const;
type Mode = (typeof Mode)[keyof typeof Mode];

export class RagdollController {
  readonly sim: RagdollSim;
  /** World bone transforms to draw, valid while `update` returns true. */
  readonly pose: Pose = createPose();
  private readonly budget: RagdollBudget;
  private mode: Mode = Mode.Idle;
  /** Seconds of frame time seen, for the impulse freshness. */
  private clock = 0;
  private lastHit: Hit | undefined;
  private lastHitAt = -Infinity;
  /** The hit already played, so one impulse never kicks twice. */
  private usedHit: Hit | undefined;
  private kicked = false;
  private sinceFall = 0;
  private blend = 0;
  /** The pose at get-up time, relative to the root then. */
  private readonly lyingPose: Pose = createPose();
  private readonly from: Pose = createPose();
  private readonly rest: Pose = createPose();
  private readonly restParticles = new Float32Array(PARTICLE_COUNT * 3);

  constructor(proportions: RagdollProportions, budget: RagdollBudget = ragdollSlots) {
    this.sim = createSim(proportions);
    this.budget = budget;
  }

  /** True while blending back up (#26); `getUpAmount` says how far, eased, 0..1. */
  get gettingUp(): boolean {
    return this.mode === Mode.GetUp;
  }

  get getUpAmount(): number {
    return this.mode === Mode.GetUp ? smoothstep(this.blend) : 0;
  }

  /** True while the ragdoll is falling, lying or blending back up. */
  get active(): boolean {
    return this.mode === Mode.Ragdoll || this.mode === Mode.GetUp;
  }

  /**
   * One frame. Returns true if the ragdoll should be drawn (and the normal
   * avatar hidden), false if the avatar draws itself (standing, or the
   * tip-over when no slot was free). Never writes the root: x and z are read only.
   * `lift` is how high the avatar was drawn (a hop, #45): a fall starts from there.
   */
  update(dt: number, lying: boolean, x: number, z: number, yaw: number, hit: Hit | undefined, lift = 0): boolean {
    const frame = Number.isFinite(dt) && dt > 0 ? dt : 0;
    this.clock += frame;
    if (hit !== this.lastHit) {
      this.lastHit = hit;
      this.lastHitAt = this.clock;
    }

    if (lying) {
      if (this.mode === Mode.Fallback) return false;
      if (this.mode === Mode.Idle || this.mode === Mode.GetUp) {
        if (!this.budget.acquire(this)) {
          this.mode = Mode.Fallback;
          return false;
        }
        seedStanding(this.sim, x, z, yaw, lift);
        this.mode = Mode.Ragdoll;
        this.kicked = false;
        this.sinceFall = 0;
      }
      const h = this.lastHit;
      if (h && h !== this.usedHit && this.clock - this.lastHitAt <= FRESH_HIT) {
        // Also a second hit while already down: tumble again.
        kick(this.sim, h.dirX, h.dirZ, h.strength / HEAVY_IMPULSE, yaw);
        this.usedHit = h;
        this.kicked = true;
      } else if (!this.kicked && this.sinceFall >= KICK_WINDOW) {
        kick(this.sim, -Math.sin(yaw), -Math.cos(yaw), NO_HIT_POWER, yaw);
        this.kicked = true;
      }
      this.sinceFall += frame;
      stepSim(this.sim, frame, x, z, yaw);
      poseFromParticles(this.sim.pos, this.pose);
      return true;
    }

    if (this.mode === Mode.Fallback) {
      this.mode = Mode.Idle;
      return false;
    }
    if (this.mode === Mode.Ragdoll) {
      // Freeze the lying pose relative to the root, so it follows the body if it walks off while getting up.
      poseFromParticles(this.sim.pos, this.lyingPose);
      shiftPose(this.lyingPose, -x, -z);
      this.mode = Mode.GetUp;
      this.blend = 0;
    }
    if (this.mode !== Mode.GetUp) return false;
    this.blend += frame / BLEND_TIME;
    if (this.blend >= 1) {
      this.reset();
      return false;
    }
    writeRestPose(this.sim.rest, x, z, yaw, this.restParticles);
    poseFromParticles(this.restParticles, this.rest);
    copyPose(this.lyingPose, this.from);
    shiftPose(this.from, x, z);
    blendPose(this.from, this.rest, smoothstep(this.blend), this.pose);
    return true;
  }

  /** Back to idle and the slot freed: unmount, arrest, respawn. Safe to call any time. */
  reset(): void {
    this.budget.release(this);
    this.mode = Mode.Idle;
    this.blend = 0;
  }
}
