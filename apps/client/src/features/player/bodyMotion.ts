/*
 * Plays one protester body's clips (#28): what clipChoice.ts picks, on the
 * body's Animator. Split from protesterBody.ts so it is unit-tested without
 * the rest of the game around it.
 */
import type { Object3D } from "three";
import type { Animator } from "../models/index.ts";
import { actionClip, cutsAction, type ClipChoice } from "./clipChoice.ts";
import { BonePose } from "./bonePose.ts";

/** Off-screen, the mixer only catches up this often (seconds): nobody sees it, but it shouldn't freeze for good. */
const OFFSCREEN_STEP = 0.25;
/** The longest catch-up step, so a body back on screen doesn't jump through half a clip. */
const MAX_STEP = 0.5;

/**
 * Plays one body's clips: the state clip every frame, actions on top until
 * they end or a stronger state cuts them, held poses (KO, knockdown) once,
 * and a get-up after a held pose. Before each update it puts back the pose
 * its Animator last wrote, since the ragdoll or a grab pair may have posed
 * the bones in between (see bonePose.ts, #103).
 */
export class BodyMotion {
  private readonly animator: Animator;
  /** The action (one-shot) playing, by name. */
  private action: string | null = null;
  /** The held pose showing, by name. */
  private held: string | null = null;
  private pending = 0;
  private readonly pose: BonePose;

  constructor(animator: Animator) {
    this.animator = animator;
    this.pose = new BonePose(animator.mixer.getRoot() as Object3D);
  }

  /** Start an action now (a swing, a dodge). Ignored while a pose is held (KO). */
  act(choice: ClipChoice): void {
    if (this.held) return;
    if (this.animator.playOnce(choice.name, { timeScale: choice.timeScale, fade: 0.1 })) this.action = choice.name;
  }

  /** Each frame: what the state calls for, at `speed` (m/s, for the get-up giving way to running). */
  drive(state: ClipChoice, speed: number): void {
    if (state.hold) {
      if (this.held !== state.name) {
        this.animator.playOnce(state.name, { hold: true, timeScale: state.timeScale, fade: 0.15 });
        this.held = state.name;
        this.action = null;
      }
      return;
    }
    if (this.held) {
      // Back up from a held pose: the get-up, as an action.
      this.held = null;
      this.act(actionClip("getUp", Infinity));
    }
    if (this.action && this.animator.busy && !cutsAction(state, this.action, speed)) return;
    this.action = null;
    this.animator.play(state.name, { timeScale: state.timeScale });
  }

  /** Forget held poses and actions (respawn): the next `drive` starts clean. */
  reset(): void {
    this.held = null;
    this.action = null;
  }

  /** Advance the mixer; off-screen, only every OFFSCREEN_STEP. */
  tick(dt: number, visible: boolean): void {
    this.pending += dt;
    // Even on a frame the mixer skips: the get-up blend that follows reads the bones as the animated pose.
    this.pose.restore();
    if (!visible && this.pending < OFFSCREEN_STEP) return;
    this.animator.update(Math.min(this.pending, MAX_STEP));
    this.pose.capture();
    this.pending = 0;
  }
}
