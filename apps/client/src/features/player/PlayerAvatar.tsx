import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, useFrame } from "@react-three/fiber";
import { Color, MeshBasicMaterial, RingGeometry, Vector3, type Group, type Mesh, type MeshStandardMaterial } from "three";
import { PLAYER_RADIUS, Phase, PlayerStatus, ThrowableKind, type PlayerShape } from "@manif/shared";
import { damp } from "../../shared/iso/index.ts";
import { net } from "../../shared/net/index.ts";
import { HealthBar } from "../health/index.ts";
import { RescueBar, StruggleBar } from "../rescue/index.ts";
import { CarriedItem } from "../throwable/index.ts";
import { COUGH_ANGLE, COUGH_SPEED } from "../gas/index.ts";
import { BodyFire, FireHoldBar, ON_FIRE_FLAIL_ANGLE, ON_FIRE_FLAIL_SPEED } from "../fire/index.ts";
import { PROTESTER_RAGDOLL, useRagdoll } from "../ragdoll/index.ts";
import { HopArc, LAND_SQUASH } from "../jump/index.ts";
import { CARRY_ARM_UP, CARRY_FLAIL_ANGLE, CARRY_FLAIL_SPEED, CARRY_LIFT, CARRY_LIFT_RATE } from "../carry/index.ts";
import { SKIN, archetypeLook } from "../archetype/index.ts";
import { MODELS, bodyUrlFor, getPoseOwner, useStaticModel } from "../models/index.ts";
import { NameTag } from "./NameTag.tsx";
import { actionClip, chooseStateClip } from "./clipChoice.ts";
import { onScreen } from "./onScreen.ts";
import { ringColorFor } from "./ringColor.ts";
import { BodyMotion } from "./bodyMotion.ts";
import { setAvatarBody, useProtesterBody } from "./protesterBody.ts";
import { protesterPaint } from "./protesterLook.ts";
import { accessoriesFor } from "./accessories.ts";
import { WornAccessories } from "./WornAccessories.tsx";
import { SWING_BUSY_MS, cgtKitFor, freshKitState, kitShow } from "./cgtKit.ts";
import { CgtKitView } from "./CgtKit.tsx";

const CAPSULE_LENGTH = 1;
const HEIGHT = CAPSULE_LENGTH + PLAYER_RADIUS * 2;
/** Lying flat on the ground. */
const FALLEN_ANGLE = Math.PI / 2;
/** Damping rates: falling is a quick flop, getting up a slower wobble back. */
const FALL_RATE = 14;
const GETUP_RATE = 7;
/** A grabbed protester flails: a quick side-to-side wobble, in radians and per second. */
const FLAIL_ANGLE = 0.35;
const FLAIL_SPEED = 18;
/** The local player's ring on the ground (#14: the body colour is the archetype's clothes now, for everyone). */
const LOCAL_RING = "#ffca28";
/**
 * The rings on the ground: one geometry for all, one material per colour,
 * made on first use and kept. Unlit and not tone mapped, so they read on the
 * dark road whatever the lighting; just over the road markings (0.005-0.02).
 */
const RING_Y = 0.03;
const RING_GEOMETRY = new RingGeometry(PLAYER_RADIUS + 0.1, PLAYER_RADIUS + 0.28, 32);
const ringMaterials = new Map<string, MeshBasicMaterial>();
function ringMaterial(color: string, opacity: number): MeshBasicMaterial {
  const key = `${color}/${opacity}`;
  let m = ringMaterials.get(key);
  if (!m) {
    m = new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });
    ringMaterials.set(key, m);
  }
  return m;
}
/**
 * The grace (#131): a pale ring just outside the others, blinking and
 * breathing while no CRS may baton or grab the player (just freed, back up or
 * back in the street). One geometry and one material for everyone.
 */
const GRACE_GEOMETRY = new RingGeometry(PLAYER_RADIUS + 0.34, PLAYER_RADIUS + 0.54, 32);
const GRACE_MATERIAL = new MeshBasicMaterial({ color: "#e3f6ff", transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
/** Blink period half (ms) and breathing (scale amplitude, per second). */
const GRACE_BLINK_MS = 130;
const GRACE_PULSE = 0.12;
const GRACE_PULSE_SPEED = 9;
/** Grabbed, KO: the clothes go a bit pale, towards this. */
const HURT_COLOR = new Color("#b0bec5");
const HURT_MIX = 0.6;
/** Melee swing (#4): a quick wind-up and smash of the placeholder arm, in ms and radians. */
const SWING_MS = 260;
const ARM_REST = -0.15;
const ARM_RAISED = 2.6;
const ARM_SMASH = -1.3;
/** Dodge (#9): a clumsy forward dive, leaning and squashed, in radians and scale. */
const DODGE_LEAN = 0.75;
const DODGE_SQUASH = 0.8;
const DODGE_RATE = 20;
/** Dust puff left where a dodge starts: primitives that grow and fade, in seconds and metres. */
const DUST_TIME = 0.45;
const DUST_GROW = 1.6;
/** Where an avatar reads the state it draws from. */
export type PlayerSource = (id: string) => PlayerShape | undefined;
const readPlayer: PlayerSource = (id) => net.getPlayer(id);

/** Jordan's body (#28): carried overhead, its pivot (the clip lies it across it) sits on the carrier's overhead socket, this high. */
const CARRIED_PIVOT = 1.95;
/** Grabbed or KO, the model's materials go a bit grey (they multiply the palette, so white is untouched). */
const MODEL_HURT = new Color("#aab4ba");
const MODEL_PLAIN = new Color("#ffffff");
/** A swing event older than this (ms) when first seen is not played (joined late, or the body just loaded). */
const SWING_FRESH_MS = 400;
/** Measured speed smoothing rate, per second. */
const SPEED_RATE = 10;
/** The bone the carried item rides on (the rig's name). */
const HAND_SOCKET = "socket_hand_R";
/** CarriedItem hangs its item this far below the placeholder arm's shoulder; in the hand socket it goes back up. */
const ITEM_IN_HAND_Y = 0.75;

const DUST_PUFFS: readonly [number, number][] = [
  [-0.25, -0.15],
  [0.25, -0.2],
  [0, -0.4],
];

/**
 * One player. Its position is interpolated towards the server state each frame.
 * While `down` (#2) the capsule is swapped for a floppy ragdoll (#26, see
 * features/ragdoll) pinned to that position and thrown along the hit, which
 * blends back into the capsule when `down` clears. With too many ragdolls
 * already playing, the capsule tips over towards the push instead, pivoting
 * at its feet. All in useFrame: no React state per frame.
 *
 * Health (#3): KO lies flat like `down`, grabbed flails, arrested hides the
 * avatar (it is in the van), and a respawn snaps to the new spot instead of
 * sliding there across the street.
 *
 * Carried (#11): lifted above the carrier's head (both bodies share a spot on
 * the server) and flailing; the carrier holds an arm up. Thrown, the ragdoll
 * starts from that height, so the pose flows into the flight without a pop.
 *
 * `source` reads the state it draws (the synced player by default). A
 * disguised BAC (#13) passes its own, so it is drawn by this very component
 * and looks exactly like any other protester.
 *
 * Archetype (#14): the clothes colour (capsule and ragdoll) and the
 * accessories come from `archetypeVisuals.tsx`; the arm keeps the one skin
 * colour everyone shares. The local player gets a ring on the ground, the other humans one in their own colour (ringColor.ts).
 *
 * Jordan's body (#28): once the archetype's model and the protester clips
 * have loaded, a skinned body replaces the capsule, the arm and the nose
 * (they stay as the placeholder until then, and for good if loading fails).
 * clipChoice.ts picks its clip from the same state; the ragdoll drives its
 * bones while `down`; the item in hand rides its hand socket. While
 * `getPoseOwner(id)` is set (a pair animation, #28), the avatar leaves the
 * body's clip and placement to that owner (see `getAvatarBody`).
 */
export function PlayerAvatar({
  id,
  name,
  isLocal,
  bot = false,
  source = readPlayer,
}: {
  id: string;
  name: string;
  isLocal: boolean;
  /** Wears the bot marker on its placard (#59): a bot protester, or a BAC blending in among bots. */
  bot?: boolean;
  source?: PlayerSource;
}) {
  const group = useRef<Group>(null);
  const tilt = useRef<Group>(null);
  const yaw = useRef<Group>(null);
  const placed = useRef(false);
  /** 0 standing, 1 lying flat. */
  const fall = useRef(0);
  /** Horizontal axis the body tips around, so its head goes along the push. */
  const [fallAxis] = useState(() => new Vector3(1, 0, 0));
  const body = useRef<MeshStandardMaterial>(null);
  const lastStatus = useRef<number>(PlayerStatus.Free);
  const flail = useRef(0);
  const arm = useRef<Group>(null);
  /** 0 upright, 1 fully into the dive. */
  const dive = useRef(0);
  const wasDodging = useRef(false);
  const dust = useRef<Group>(null);
  const dustMats = useRef<(MeshStandardMaterial | null)[]>([]);
  /** When (seconds of frame time) the current dust puff started, and where (world). */
  const dustAge = useRef(Infinity);
  const [dustAt] = useState(() => new Vector3());
  const ragdoll = useRagdoll(PROTESTER_RAGDOLL);
  /** The hop arc (#45): drawn from the synced `airborne` flag and local time. */
  const [hop] = useState(() => new HopArc());
  /** Height of the carried pose (#11), eased up when picked up and down when dropped. */
  const carryLift = useRef(0);
  /** The name tag and bars above the head, lifted with the carried pose. */
  const overhead = useRef<Group>(null);
  /** The archetype drawn (#14). It only changes in the lobby, so a re-render then is fine. */
  const [archetype, setArchetype] = useState(() => source(id)?.archetype ?? 0);
  const look = archetypeLook(archetype);
  const paint = useMemo(() => protesterPaint(archetype, id), [archetype, id]);
  const model = useProtesterBody(bodyUrlFor(archetype, id), paint);
  /** What it wears on top (#113), on the model's bones. */
  const wear = useMemo(() => accessoriesFor(archetype, bodyUrlFor(archetype, id), id), [archetype, id]);
  /** The CGT's barbecue or megaphone (#116), and what its hands are up to, filled each frame. */
  const kit = useMemo(() => cgtKitFor(archetype, id), [archetype, id]);
  const kitRef = useRef(freshKitState());
  const motion = useMemo(() => (model ? new BodyMotion(model.animator) : null), [model]);
  const footRing = useStaticModel(isLocal ? MODELS.ui.playerFootRing : null);
  const ringYaw = useRef<Group>(null);
  /** Measured ground speed (m/s), and where the body was last frame. */
  const speed = useRef(0);
  const [lastAt] = useState(() => new Vector3(Number.NaN, 0, 0));
  const seenSwing = useRef<number | undefined>(undefined);
  /** When (performance.now) an item was last in hand, for telling a throw from a swing. */
  const carriedItemAt = useRef(-Infinity);
  const wasRagdolling = useRef(false);
  const hurtShown = useRef(false);
  const hand = useMemo(() => model?.root.getObjectByName(HAND_SOCKET) ?? null, [model]);
  // The ragdoll drives this body's bones (#26). Before any frame, so the rest pose is still on the bones.
  useLayoutEffect(() => {
    ragdoll.bindBody(model?.root ?? null);
    return () => ragdoll.bindBody(null);
  }, [ragdoll, model]);
  useLayoutEffect(() => {
    const root = group.current;
    if (!model || !root) return;
    setAvatarBody(id, { root, body: model.root, animator: model.animator });
    return () => setAvatarBody(id, null);
  }, [id, model]);
  const [clothes, hurtClothes] = useMemo(() => {
    const c = new Color(look.clothes);
    return [c, c.clone().lerp(HURT_COLOR, HURT_MIX)];
  }, [look]);
  const Accessories = look.accessories;

  useFrame((state, dt) => {
    const g = group.current;
    const t = tilt.current;
    const y = yaw.current;
    const p = source(id);
    if (!g || !t || !y || !p) return;
    if ((p.archetype ?? 0) !== archetype) setArchetype(p.archetype ?? 0);

    const arrested = p.status === PlayerStatus.Arrested;
    g.visible = !arrested;
    // Back from the van: appear at the respawn point, standing.
    const respawned = lastStatus.current === PlayerStatus.Arrested && !arrested;
    lastStatus.current = p.status;
    if (arrested) {
      ragdoll.reset();
      hop.reset();
      motion?.reset();
      carryLift.current = 0;
      return;
    }
    const kitState = kitRef.current;
    kitState.posed = getPoseOwner(id) !== null;
    // A pair animation owns the body (#28): it places and animates it; only the bars stay ours.
    if (kitState.posed) {
      ragdoll.reset();
      wasRagdolling.current = false;
      lastAt.set(Number.NaN, 0, 0);
      return;
    }

    if (!placed.current || respawned) {
      ragdoll.reset();
      hop.reset();
      t.visible = true;
      g.position.set(p.x, 0, p.z);
      y.rotation.y = p.rotation;
      y.rotation.z = 0;
      fall.current = 0;
      placed.current = true;
      motion?.reset();
      return;
    }

    const k = damp(15, dt);
    g.position.x += (p.x - g.position.x) * k;
    g.position.z += (p.z - g.position.z) * k;

    // Measured speed (#28): no velocity is synced, so the drawn position's change.
    if (Number.isFinite(lastAt.x) && dt > 0) {
      const raw = Math.hypot(g.position.x - lastAt.x, g.position.z - lastAt.z) / dt;
      speed.current += (raw - speed.current) * damp(SPEED_RATE, dt);
    }
    lastAt.set(g.position.x, 0, g.position.z);

    // Carried with a model (#11): lying across the carrier's shoulders, so turned with them.
    const carrier = model && p.carriedBy ? net.getPlayer(p.carriedBy) : undefined;
    // Rotate along the shortest arc.
    let dr = (carrier ? carrier.rotation : p.rotation) - y.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    y.rotation.y += dr * k;

    // Pick the fall direction at the start of the fall (the impulse event and
    // the `down` patch may arrive in either order, so keep looking briefly).
    const ko = p.status === PlayerStatus.Ko;
    // With a model, a KO standing up plays its collapse (#28); one that comes while ragdolling stays a ragdoll.
    const lying = model ? p.down || (ko && wasRagdolling.current) : p.down || ko;
    // Hop (#45) and carried pose (#11): the height before this frame's update
    // is where the body was drawn, so a fall (a throw) that starts now starts from there (no pop).
    const drawnLift = hop.lift + carryLift.current;
    hop.update(dt, p.airborne && !lying);
    const carried = !!p.carriedBy && !lying;
    carryLift.current += ((carried ? (model ? CARRIED_PIVOT : CARRY_LIFT) : 0) - carryLift.current) * damp(CARRY_LIFT_RATE, dt);
    if (carryLift.current < 1e-3) carryLift.current = 0;
    if (overhead.current) overhead.current.position.y = carryLift.current;
    // Ragdoll (#26) if a slot is free: the capsule hides and stays upright meanwhile.
    const ragdolling = ragdoll.update(dt, lying, g.position.x, g.position.z, y.rotation.y, net.getLastImpulse(id), drawnLift);
    wasRagdolling.current = ragdolling;
    // A model stays drawn while ragdolling: the ragdoll poses its bones.
    t.visible = !!model || !ragdolling;
    if (ragdolling || model) fall.current = 0;
    else if (lying && fall.current < 0.3) {
      const hit = net.getLastImpulse(id);
      // No event seen (joined late): fall backwards.
      const dx = hit ? hit.dirX : -Math.sin(p.rotation);
      const dz = hit ? hit.dirZ : -Math.cos(p.rotation);
      // Rotating +Y about (dz, 0, -dx) by +90° lands it on (dx, 0, dz).
      fallAxis.set(dz, 0, -dx).normalize();
    }

    const target = lying && !ragdolling && !model ? 1 : 0;
    fall.current += (target - fall.current) * damp(lying ? FALL_RATE : GETUP_RATE, dt);
    if (Math.abs(target - fall.current) < 1e-3) fall.current = target;
    const angle = fall.current * FALLEN_ANGLE;
    t.quaternion.setFromAxisAngle(fallAxis, angle);
    // Lift the pivot as it tips, so the lying capsule rests on the ground instead of in it.
    t.position.y = Math.sin(angle) * PLAYER_RADIUS + hop.lift + carryLift.current;

    // Grabbed: flail side to side (the drag itself is the CRS's, #5). In tear
    // gas (#7): a slower, lopsided cough wobble.
    const grabbed = p.status === PlayerStatus.Grabbed;
    // On fire (#16): a frantic flail, wider and faster than a grab. A model has clips for these (#28): only the grab keeps its wobble.
    const burning = !model && !lying && p.onFire;
    const coughing = !model && !grabbed && !burning && !lying && p.gassed;
    flail.current = burning
      ? flail.current + dt * ON_FIRE_FLAIL_SPEED
      : carried && !model
        ? flail.current + dt * CARRY_FLAIL_SPEED
      : grabbed
        ? flail.current + dt * FLAIL_SPEED
        : coughing
          ? flail.current + dt * COUGH_SPEED
          : 0;
    y.rotation.z = burning
      ? Math.sin(flail.current) * ON_FIRE_FLAIL_ANGLE
      : carried && !model
        ? Math.sin(flail.current) * CARRY_FLAIL_ANGLE
      : grabbed
        ? Math.sin(flail.current) * FLAIL_ANGLE
        : coughing
        ? (Math.sin(flail.current) + 0.5 * Math.sin(flail.current * 2.3)) * COUGH_ANGLE
        : 0;
    // Swing (#4): raise the arm, then smash it down in front. The local one
    // plays at the click; others' on the server's swing event.
    const a = arm.current;
    if (a) {
      const swungAt = net.getLastSwing(id);
      const s = swungAt === undefined ? 1 : (performance.now() - swungAt) / SWING_MS;
      // Holding a teammate overhead (#11): the arm stays up.
      const rest = !lying && net.getCarried(id) !== null ? CARRY_ARM_UP : ARM_REST;
      a.rotation.x =
        s >= 1 ? rest : s < 0.35 ? ARM_REST + (ARM_RAISED - ARM_REST) * (s / 0.35) : ARM_RAISED + (ARM_SMASH - ARM_RAISED) * ((s - 0.35) / 0.65);
    }

    // Dodge (#9): lean forward and squash into a dive, puff of dust where it started.
    const dodging = p.dodging && !lying;
    // A hop (#45) kicks up the same dust where it takes off.
    if ((dodging && !wasDodging.current) || hop.tookOff) {
      dustAge.current = 0;
      dustAt.set(g.position.x, 0, g.position.z);
    }
    const dodgeStarted = dodging && !wasDodging.current;
    wasDodging.current = dodging;
    // A model dives with its own clip (#28): no lean or squash on top.
    dive.current += ((dodging && !model ? 1 : 0) - dive.current) * damp(DODGE_RATE, dt);
    // Yaw last, so the lean (x) and the flail (z) are in the body's own frame.
    if (y.rotation.order !== "YXZ") y.rotation.order = "YXZ";
    y.rotation.x = dive.current * DODGE_LEAN;
    // Squashed by the dive, and briefly on landing from a hop (#45).
    const land = 1 - LAND_SQUASH * hop.squash;
    y.scale.set(1 + LAND_SQUASH * 0.5 * hop.squash, (1 - (1 - DODGE_SQUASH) * dive.current) * land, 1 + LAND_SQUASH * 0.5 * hop.squash);
    const d = dust.current;
    if (d) {
      dustAge.current += dt;
      const life = dustAge.current / DUST_TIME;
      d.visible = life < 1;
      if (d.visible) {
        // The puff stays on the ground where the dive started while the body moves on.
        d.position.set(dustAt.x - g.position.x, 0.15, dustAt.z - g.position.z);
        d.rotation.y = y.rotation.y;
        d.scale.setScalar(0.4 + life * DUST_GROW);
        for (const m of dustMats.current) if (m) m.opacity = 0.7 * (1 - life);
      }
    }

    const hurt = grabbed || ko;
    kitState.grabbed = grabbed;
    kitState.carried = carried;
    kitState.carryingPlayer = net.getCarried(id) !== null;
    kitState.lying = lying || ko;
    kitState.holdingItem = p.carrying !== ThrowableKind.None;
    const lastSwing = net.getLastSwing(id);
    kitState.swinging = lastSwing !== undefined && performance.now() - lastSwing < SWING_BUSY_MS;
    kitState.dodging = dodging;
    kitState.fireBusy = p.onFire || p.fireHold > 0;
    const color = hurt ? hurtClothes : clothes;
    body.current?.color.copy(color);
    ragdoll.setColor(color);
    if (ringYaw.current) ringYaw.current.rotation.y = y.rotation.y;

    if (model && motion) {
      if (hurt !== hurtShown.current) {
        hurtShown.current = hurt;
        for (const m of model.materials) (m as MeshStandardMaterial).color?.copy(hurt ? MODEL_HURT : MODEL_PLAIN);
      }
      const now = performance.now();
      if (p.carrying) carriedItemAt.current = now;
      const swungAt = net.getLastSwing(id);
      const swung = swungAt !== undefined && swungAt !== seenSwing.current && now - swungAt < SWING_FRESH_MS;
      seenSwing.current = swungAt;
      // While the ragdoll owns the bones, the clips wait.
      if (!ragdolling) {
        if (swung && !lying) motion.act(actionClip("swing", p.carrying ? 0 : now - carriedItemAt.current));
        if (dodgeStarted) motion.act(actionClip("dodge", Infinity));
        const phase = net.getState()?.phase;
        const choice = chooseStateClip({
          speed: speed.current,
          ko: ko && !lying,
          lyingFallback: lying,
          carried,
          grabbed,
          onFire: p.onFire,
          carryingPlayer: net.getCarried(id) !== null,
          fireHold: p.fireHold > 0,
          gassed: p.gassed,
          carrying: p.carrying,
          celebrating: phase === Phase.Ended,
        });
        motion.drive(choice, speed.current);
        motion.tick(dt, onScreen(state.camera, state.clock.elapsedTime, g.position.x, 1, g.position.z, 1.6));
      }
      ragdoll.afterAnimate();
    }
  });

  return (
    <group ref={group}>
      <group ref={tilt}>
        <group ref={yaw}>
          {model ? (
            <>
              {/* Jordan's body (#28), its props on: the item in hand rides the hand socket. */}
              <primitive object={model.root} dispose={null} />
              {hand &&
                createPortal(
                  <group position-y={ITEM_IN_HAND_Y}>
                    <CarriedItem id={id} />
                  </group>,
                  hand,
                )}
              {wear.length > 0 && <WornAccessories root={model.root} wear={wear} stowTall={() => stowsTall(id, source)} />}
              {kit && <CgtKitView root={model.root} kit={kit} show={() => kitShow(kit, kitRef.current)} />}
            </>
          ) : (
            <>
              <mesh position-y={HEIGHT / 2} castShadow>
                <capsuleGeometry args={[PLAYER_RADIUS, CAPSULE_LENGTH, 4, 12]} />
                <meshStandardMaterial ref={body} color={look.clothes} />
              </mesh>
              {/* The archetype's props (#14): placeholders until Jordan's models. */}
              {Accessories && <Accessories />}
              {/* Small nose so facing direction is visible. */}
              <mesh position={[0, HEIGHT * 0.7, PLAYER_RADIUS]} castShadow>
                <boxGeometry args={[0.2, 0.2, 0.3]} />
                <meshStandardMaterial color="#212121" />
              </mesh>
            </>
          )}
          {/* Placeholder arm (#4), pivoting at the shoulder; it swings on attack and on a throw (#8). */}
          <group ref={arm} position={[PLAYER_RADIUS + 0.08, HEIGHT * 0.68, 0]} rotation-x={ARM_REST} visible={!model}>
            <mesh position-y={-0.35} castShadow>
              <boxGeometry args={[0.16, 0.7, 0.16]} />
              <meshStandardMaterial color={SKIN} />
            </mesh>
            {/* The item in hand (#8); the swing throws it. */}
            {!model && <CarriedItem id={id} />}
          </group>
          {/* The bum on fire (#16). */}
          <BodyFire isOnFire={() => source(id)?.onFire === true} />
        </group>
      </group>
      {/* Who you are (#14): a ring on the ground under the local player, Jordan's (#28) once loaded, its arrow turned with the body. */}
      {isLocal &&
        (footRing ? (
          <group ref={ringYaw}>
            <primitive object={footRing} dispose={null} />
          </group>
        ) : (
          <GroundRing material={ringMaterial(LOCAL_RING, 0.9)} />
        ))}
      {/* The other humans (#28): a ring in their own colour, to pick friends out of a dark crowd. Bots get none. On the root, so it stays flat on the ground whatever the body does. */}
      {!isLocal && !bot && <GroundRing material={ringMaterial(ringColorFor(id), 0.95)} />}
      {/* Their grace (#131): no CRS baton or grab for a moment, bots included. */}
      <GraceRing id={id} source={source} />
      {/* The ragdoll (#26), in world space under the root: never tilted or turned with the capsule. */}
      {ragdoll.view}
      {/* Still on fire while ragdolling (#16): the flames ride the ragdoll's pelvis. */}
      <BodyFire isOnFire={() => source(id)?.onFire === true} anchor={(out) => ragdoll.torso(out)} />
      {/* Dodge dust (#9): placeholder primitives until Jordan's effects. */}
      <group ref={dust} visible={false}>
        {DUST_PUFFS.map(([x, z], i) => (
          <mesh key={`${x},${z}`} position={[x, 0, z]}>
            <sphereGeometry args={[0.18, 8, 6]} />
            <meshStandardMaterial
              ref={(m) => {
                dustMats.current[i] = m;
              }}
              color="#d7ccc8"
              transparent
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
      {/* Rides up with the carried pose (#11), so a carried player's tag sits above the carrier's instead of on it. */}
      <group ref={overhead}>
        <NameTag name={name} isLocal={isLocal} bot={bot} y={HEIGHT + 0.55} />
        {/* The local player's HP is in the HUD. */}
        {!isLocal && <HealthBar id={id} y={HEIGHT + 0.95} source={source} />}
        {/* Over everyone, the local player included: help is coming (#10). */}
        <RescueBar id={id} y={HEIGHT + 1.25} />
        {/* Their own struggle to break free (#70), above any rescue in progress. */}
        <StruggleBar id={id} y={HEIGHT + 1.5} />
        {/* Lighting a prop or patting someone out (#16). */}
        <FireHoldBar id={id} y={HEIGHT + 1.25} />
      </group>
    </group>
  );
}

/** The grace ring (#131): shown only while `grace` is synced on, blinking and breathing; nothing allocated per frame. */
function GraceRing({ id, source }: { id: string; source: PlayerSource }) {
  const ref = useRef<Mesh>(null);
  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    const on = source(id)?.grace === true;
    m.visible = on && Math.floor(performance.now() / GRACE_BLINK_MS) % 3 !== 0;
    if (on) m.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * GRACE_PULSE_SPEED) * GRACE_PULSE);
  });
  return <mesh ref={ref} visible={false} position-y={RING_Y + 0.004} rotation-x={-Math.PI / 2} geometry={GRACE_GEOMETRY} material={GRACE_MATERIAL} dispose={null} />;
}

/** A flat ring on the ground around the feet, casting no shadow. */
function GroundRing({ material }: { material: MeshBasicMaterial }) {
  return <mesh position-y={RING_Y} rotation-x={-Math.PI / 2} geometry={RING_GEOMETRY} material={material} dispose={null} />;
}

/**
 * A flag or a placard on the back would go through another body: put away
 * while grabbed or carried, carrying someone overhead, or in a pair animation.
 */
function stowsTall(id: string, source: PlayerSource): boolean {
  const p = source(id);
  return p?.status === PlayerStatus.Grabbed || !!p?.carriedBy || net.getCarried(id) !== null || getPoseOwner(id) !== null;
}
