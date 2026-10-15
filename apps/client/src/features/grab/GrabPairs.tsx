/*
 * Grab pairs (#28): a CRS seizing a protester by the collar, then dragging
 * them along the ground to the van, both bodies playing Jordan's paired clips
 * (animations-saisies-v02 and animations-trainage-v02, the lycéen hoodie
 * collar duo for every body: the rig is shared) on one clock, placed with the
 * pairs.json offsets around the server positions.
 *
 * pairing.ts finds who holds whom, director.ts takes and gives back the two
 * poses (`setPoseOwner`), phase.ts picks the clips, placement.ts the spots.
 * While a pair owns them, the avatars only draw their bars (the RescueBar
 * included) and leave the body to us: here we set the avatar's root position
 * and its yaw group's turn, and straighten its tilt group (no fall, hop or
 * flail on top of the paired pose). The avatars set all of those again
 * themselves once they get their pose back.
 *
 * Mounted once, in the Scene. Everything happens in useFrame; nothing renders.
 */
import { useEffect, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { AnimationUtils, type Object3D } from "three";
import { CrsStatus, PLAYER_RADIUS, Phase, PlayerStatus, crsRadius } from "@manif/shared";
import { damp } from "../../shared/iso/index.ts";
import { net } from "../../shared/net/index.ts";
import { Animator, MODELS, setPoseOwner, useClips, type ClipSet } from "../models/index.ts";
import { getAvatarBody } from "../player/index.ts";
import { getCrsBody } from "../crs/index.ts";
import { matchPairs, type Grabbed, type Grabber } from "./pairing.ts";
import { GrabDirector, type Pair } from "./director.ts";
import { CLIP_FPS, PHASE_CLIPS, SEIZE_FROM_FRAME, phaseTimeScale, stepPhase } from "./phase.ts";
import { clampDrift, offsetFor, placeBodies, targetPose, turn, victimInCrs, type PairPose, type Placed } from "./placement.ts";

const CRS_CLIPS = [MODELS.clipLibraries.grabCollarCrs, MODELS.clipLibraries.dragCollarCrs];
const VICTIM_CLIPS = [MODELS.clipLibraries.grabCollarVictim, MODELS.clipLibraries.dragCollarVictim];
/** brain.ts `stepCrs`: the protester trails `radius + PLAYER_RADIUS + 0.05` behind the bot. */
const TRAIL_EXTRA = PLAYER_RADIUS + 0.05;
const STANDING = victimInCrs(offsetFor("standing"));
const GROUND = victimInCrs(offsetFor("ground"));
/** Smoothing rates (1/s): the pair's spot, its turn, and the measured speed (server moves come in ticks). */
const FOLLOW_RATE = 12;
const TURN_RATE = 10;
const SPEED_RATE = 4;
/** Crossfade between two phases, s (the first clip snaps in: the other mixer posed the body until now). */
const PHASE_FADE = 0.25;
/** The longest mixer step, so a stalled tab doesn't jump through half a clip. */
const MAX_STEP = 0.1;
/** Down this recently (ms) when grabbed: the pair starts on the ground (the avatar may still be getting up). */
const LYING_GRACE_MS = 1000;
/** The riot shield's nodes on a police body (policeModels.tsx): Jordan's paired CRS has none. */
const SHIELD_NODES = ["shield-frame", "shield-panel"] as const;
/** The shield nodes hidden for a pair, and whether each was shown before. */
const undressed = new WeakMap<Object3D, [Object3D, boolean][]>();

function dress(body: Object3D, held: boolean): void {
  if (held) {
    const nodes: [Object3D, boolean][] = [];
    for (const name of SHIELD_NODES) {
      const node = body.getObjectByName(name);
      if (node) {
        nodes.push([node, node.visible]);
        node.visible = false;
      }
    }
    undressed.set(body, nodes);
  } else {
    for (const [node, shown] of undressed.get(body) ?? []) node.visible = shown;
    undressed.delete(body);
  }
}

/**
 * Seize goes on from where the wind-up left it (policeModels.tsx holds the
 * first SEIZE_FROM_FRAME frames): `<name>-rest` is the rest of the clip. Made
 * once per loaded set.
 */
function withRest(set: ClipSet | null, name: string): ClipSet | null {
  if (!set) return null;
  const clip = set.get(name);
  if (!clip) return set;
  const more = new Map(set);
  const end = Math.round(clip.duration * CLIP_FPS);
  more.set(`${name}-rest`, AnimationUtils.subclip(clip, `${name}-rest`, SEIZE_FROM_FRAME, end, CLIP_FPS));
  return more;
}

/** The avatar groups around a drawn body: root (placed in the world) > tilt > yaw > body. */
function frameOf(body: Object3D): { root: Object3D; tilt: Object3D; yaw: Object3D } | null {
  const yaw = body.parent;
  const tilt = yaw?.parent;
  const root = tilt?.parent;
  return yaw && tilt && root ? { root, tilt, yaw } : null;
}

function put(body: Object3D, at: Placed): void {
  const f = frameOf(body);
  if (!f) return;
  f.root.position.set(at.x, 0, at.z);
  f.tilt.quaternion.identity();
  f.tilt.position.y = 0;
  f.yaw.rotation.set(0, at.yaw, 0);
  f.yaw.scale.set(1, 1, 1);
}

export function GrabPairs() {
  const crsClips = useClips(CRS_CLIPS);
  const victimClips = useClips(VICTIM_CLIPS);
  const crsSet = useMemo(() => withRest(crsClips, "seize"), [crsClips]);
  const victimSet = useMemo(() => withRest(victimClips, "seized"), [victimClips]);
  const [pairs] = useState(() => new PairsRunner());
  useEffect(() => pairs.setClips(crsSet, victimSet), [pairs, crsSet, victimSet]);
  // Unmount (leaving the game): every pose goes back.
  useEffect(() => () => pairs.clear(), [pairs]);
  useFrame((_, dt) => pairs.frame(dt));
  return null;
}

/** The pairs and their per-frame work, outside React. */
class PairsRunner {
  private clips: { crs: ClipSet | null; victim: ClipSet | null } = { crs: null, victim: null };
  private readonly director = new GrabDirector<Object3D>({
    crsBody: getCrsBody,
    victimBody: (id) => getAvatarBody(id)?.body ?? null,
    setPoseOwner,
    animator: (body, side) => {
      const clips = this.clips[side];
      return clips && frameOf(body) ? new Animator(body, clips) : null;
    },
    wasLying: (id) => performance.now() - (this.downAt.get(id) ?? -Infinity) < LYING_GRACE_MS,
    dress,
  });
  /** When (performance.now) each player was last seen down. */
  private readonly downAt = new Map<string, number>();
  private readonly grabbers: Grabber[] = [];
  private readonly grabbed: Grabbed[] = [];
  private readonly previous = new Map<string, string>();
  private readonly target: PairPose = { cx: 0, cz: 0, yaw: 0 };
  private readonly crs: Placed = { x: 0, z: 0, yaw: 0 };
  private readonly victim: Placed = { x: 0, z: 0, yaw: 0 };

  setClips(crs: ClipSet | null, victim: ClipSet | null): void {
    this.clips = { crs, victim };
  }

  clear(): void {
    this.director.clear();
  }

  frame(frameDt: number): void {
    const state = net.getState();
    // Disconnected, or the round not on (ended, back to the lobby): nobody is held.
    if (!state || state.phase !== Phase.Marching) {
      this.director.clear();
      return;
    }
    const { grabbers, grabbed } = this;
    grabbers.length = 0;
    grabbed.length = 0;
    state.crs.forEach((c, id) => {
      if (c.status !== CrsStatus.Grabbing || c.down) return;
      grabbers.push({ id, x: c.x, z: c.z, rotation: c.rotation, gap: crsRadius(c.kind, c.mount) + TRAIL_EXTRA });
    });
    const now = performance.now();
    state.players.forEach((p, id) => {
      if (p.down) this.downAt.set(id, now);
      if (p.status === PlayerStatus.Grabbed && !p.down && grabbers.length > 0) grabbed.push({ id, x: p.x, z: p.z });
    });
    this.director.sync(matchPairs(grabbers, grabbed, this.director.partners(this.previous)));

    const dt = Math.min(frameDt, MAX_STEP);
    for (const pair of this.director.pairs.values()) {
      const c = state.crs.get(pair.crsId);
      const p = state.players.get(pair.victimId);
      if (c && p) this.drive(pair, c.x, c.z, c.rotation, p.x, p.z, dt, frameDt);
    }
  }

  private drive(pair: Pair<Object3D>, crsX: number, crsZ: number, crsYaw: number, victimX: number, victimZ: number, dt: number, frameDt: number): void {
    // Measured speed of the pair (no velocity is synced): its server midpoint's change, over the real frame time.
    const mx = (crsX + victimX) / 2;
    const mz = (crsZ + victimZ) / 2;
    if (Number.isFinite(pair.lastX) && frameDt > 0) {
      const raw = Math.hypot(mx - pair.lastX, mz - pair.lastZ) / frameDt;
      pair.speed += (raw - pair.speed) * damp(SPEED_RATE, frameDt);
    }
    pair.lastX = mx;
    pair.lastZ = mz;

    const next = stepPhase(pair.phase, dt, pair.speed);
    const clips = PHASE_CLIPS[next.phase];
    if (next !== pair.phase || pair.fresh) {
      const opts = { fade: pair.fresh ? 0 : PHASE_FADE, timeScale: phaseTimeScale(next.phase, pair.speed) };
      for (const [a, name] of [[pair.crs, clips.crs], [pair.victim, clips.victim]] as const) {
        if (clips.loop) a.play(name, opts);
        else a.playOnce(name, { ...opts, hold: true });
      }
      pair.phase = next;
    } else if (next.phase === "drag") {
      const scale = phaseTimeScale("drag", pair.speed);
      pair.crs.setTimeScale(scale);
      pair.victim.setTimeScale(scale);
    }

    // Placement: one rigid pair around the server spots, eased there.
    const rel = clips.stance === "standing" ? STANDING : GROUND;
    // Bodies on one spot: the CRS faces the trail behind it.
    const target = targetPose(crsX, crsZ, victimX, victimZ, rel, crsYaw + Math.PI, this.target);
    const pose = pair.pose;
    if (pair.fresh) {
      // Start from where the avatars drew them, so the pair eases in.
      const cf = frameOf(pair.crsBody);
      const vf = frameOf(pair.victimBody);
      pose.cx = cf && vf ? (cf.root.position.x + vf.root.position.x) / 2 : target.cx;
      pose.cz = cf && vf ? (cf.root.position.z + vf.root.position.z) / 2 : target.cz;
      pose.yaw = cf ? cf.yaw.rotation.y : target.yaw;
      pair.fresh = false;
    }
    const k = damp(FOLLOW_RATE, frameDt);
    pose.cx += (target.cx - pose.cx) * k;
    pose.cz += (target.cz - pose.cz) * k;
    pose.yaw += turn(pose.yaw, target.yaw) * damp(TURN_RATE, frameDt);
    const { crs, victim } = this;
    placeBodies(pose, rel, crs, victim);
    // Never far from the server: hits and rescues land on what players see.
    clampDrift(crs, crsX, crsZ);
    clampDrift(victim, victimX, victimZ);
    put(pair.crsBody, crs);
    put(pair.victimBody, victim);

    pair.crs.update(dt);
    pair.victim.update(dt);
  }
}
