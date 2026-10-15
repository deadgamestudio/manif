/**
 * One character's animation player (#28): a thin layer over three.js's
 * AnimationMixer that knows "loop this", "play that once, then go back", and
 * crossfades between them.
 *
 *   const body = useSkinnedModel(url);
 *   const clips = useClips([MODELS.clipLibraries.protesterCore, MODELS.clipLibraries.protesterExtra]);
 *   const animator = useAnimator(body, clips);
 *   useFrame((_, dt) => {
 *     animator?.play(moving ? "walk" : "idle");   // cheap to call every frame
 *     animator?.setTimeScale(speed / WALK_SPEED);
 *     animator?.update(dt);
 *   });
 *   // On a swing: animator.playOnce("melee-swing", { events: [{ time: 0.3, run: hit }] })
 *
 * The owner calls `update(dt)` from its own useFrame: there is no global
 * mixer loop, so a character that isn't drawn costs nothing.
 * Clip names are bare (`idle`, `repos`); a prefixed one works too.
 */
import { useEffect, useMemo } from "react";
import { AnimationMixer, LoopOnce, LoopRepeat, type AnimationAction, type Object3D } from "three";
import { bareClipName } from "./clipNames.ts";
import type { ClipSet } from "./clips.ts";

export interface LoopOptions {
  /** Crossfade time from whatever played before, in seconds. Default 0.2. */
  fade?: number;
  /** Playback speed (1 = as authored). */
  timeScale?: number;
}

export interface OnceOptions extends LoopOptions {
  /** Play it backward, from its end to its start (e.g. shield-raise backward to lower the shield). */
  reverse?: boolean;
  /** Stay on the last frame instead of going back to the loop (ko-collapse, knockdown...). */
  hold?: boolean;
  /** Called when the clip has played through (not if something else replaced it first). */
  onDone?: () => void;
  /** Called once each when playback passes `time` (seconds into the clip, as authored): contact frames, a prop to show or hide. */
  events?: readonly { time: number; run: () => void }[];
}

interface Once {
  name: string;
  action: AnimationAction;
  reverse: boolean;
  hold: boolean;
  onDone: (() => void) | undefined;
  events: { time: number; run: () => void; fired: boolean }[];
}

const DEFAULT_FADE = 0.2;
const warned = new Set<string>();

export class Animator {
  readonly mixer: AnimationMixer;
  private readonly root: Object3D;
  private readonly clips: ClipSet;
  private active: AnimationAction | null = null;
  private activeName: string | null = null;
  private loopName: string | null = null;
  private loopScale = 1;
  private once: Once | null = null;

  constructor(root: Object3D, clips: ClipSet) {
    this.root = root;
    this.clips = clips;
    this.mixer = new AnimationMixer(root);
    this.mixer.addEventListener("finished", this.onFinished);
  }

  /** The clip playing now (bare name), loop or one-shot. */
  get current(): string | null {
    return this.activeName;
  }

  /** True while a `playOnce` clip is playing or held. */
  get busy(): boolean {
    return this.once !== null;
  }

  has(name: string): boolean {
    return this.clips.has(bareClipName(name));
  }

  /**
   * Loop `name`, crossfading from what played before. Calling it again with
   * the clip already looping does nothing (only updates the speed), so it is
   * fine every frame. It replaces a one-shot that is still playing; check
   * `busy` first to let the one-shot finish. False if the clip is missing.
   */
  play(name: string, opts: LoopOptions = {}): boolean {
    const bare = bareClipName(name);
    if (opts.timeScale !== undefined) this.loopScale = opts.timeScale;
    if (!this.once && this.loopName === bare && this.active) {
      this.active.timeScale = this.loopScale;
      return true;
    }
    const action = this.action(bare);
    if (!action) return false;
    action.setLoop(LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.timeScale = this.loopScale;
    this.once = null;
    this.loopName = bare;
    this.switchTo(action, bare, opts.fade ?? DEFAULT_FADE);
    return true;
  }

  /**
   * Play `name` once, crossfading in. When it ends it crossfades back to the
   * last loop (unless `hold`), then calls `onDone`. False if the clip is missing.
   */
  playOnce(name: string, opts: OnceOptions = {}): boolean {
    const bare = bareClipName(name);
    const action = this.action(bare);
    if (!action) return false;
    const reverse = opts.reverse === true;
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = Math.abs(opts.timeScale ?? 1) * (reverse ? -1 : 1);
    this.once = {
      name: bare,
      action,
      reverse,
      hold: opts.hold === true,
      onDone: opts.onDone,
      events: (opts.events ?? []).map((e) => ({ ...e, fired: false })),
    };
    this.switchTo(action, bare, opts.fade ?? DEFAULT_FADE);
    if (reverse) action.time = action.getClip().duration;
    return true;
  }

  /** Playback speed of the current clip (and of the loop from now on, if a loop is playing). Negative plays backward. */
  setTimeScale(scale: number): void {
    if (!this.once) this.loopScale = scale;
    if (this.active) this.active.timeScale = scale;
  }

  /** Advance by `dt` seconds. Call it from the owner's useFrame. */
  update(dt: number): void {
    this.mixer.update(dt);
    const once = this.once;
    if (!once) return;
    const t = once.action.time;
    for (const e of once.events) {
      if (!e.fired && (once.reverse ? t <= e.time : t >= e.time)) {
        e.fired = true;
        e.run();
      }
    }
  }

  /**
   * Stop everything and free the mixer's caches. A later `play` still works
   * (React's StrictMode disposes of a memoised Animator once and keeps using it).
   */
  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.once = null;
    this.active = null;
    this.activeName = null;
    this.loopName = null;
  }

  private action(bare: string): AnimationAction | null {
    const clip = this.clips.get(bare);
    if (!clip) {
      if (!warned.has(bare)) {
        warned.add(bare);
        console.warn(`[models] no clip named "${bare}"`);
      }
      return null;
    }
    return this.mixer.clipAction(clip);
  }

  private switchTo(next: AnimationAction, name: string, fade: number): void {
    const prev = this.active;
    next.enabled = true;
    next.reset();
    next.setEffectiveWeight(1);
    if (prev && prev !== next && fade > 0) {
      next.fadeIn(fade);
      prev.fadeOut(fade);
    } else if (prev && prev !== next) {
      prev.stop();
    }
    next.play();
    this.active = next;
    this.activeName = name;
  }

  private readonly onFinished = (event: { action: AnimationAction }) => {
    const once = this.once;
    if (!once || event.action !== once.action) return;
    for (const e of once.events) {
      if (!e.fired) {
        e.fired = true;
        e.run();
      }
    }
    if (!once.hold) {
      this.once = null;
      if (this.loopName) {
        const loop = this.loopName;
        this.loopName = null; // so play() switches back instead of seeing "already looping"
        this.play(loop);
      }
    }
    once.onDone?.();
  };
}

/**
 * An Animator for `root`, made when both the body and the clips are there,
 * disposed of when either changes or the component unmounts. Null meanwhile.
 * The caller still calls `update(dt)` from its own useFrame.
 */
export function useAnimator(root: Object3D | null, clips: ClipSet | null): Animator | null {
  const animator = useMemo(() => (root && clips ? new Animator(root, clips) : null), [root, clips]);
  useEffect(() => () => animator?.dispose(), [animator]);
  return animator;
}
