/*
 * Jordan's police models (#28): the CRS, the LBD, the BRAV-M on foot and on
 * its bike, the pompier and the revealed BAC, animated from their synced
 * state. CrsBody (CrsAvatar.tsx) mounts `PoliceModel` beside its placeholder
 * look; once the model and its clips are in, `PoliceModel` sets `link` and
 * CrsBody hides the placeholder and stops tipping it over or ragdolling it
 * (the model falls with its own clips). Until then, or if a file fails, the
 * placeholder stays.
 *
 * Which clip plays is decided in crsClips.ts. The game keeps drawing its own
 * tomato splat (here, on the model's head bone), stink cloud, fire, water
 * jet, laser and HP bar.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, useFrame, type RootState } from "@react-three/fiber";
import {
  AnimationClip,
  AnimationUtils,
  Frustum,
  Matrix4,
  MeshStandardMaterial,
  Vector3,
  type Group,
  type KeyframeTrack,
  type Material,
  type Object3D,
} from "three";
import { CrsKind, CrsMount, CrsStatus } from "@manif/shared";
import { damp } from "../../shared/iso/index.ts";
import { net } from "../../shared/net/index.ts";
import {
  MODELS,
  bodyUrlFor,
  clipsOf,
  cloneMaterials,
  cloneSkinned,
  cloneStatic,
  disposeMaterials,
  getPoseOwner,
  repaintCells,
  useAnimator,
  useClips,
  useGltf,
  useStaticModel,
  type Animator,
  type ClipSet,
  type GLTF,
} from "../models/index.ts";
import { chooseLoop, lyingClip, swingClip, type PoliceRole } from "./crsClips.ts";
import { Splat } from "./crsVisuals.tsx";
import { disguiseArchetype } from "./disguise.ts";
import { getLastThrow } from "./canisterThrows.ts";
import { setCrsBody, setLbdMuzzle } from "./crsBody.ts";
import { PLAIN_PAINT, POLICE_PAINT, wearPoliceBand } from "./policeBand.ts";

/** The tomato splat on a model's visor, in its head bone's frame (the head pivot is at 1.565 m, the visor about 0.12 above it). */
const SPLAT_AT: readonly [number, number, number] = [0, 0.12, 0.2];
const SPLAT_RADIUS = 0.4;
/** Hit flash (#5): how long the body glows white, ms. */
const HIT_FLASH_MS = 160;
/** The swing, shove and throw play faster than authored, so their contact lands near the server's hit. */
const SWING_SCALE = 1.8;
const SHOVE_SCALE = 1.5;
const THROW_SCALE = 1.6;
/** canister-throw: the canister leaves the hand here (s, as authored). */
const THROW_RELEASE = 0.85;
/** armband-reveal: the armband goes on here (s, as authored). */
const ARMBAND_AT = 1.375;
/** An LBD firing (#73): the launcher model kicks up and settles back, ms and radians (as the toy launcher, CrsAvatar). */
const RECOIL_MS = 260;
const RECOIL = 0.45;
/** The grab's wind-up (#70): the first part of `seize`, arms reaching out, then held. */
const WINDUP_FRAMES = 14;
const FPS = 24;
/** The passenger's hop off the bike, sped up: the rider it becomes is already on the street. */
const DISMOUNT_SCALE = 2.5;
/** A BRAV-M on foot that falls this soon after leaving its bike was knocked off it, ms. */
const FALL_OFF_WINDOW_MS = 600;
/** Bodies further off-screen than this (m around the feet) skip their mixer update. */
const SCREEN_MARGIN = 2.5;

/** Told by PoliceModel whether its model is drawn (CrsBody keeps it in a ref, read every frame). */
export type ModelLink = (on: boolean) => void;

/** The model for a bot of `kind` riding `mount`; `fromMount` is what it rode before this look (for the hop off, the fall). */
export function PoliceModel({ id, kind, mount, fromMount, link }: { id: string; kind: CrsKind; mount: CrsMount; fromMount: CrsMount | null; link: ModelLink }) {
  // Made once: the body copy is rebuilt whenever the spec changes.
  const spec = useMemo(() => footSpec(id, kind, fromMount), [id, kind, fromMount]);
  if (kind === CrsKind.BravM && (mount === CrsMount.Duo || mount === CrsMount.Solo)) return <BikeModel id={id} mount={mount} fromMount={fromMount} link={link} />;
  if (kind === CrsKind.BravM && mount === CrsMount.Wreck) return <WreckModel id={id} link={link} />;
  return <FootModel id={id} spec={spec} link={link} />;
}

// --- Bodies on foot --------------------------------------------------------

interface FootSpec {
  role: PoliceRole;
  url: string;
  /** Swapped in while splatted (the CRS: baton on the hip, a hand free to wipe the visor). */
  splatUrl: string | null;
  clips: readonly string[];
  /** Nodes of the body file not to draw (the LBD's shield). */
  hide: readonly string[];
  /** A baton in the right hand, taken from the CRS file (the BRAV-M rider has none). */
  baton: boolean;
  /** A canister for the throw, taken from the grenadier file. */
  canister: boolean;
  /** The BAC's armband, put on during armband-reveal. */
  armband: boolean;
  /** The LBD's launcher model (#100), in the left hand where the CRS holds its shield. */
  launcher: boolean;
  /** Just knocked off its bike: falls with fall-off rather than knockdown. */
  fromBike: boolean;
  /** Dressed as police (#109): navy uniform, "POLICE" band. Not the disguised BAC (nor the pompier). */
  police: boolean;
}

const POLICE_CLIPS = [
  MODELS.police.crs,
  MODELS.police.crsSplatted,
  MODELS.police.crsGrenadier,
  MODELS.clipLibraries.protesterCore,
  MODELS.clipLibraries.protesterExtra,
  MODELS.clipLibraries.grabCollarCrs,
] as const;
const SHIELD = ["shield-frame", "shield-panel"] as const;

function footSpec(id: string, kind: CrsKind, fromMount: CrsMount | null): FootSpec {
  const none = { splatUrl: null, hide: [], baton: false, canister: false, armband: false, launcher: false, fromBike: false, police: true };
  switch (kind) {
    case CrsKind.Pompier:
      return { ...none, police: false, role: "pompier", url: MODELS.characters.firefighter, clips: [MODELS.characters.firefighter, MODELS.clipLibraries.protesterCore, MODELS.clipLibraries.protesterExtra] };
    case CrsKind.Bac:
      return {
        ...none,
        role: "bac",
        // The same body as its disguise (PlayerAvatar picks it the same way).
        url: bodyUrlFor(disguiseArchetype(id), id),
        clips: [MODELS.clipLibraries.protesterCore, MODELS.clipLibraries.protesterExtra, MODELS.clipLibraries.bacReveal, MODELS.clipLibraries.grabCollarCrs],
        armband: true,
        // Must blend in with the protesters until revealed.
        police: false,
      };
    case CrsKind.BravM:
      return {
        ...none,
        role: "noShield",
        url: MODELS.police.bravRider,
        clips: [MODELS.police.bravRider, ...POLICE_CLIPS],
        baton: true,
        canister: true,
        fromBike: fromMount === CrsMount.Duo || fromMount === CrsMount.Solo,
      };
    case CrsKind.Lbd:
      return { ...none, role: "noShield", url: MODELS.police.crs, clips: POLICE_CLIPS, hide: SHIELD, canister: true, launcher: true };
    default:
      return { ...none, role: "crs", url: MODELS.police.crs, splatUrl: MODELS.police.crsSplatted, clips: POLICE_CLIPS, canister: true };
  }
}

/** One drawn copy of a body, with the pieces the driver moves. */
interface Body {
  root: Object3D;
  materials: Material[];
  head: Object3D | null;
  baton: Object3D | null;
  canister: Object3D | null;
  armband: Object3D | null;
  launcher: Object3D | null;
  /** The launcher's `muzzle` node: the laser starts there. */
  muzzle: Object3D | null;
}

interface Extras {
  police: boolean;
  hide: readonly string[];
  baton: GLTF | null;
  canister: GLTF | null;
  armband: GLTF | null;
  launcher?: GLTF | null;
}

/**
 * A skinned copy with its palette repainted (skin, police navy), unwanted nodes hidden, borrowed
 * props on its hands, and its own materials (for the hit flash). Dispose of
 * `materials` when done.
 */
function buildBody(gltf: GLTF, x: Extras): Body {
  const root = cloneSkinned(gltf);
  repaintCells(root, x.police ? POLICE_PAINT : PLAIN_PAINT);
  for (const name of x.hide) {
    const n = root.getObjectByName(name);
    if (n) n.visible = false;
  }
  // The splatted CRS's own splat: the game draws its own (bigger, readable on a phone).
  const ownSplat = root.getObjectByName("tomato-splat");
  if (ownSplat) ownSplat.visible = false;
  let baton = root.getObjectByName("baton") ?? null;
  if (!baton && x.baton) baton = borrow(root, x.baton, "baton", "hand_R");
  const canister = x.canister ? borrow(root, x.canister, "canister", "hand_R") : null;
  if (canister) canister.visible = false;
  const armband = x.armband ? wearArmband(root, x.armband) : null;
  const launcher = x.launcher ? holdLauncher(root, x.launcher) : null;
  const muzzle = launcher?.getObjectByName("muzzle") ?? null;
  const materials = cloneMaterials(root);
  // After cloneMaterials: the band's material stays shared (it doesn't flash).
  if (x.police) wearPoliceBand(root);
  return { root, materials, head: root.getObjectByName("head") ?? null, baton, canister, armband, launcher, muzzle };
}

function show(o: Object3D | null, visible: boolean): void {
  if (o) o.visible = visible;
}

function disposeBody(body: Body | null): void {
  if (body) disposeMaterials(body.materials);
}

/**
 * Copies prop `node` of another file onto `bone` of this body, with the
 * same local placement (every body shares the rig, so it fits). Geometry and
 * material are shared with that file until cloneMaterials.
 */
function borrow(root: Object3D, from: GLTF, node: string, bone: string): Object3D | null {
  const src = from.scene.getObjectByName(node);
  const b = root.getObjectByName(bone);
  if (!src || !b) return null;
  const copy = src.clone(true);
  copy.traverse((o) => {
    o.castShadow = true;
  });
  b.add(copy);
  return copy;
}

/**
 * The BAC armband (#13) on upper_arm_L. Jordan's placement: (0.23, 1.26, 0)
 * in the character's rig frame (Blender's (0.23, 0, 1.26)), scaled 1.4, then
 * attached to the bone keeping where it is. Hidden until the reveal puts it on.
 */
function wearArmband(root: Object3D, armband: GLTF): Object3D | null {
  const bone = root.getObjectByName("upper_arm_L");
  if (!bone) return null;
  let rig: Object3D = bone;
  while (rig.parent && rig.parent !== root) rig = rig.parent;
  const band = cloneStatic(armband);
  band.position.set(0.23, 1.26, 0);
  band.scale.setScalar(1.4);
  rig.add(band);
  root.updateMatrixWorld(true);
  bone.attach(band);
  band.visible = false;
  return band;
}

/**
 * The LBD's launcher (#100) in the left hand. The rig's `socket_hand_L` is
 * a prop socket: in the guard pose it is level and faces forward, so the
 * launcher (pivot at its grip, +Z forward) goes in it as is and follows the
 * hand through every clip. Falls back on the hand bone itself.
 */
function holdLauncher(root: Object3D, launcher: GLTF): Object3D | null {
  const socket = root.getObjectByName("socket_hand_L") ?? root.getObjectByName("hand_L");
  if (!socket) return null;
  const copy = cloneStatic(launcher);
  socket.add(copy);
  return copy;
}

/** A shot (#73) at `firedAt`: the launcher's muzzle kicks up about the grip and settles back. */
function recoil(launcher: Object3D | null, firedAt: number | undefined): void {
  if (!launcher) return;
  const r = firedAt === undefined ? 1 : (performance.now() - firedAt) / RECOIL_MS;
  launcher.rotation.x = r >= 1 ? 0 : -RECOIL * Math.sin(Math.min(1, r) * Math.PI) * (1 - r);
}

/** Driver state between frames. */
interface Track {
  animator: Animator | null;
  lying: boolean;
  out: boolean;
  windup: boolean;
  formation: boolean;
  swing: number | undefined;
  shove: number | undefined;
  thrown: number | undefined;
  flash: number;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  turn: number;
  /** Off-screen time not yet given to the mixer, s. */
  skipped: number;
  /** When this body was first driven (performance.now()). */
  born: number;
}

function FootModel({ id, spec, link }: { id: string; spec: FootSpec; link: ModelLink }) {
  const [splatBody, setSplatBody] = useState(false);
  const main = useGltf(spec.url);
  const alt = useGltf(spec.splatUrl && splatBody ? spec.splatUrl : null);
  const batonSrc = useGltf(spec.baton ? MODELS.police.crs : null);
  const canisterSrc = useGltf(spec.canister ? MODELS.police.crsGrenadier : null);
  const armbandSrc = useGltf(spec.armband ? MODELS.police.bacArmband : null);
  const launcherSrc = useGltf(spec.launcher ? MODELS.police.lbdLauncher : null);
  const gltf = alt ?? main;
  const hide = spec.hide;
  const police = spec.police;
  const body = useMemo(
    () => (gltf ? buildBody(gltf, { police, hide, baton: batonSrc, canister: canisterSrc, armband: armbandSrc, launcher: launcherSrc }) : null),
    [gltf, police, hide, batonSrc, canisterSrc, armbandSrc, launcherSrc],
  );
  useEffect(() => () => disposeBody(body), [body]);
  const clips = usePoliceClips(spec.clips);
  const animator = useAnimator(body?.root ?? null, clips);
  useModelLink(link, animator !== null);
  // A grab pair (#28, features/grab) reaches the body through this.
  useLayoutEffect(() => {
    if (!body || !animator) return;
    setCrsBody(id, body.root);
    return () => setCrsBody(id, null);
  }, [id, body, animator]);
  // The LBD's laser (#73) starts at the launcher model's muzzle once it is drawn (the toy launcher hides then).
  useLayoutEffect(() => {
    if (!body?.muzzle || !animator) return;
    setLbdMuzzle(id, body.muzzle);
    return () => setLbdMuzzle(id, null);
  }, [id, body, animator]);
  const splat = useRef<Group>(null);
  const t = useRef<Track>(freshTrack());
  const at = useRef(new Vector3());

  useFrame((state, dt) => {
    const c = net.getCrs(id);
    if (!c || !body || !animator) return;
    if (spec.splatUrl && c.splatted !== splatBody) setSplatBody(c.splatted);
    const s = t.current;
    const root = body.root;
    root.getWorldPosition(at.current);
    if (s.animator !== animator) {
      // A new body (first frame, or the splatted swap): start from now, don't replay old events.
      Object.assign(s, freshTrack(), { animator, x: at.current.x, z: at.current.z, yaw: c.rotation });
      s.swing = net.getLastSwing(id);
      s.shove = net.getLastShove(id);
      s.thrown = getLastThrow(id);
      if (spec.armband) revealArmband(animator, body.armband);
    }
    measure(s, at.current, c.rotation, dt);
    if (splat.current) splat.current.visible = c.splatted;
    s.flash = hitFlash(id, body.materials, s.flash);
    recoil(body.launcher, net.getLastLbdShot(id));
    if (body.baton && body.canister) {
      // The baton goes away while the canister is in hand.
      const throwing = animator.current === "canister-throw";
      show(body.baton, !throwing);
      if (!throwing) show(body.canister, false);
    }
    // A grab pair (#28, features/grab) drives this body itself.
    if (getPoseOwner(id) !== null) return;
    if (!onScreen(state, at.current)) {
      s.skipped = Math.min(1, s.skipped + dt);
      return;
    }

    const lying = c.down || c.status === CrsStatus.Out;
    const out = c.status === CrsStatus.Out;
    const windup = c.windup && !lying;
    if (lying) {
      if (!s.lying || (out && !s.out)) {
        // Knocked off its bike: fall-off (it starts in the saddle), only right after the swap from the bike.
        const offBike = spec.fromBike && !s.lying && performance.now() - s.born < FALL_OFF_WINDOW_MS && animator.has("fall-off");
        const name = offBike ? "fall-off" : lyingClip(out);
        animator.playOnce(name, { hold: true, fade: 0.12 });
      }
    } else if (s.lying) {
      animator.playOnce("get-up");
    } else if (windup && !s.windup) {
      animator.playOnce("windup", { hold: true, fade: 0.1 });
    } else if (!windup) {
      const swungAt = net.getLastSwing(id);
      const shovedAt = net.getLastShove(id);
      const thrownAt = getLastThrow(id);
      const swing = swingClip(spec.role);
      if (spec.role === "crs" && c.formation !== s.formation) {
        // Shield up into the line, down out of it (#6).
        animator.playOnce("shield-raise", c.formation ? {} : { reverse: true });
      } else if (swing && swungAt !== undefined && swungAt !== s.swing) {
        animator.playOnce(swing, { timeScale: SWING_SCALE, fade: 0.08 });
      } else if (shovedAt !== undefined && shovedAt !== s.shove) {
        animator.playOnce(spec.role === "crs" ? "shield-shove" : "baton-swing", { timeScale: SHOVE_SCALE, fade: 0.08 });
      } else if (thrownAt !== undefined && thrownAt !== s.thrown && animator.has("canister-throw")) {
        const can = body.canister;
        show(can, true);
        animator.playOnce("canister-throw", { timeScale: THROW_SCALE, fade: 0.1, events: [{ time: THROW_RELEASE, run: () => show(can, false) }] });
      }
      s.swing = swungAt;
      s.shove = shovedAt;
      s.thrown = thrownAt;
      // Loops wait for a one-shot to finish; a held one (the wind-up, a fall) gives way at once.
      if (!animator.busy || s.windup) {
        const loop = chooseLoop({
          role: spec.role,
          speed: s.speed,
          turnRate: s.turn,
          grabbing: c.status === CrsStatus.Grabbing,
          onFire: c.onFire,
          splatted: c.splatted,
          formation: c.formation,
          spraying: c.spraying,
        });
        animator.play(loop.name, { timeScale: loop.timeScale });
      }
    }
    s.lying = lying;
    s.out = out;
    s.windup = windup;
    s.formation = c.formation;
    animator.update(dt + s.skipped);
    s.skipped = 0;
  });

  if (!body || !animator) return null;
  return (
    <>
      <primitive object={body.root} dispose={null} />
      {body.head && createPortal(<Splat group={splat} radius={SPLAT_RADIUS} at={SPLAT_AT} />, body.head)}
    </>
  );
}

/** The BAC's reveal (#13): the gesture once, the armband appearing when the hand reaches the arm. */
function revealArmband(animator: Animator, armband: Object3D | null) {
  const putOn = () => show(armband, true);
  if (!animator.playOnce("armband-reveal", { fade: 0, events: [{ time: ARMBAND_AT, run: putOn }] })) putOn();
}

function freshTrack(): Track {
  return { animator: null, lying: false, out: false, windup: false, formation: false, swing: undefined, shove: undefined, thrown: undefined, flash: 0, x: 0, z: 0, yaw: 0, speed: 0, turn: 0, skipped: 0, born: performance.now() };
}

/** Ground speed and turn rate from the interpolated position and the facing, smoothed (nothing like a velocity is synced). */
function measure(s: Track, at: Vector3, yaw: number, dt: number) {
  if (dt <= 0) return;
  const k = damp(8, dt);
  const v = Math.hypot(at.x - s.x, at.z - s.z) / dt;
  let dy = yaw - s.yaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  s.speed += (Math.min(v, 20) - s.speed) * k;
  s.turn += (Math.abs(dy) / dt - s.turn) * k;
  s.x = at.x;
  s.z = at.z;
  s.yaw = yaw;
}

const WHITE = 1;
/** The white hit flash (#5) on a model's own materials. Returns this frame's strength. */
function hitFlash(id: string, materials: readonly Material[], was: number): number {
  const hitAt = net.getLastCrsHit(id);
  const flash = hitAt === undefined ? 0 : Math.max(0, 1 - (performance.now() - hitAt) / HIT_FLASH_MS);
  if (flash === 0 && was === 0) return 0;
  for (const m of materials) if (m instanceof MeshStandardMaterial) m.emissive.setScalar(flash * WHITE);
  return flash;
}

/** Tells `link` whether the model is drawn, and that it isn't any more on unmount. */
function useModelLink(link: ModelLink, on: boolean) {
  useEffect(() => {
    link(on);
    return () => link(false);
  }, [link, on]);
}

// --- Clips -----------------------------------------------------------------

const derived = new WeakMap<ClipSet, ClipSet>();

/**
 * The clips of `urls`, plus the two cut here: `windup` (the start of seize)
 * and `shield-lowered` (shield-raise's first frame, held). Made once per set.
 */
function usePoliceClips(urls: readonly string[]): ClipSet | null {
  const base = useClips(urls);
  return useMemo(() => {
    if (!base) return null;
    let set = derived.get(base);
    if (!set) {
      const more = new Map(base);
      const seize = base.get("seize");
      if (seize) more.set("windup", AnimationUtils.subclip(seize, "windup", 0, WINDUP_FRAMES, FPS));
      const raise = base.get("shield-raise");
      if (raise) more.set("shield-lowered", poseClip(raise, "shield-lowered"));
      set = more;
      derived.set(base, set);
    }
    return set;
  }, [base]);
}

/** A still pose: every track of `clip` held at its first key, as a one-second loop. */
function poseClip(clip: AnimationClip, name: string): AnimationClip {
  const tracks = clip.tracks.map((track) => {
    const v = Array.from(track.values.slice(0, track.getValueSize()));
    const Track = track.constructor as new (name: string, times: number[], values: number[]) => KeyframeTrack;
    return new Track(track.name, [0, 1], [...v, ...v]);
  });
  return new AnimationClip(name, 1, tracks);
}

// --- Off-screen ------------------------------------------------------------

const frustum = new Frustum();
const viewProj = new Matrix4();

/** Whether a body standing at `at` is near enough the screen to animate (a matrix product and six planes: cheap enough per body). */
function onScreen(state: RootState, at: Vector3): boolean {
  const cam = state.camera;
  viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  frustum.setFromProjectionMatrix(viewProj);
  return frustum.planes.every((p) => p.distanceToPoint(at) > -SCREEN_MARGIN);
}

// --- BRAV-M bike -----------------------------------------------------------

/**
 * The BRAV-M duo or driver alone on the bike (#13). Bike and riders share
 * one origin: the riders' clips already sit them in the saddles. When the
 * passenger is dropped (Duo becomes Solo), they hop off once (the rider it
 * becomes is already on the street, so the hop is quick) and vanish.
 */
const BIKE_EXTRAS: Extras = { police: true, hide: [], baton: null, canister: null, armband: null };

function BikeModel({ id, mount, fromMount, link }: { id: string; mount: CrsMount; fromMount: CrsMount | null; link: ModelLink }) {
  const bike = useStaticModel(MODELS.police.bravMotorbike);
  const hopping = mount === CrsMount.Solo && fromMount === CrsMount.Duo;
  const riderG = useGltf(MODELS.police.bravRider);
  const passengerG = useGltf(mount === CrsMount.Duo || hopping ? MODELS.police.bravPassenger : null);
  const rider = useMemo(() => (riderG ? buildBody(riderG, BIKE_EXTRAS) : null), [riderG]);
  const passenger = useMemo(() => (passengerG ? buildBody(passengerG, BIKE_EXTRAS) : null), [passengerG]);
  useEffect(() => () => disposeBody(rider), [rider]);
  useEffect(() => () => disposeBody(passenger), [passenger]);
  const riderA = useAnimator(rider?.root ?? null, riderG ? clipsOf(riderG) : null);
  const passengerA = useAnimator(passenger?.root ?? null, passengerG ? clipsOf(passengerG) : null);
  const needPassenger = mount === CrsMount.Duo || hopping;
  const ready = bike !== null && riderA !== null && (!needPassenger || passengerA !== null);
  useModelLink(link, ready);
  const splat = useRef<Group>(null);
  const flash = useRef(0);
  const hopped = useRef(false);
  const at = useRef(new Vector3());

  useFrame((state, dt) => {
    const c = net.getCrs(id);
    if (!c || !ready || !rider) return;
    if (splat.current) splat.current.visible = c.splatted;
    flash.current = hitFlash(id, passenger ? [...rider.materials, ...passenger.materials] : rider.materials, flash.current);
    rider.root.getWorldPosition(at.current);
    if (!onScreen(state, at.current)) return;
    riderA?.play("riding");
    riderA?.update(dt);
    if (passenger && passengerA) {
      if (mount === CrsMount.Duo) passengerA.play("riding");
      else if (!hopped.current) {
        hopped.current = true;
        passengerA.playOnce("dismount", { timeScale: DISMOUNT_SCALE, hold: true, fade: 0, onDone: () => show(passenger.root, false) });
      }
      passengerA.update(dt);
    }
  });

  if (!ready || !bike || !rider) return null;
  return (
    <>
      <primitive object={bike} dispose={null} />
      <primitive object={rider.root} dispose={null} />
      {passenger && needPassenger && <primitive object={passenger.root} dispose={null} />}
      {rider.head && createPortal(<Splat group={splat} radius={SPLAT_RADIUS} at={SPLAT_AT} />, rider.head)}
    </>
  );
}

/**
 * The empty bike (#13): tips over once, then lies there, wobbling while it
 * still skids. Both clips move the bike's root node; the file of bike-tip
 * is the one drawn.
 */
function WreckModel({ id, link }: { id: string; link: ModelLink }) {
  const tipG = useGltf(MODELS.police.bikeTip);
  const slideG = useGltf(MODELS.police.bikeSlide);
  const copy = useMemo(() => (tipG ? cloneStatic(tipG) : null), [tipG]);
  const clips = useMemo<ClipSet | null>(() => {
    if (!tipG || !slideG) return null;
    const tip = tipG.animations[0];
    const slide = slideG.animations[0];
    const set = new Map<string, AnimationClip>();
    if (tip) set.set("bike-tip", tip);
    if (slide) set.set("bike-slide", slide);
    return set;
  }, [tipG, slideG]);
  const animator = useAnimator(copy, clips);
  useModelLink(link, animator !== null);
  const tipped = useRef<"no" | "tipping" | "down">("no");
  const last = useRef<{ x: number; z: number } | null>(null);

  useFrame((_, dt) => {
    const c = net.getCrs(id);
    if (!c || !animator) return;
    if (tipped.current === "no") {
      tipped.current = "tipping";
      animator.playOnce("bike-tip", { hold: true, fade: 0, onDone: () => (tipped.current = "down") });
    }
    const was = last.current ?? c;
    const skidding = dt > 0 && Math.hypot(c.x - was.x, c.z - was.z) / dt > 0.3;
    last.current = { x: c.x, z: c.z };
    if (tipped.current === "down" && skidding && animator.has("bike-slide")) animator.play("bike-slide");
    animator.update(dt);
  });

  if (!copy || !animator) return null;
  return <primitive object={copy} dispose={null} />;
}

// --- Stunned ---------------------------------------------------------------

/** Above a stunned CRS's head (#5): Jordan's bonk stars, turning. Nothing while the file loads. */
export function BonkStars({ id, y }: { id: string; y: number }) {
  const gltf = useGltf(MODELS.effects.bonkStars);
  const copy = useMemo(() => (gltf ? cloneStatic(gltf) : null), [gltf]);
  const animator = useAnimator(copy, gltf ? clipsOf(gltf) : null);
  const group = useRef<Group>(null);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g || !animator) return;
    const c = net.getCrs(id);
    g.visible = c?.status === CrsStatus.Stunned && !c.down;
    if (!g.visible) return;
    animator.play("bonk-stars");
    animator.update(dt);
  });

  if (!copy) return null;
  return (
    <group ref={group} position-y={y} visible={false}>
      <primitive object={copy} dispose={null} />
    </group>
  );
}
