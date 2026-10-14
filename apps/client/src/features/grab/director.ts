/*
 * The grab pairs being drawn (#28), and the pose owners they hold. A pair
 * starts when a grabbed protester is matched with the bot holding them and
 * both bodies are Jordan's models; it takes both poses (`setPoseOwner`) and
 * gets its own Animators for the paired clips. It ends, giving both poses
 * back at once, as soon as the match goes (released, rescued, struggled free,
 * arrested, the bot knocked down or gone, the round over, disconnected), a
 * body is swapped or unmounted, or `clear()` (unmount).
 *
 * A stuck owner would freeze an avatar for good, so every way out goes
 * through `end`. No three.js here: bodies and animators come from `deps`.
 */
import { startPhase, type PhaseState } from "./phase.ts";
import type { PairPose } from "./placement.ts";

/** What a pair needs of an Animator (models/animator.ts). */
export interface PairAnimator {
  play(name: string, opts?: { fade?: number; timeScale?: number }): boolean;
  playOnce(name: string, opts?: { fade?: number; timeScale?: number; hold?: boolean }): boolean;
  setTimeScale(scale: number): void;
  update(dt: number): void;
  dispose(): void;
}

export interface DirectorDeps<B> {
  /** The drawn body of bot `id` (its model on foot), or null. */
  crsBody(id: string): B | null;
  /** The drawn body of protester `id`, or null. */
  victimBody(id: string): B | null;
  setPoseOwner(id: string, owner: string | null): void;
  /** An Animator on `body` with the paired clips of that side, or null while they load. */
  animator(body: B, side: "crs" | "victim"): PairAnimator | null;
  /** Whether protester `id` was lying down just before the grab (the pair starts on the ground). */
  wasLying(id: string): boolean;
  /** Dress the CRS body for the pair (`held`: no riot shield, like Jordan's paired CRS) or back as it was. */
  dress(body: B, held: boolean): void;
}

export interface Pair<B> {
  victimId: string;
  crsId: string;
  crsBody: B;
  victimBody: B;
  crs: PairAnimator;
  victim: PairAnimator;
  phase: PhaseState;
  /** Clips not started yet (the first frame plays them without a crossfade). */
  fresh: boolean;
  /** The drawn pose, smoothed toward the server's. */
  pose: PairPose;
  /** Smoothed pair speed, m/s, and the server midpoint last frame (NaN before the first). */
  speed: number;
  lastX: number;
  lastZ: number;
}

export class GrabDirector<B> {
  private readonly deps: DirectorDeps<B>;
  private readonly live = new Map<string, Pair<B>>();

  constructor(deps: DirectorDeps<B>) {
    this.deps = deps;
  }

  /** The pairs drawn now, by protester id. */
  get pairs(): ReadonlyMap<string, Pair<B>> {
    return this.live;
  }

  /** Victim id → bot id of last `sync`, for `matchPairs`' tie-break. */
  partners(out: Map<string, string>): Map<string, string> {
    out.clear();
    for (const [v, p] of this.live) out.set(v, p.crsId);
    return out;
  }

  /**
   * Bring the pairs in line with this frame's matches (victim id → bot id):
   * end the ones that went or whose bodies changed, start the new ones.
   */
  sync(matches: ReadonlyMap<string, string>): void {
    for (const [victimId, p] of this.live) {
      if (matches.get(victimId) !== p.crsId || this.deps.crsBody(p.crsId) !== p.crsBody || this.deps.victimBody(victimId) !== p.victimBody) {
        this.end(p);
      }
    }
    for (const [victimId, crsId] of matches) {
      if (this.live.has(victimId)) continue;
      this.start(victimId, crsId);
    }
  }

  /** End every pair (unmount, disconnect). */
  clear(): void {
    for (const p of this.live.values()) this.end(p);
  }

  private start(victimId: string, crsId: string): void {
    const crsBody = this.deps.crsBody(crsId);
    const victimBody = this.deps.victimBody(victimId);
    // A placeholder on either side: no pair, both avatars keep doing what they do today.
    if (!crsBody || !victimBody) return;
    const crs = this.deps.animator(crsBody, "crs");
    const victim = crs && this.deps.animator(victimBody, "victim");
    if (!crs || !victim) {
      crs?.dispose();
      return;
    }
    this.deps.dress(crsBody, true);
    const owner = `grab:${crsId}`;
    this.deps.setPoseOwner(crsId, owner);
    this.deps.setPoseOwner(victimId, owner);
    this.live.set(victimId, {
      victimId,
      crsId,
      crsBody,
      victimBody,
      crs,
      victim,
      phase: startPhase(this.deps.wasLying(victimId)),
      fresh: true,
      pose: { cx: 0, cz: 0, yaw: 0 },
      speed: 0,
      lastX: Number.NaN,
      lastZ: Number.NaN,
    });
  }

  private end(p: Pair<B>): void {
    this.live.delete(p.victimId);
    this.deps.setPoseOwner(p.crsId, null);
    this.deps.setPoseOwner(p.victimId, null);
    this.deps.dress(p.crsBody, false);
    p.crs.dispose();
    p.victim.dispose();
  }
}
