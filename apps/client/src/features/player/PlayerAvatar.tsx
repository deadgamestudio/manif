import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Vector3, type Group, type MeshStandardMaterial } from "three";
import { PLAYER_RADIUS, PlayerStatus, type PlayerShape } from "@manif/shared";
import { damp } from "../../shared/iso/index.ts";
import { net } from "../../shared/net/index.ts";
import { HealthBar } from "../health/index.ts";
import { RescueBar } from "../rescue/index.ts";
import { CarriedItem } from "../throwable/index.ts";
import { COUGH_ANGLE, COUGH_SPEED } from "../gas/index.ts";
import { BodyFire, FireHoldBar, ON_FIRE_FLAIL_ANGLE, ON_FIRE_FLAIL_SPEED } from "../fire/index.ts";
import { PROTESTER_RAGDOLL, useRagdoll } from "../ragdoll/index.ts";
import { HopArc, LAND_SQUASH } from "../jump/index.ts";
import { CARRY_ARM_UP, CARRY_FLAIL_ANGLE, CARRY_FLAIL_SPEED, CARRY_LIFT, CARRY_LIFT_RATE } from "../carry/index.ts";
import { SKIN, archetypeLook } from "../archetype/index.ts";
import { NameTag } from "./NameTag.tsx";

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
 * colour everyone shares. The local player gets a ring on the ground.
 */
export function PlayerAvatar({
  id,
  name,
  isLocal,
  source = readPlayer,
}: {
  id: string;
  name: string;
  isLocal: boolean;
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
  /** The archetype drawn (#14). It only changes in the lobby, so a re-render then is fine. */
  const [archetype, setArchetype] = useState(() => source(id)?.archetype ?? 0);
  const look = archetypeLook(archetype);
  const [clothes, hurtClothes] = useMemo(() => {
    const c = new Color(look.clothes);
    return [c, c.clone().lerp(HURT_COLOR, HURT_MIX)];
  }, [look]);
  const Accessories = look.accessories;

  useFrame((_, dt) => {
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
      carryLift.current = 0;
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
      return;
    }

    const k = damp(15, dt);
    g.position.x += (p.x - g.position.x) * k;
    g.position.z += (p.z - g.position.z) * k;

    // Rotate along the shortest arc.
    let dr = p.rotation - y.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    y.rotation.y += dr * k;

    // Pick the fall direction at the start of the fall (the impulse event and
    // the `down` patch may arrive in either order, so keep looking briefly).
    const lying = p.down || p.status === PlayerStatus.Ko;
    // Hop (#45) and carried pose (#11): the height before this frame's update
    // is where the body was drawn, so a fall (a throw) that starts now starts from there (no pop).
    const drawnLift = hop.lift + carryLift.current;
    hop.update(dt, p.airborne && !lying);
    const carried = !!p.carriedBy && !lying;
    carryLift.current += ((carried ? CARRY_LIFT : 0) - carryLift.current) * damp(CARRY_LIFT_RATE, dt);
    if (carryLift.current < 1e-3) carryLift.current = 0;
    // Ragdoll (#26) if a slot is free: the capsule hides and stays upright meanwhile.
    const ragdolling = ragdoll.update(dt, lying, g.position.x, g.position.z, y.rotation.y, net.getLastImpulse(id), drawnLift);
    t.visible = !ragdolling;
    if (ragdolling) fall.current = 0;
    else if (lying && fall.current < 0.3) {
      const hit = net.getLastImpulse(id);
      // No event seen (joined late): fall backwards.
      const dx = hit ? hit.dirX : -Math.sin(p.rotation);
      const dz = hit ? hit.dirZ : -Math.cos(p.rotation);
      // Rotating +Y about (dz, 0, -dx) by +90° lands it on (dx, 0, dz).
      fallAxis.set(dz, 0, -dx).normalize();
    }

    const target = lying && !ragdolling ? 1 : 0;
    fall.current += (target - fall.current) * damp(lying ? FALL_RATE : GETUP_RATE, dt);
    if (Math.abs(target - fall.current) < 1e-3) fall.current = target;
    const angle = fall.current * FALLEN_ANGLE;
    t.quaternion.setFromAxisAngle(fallAxis, angle);
    // Lift the pivot as it tips, so the lying capsule rests on the ground instead of in it.
    t.position.y = Math.sin(angle) * PLAYER_RADIUS + hop.lift + carryLift.current;

    // Grabbed: flail side to side (the drag itself is the CRS's, #5). In tear
    // gas (#7): a slower, lopsided cough wobble.
    const grabbed = p.status === PlayerStatus.Grabbed;
    // On fire (#16): a frantic flail, wider and faster than a grab.
    const burning = !lying && p.onFire;
    const coughing = !grabbed && !burning && !lying && p.gassed;
    flail.current = burning
      ? flail.current + dt * ON_FIRE_FLAIL_SPEED
      : carried
        ? flail.current + dt * CARRY_FLAIL_SPEED
      : grabbed
        ? flail.current + dt * FLAIL_SPEED
        : coughing
          ? flail.current + dt * COUGH_SPEED
          : 0;
    y.rotation.z = burning
      ? Math.sin(flail.current) * ON_FIRE_FLAIL_ANGLE
      : carried
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
    wasDodging.current = dodging;
    dive.current += ((dodging ? 1 : 0) - dive.current) * damp(DODGE_RATE, dt);
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

    const color = grabbed || p.status === PlayerStatus.Ko ? hurtClothes : clothes;
    body.current?.color.copy(color);
    ragdoll.setColor(color);
  });

  return (
    <group ref={group}>
      <group ref={tilt}>
        <group ref={yaw}>
          <mesh position-y={HEIGHT / 2} castShadow>
            <capsuleGeometry args={[PLAYER_RADIUS, CAPSULE_LENGTH, 4, 12]} />
            <meshStandardMaterial ref={body} color={look.clothes} />
          </mesh>
          {/* The archetype's props (#14): placeholders until Jordan's models. */}
          {Accessories && <Accessories />}
          {/* Placeholder arm (#4), pivoting at the shoulder; it swings on attack and on a throw (#8). */}
          <group ref={arm} position={[PLAYER_RADIUS + 0.08, HEIGHT * 0.68, 0]} rotation-x={ARM_REST}>
            <mesh position-y={-0.35} castShadow>
              <boxGeometry args={[0.16, 0.7, 0.16]} />
              <meshStandardMaterial color={SKIN} />
            </mesh>
            {/* The item in hand (#8); the swing throws it. */}
            <CarriedItem id={id} />
          </group>
          {/* The bum on fire (#16). */}
          <BodyFire isOnFire={() => source(id)?.onFire === true} />
          {/* Small nose so facing direction is visible. */}
          <mesh position={[0, HEIGHT * 0.7, PLAYER_RADIUS]} castShadow>
            <boxGeometry args={[0.2, 0.2, 0.3]} />
            <meshStandardMaterial color="#212121" />
          </mesh>
        </group>
      </group>
      {/* Who you are (#14): a ring on the ground under the local player. */}
      {isLocal && (
        <mesh position-y={0.03} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[PLAYER_RADIUS + 0.12, PLAYER_RADIUS + 0.24, 28]} />
          <meshBasicMaterial color={LOCAL_RING} transparent opacity={0.85} depthWrite={false} />
        </mesh>
      )}
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
      <NameTag name={name} isLocal={isLocal} y={HEIGHT + 0.55} />
      {/* The local player's HP is in the HUD. */}
      {!isLocal && <HealthBar id={id} y={HEIGHT + 0.95} source={source} />}
      {/* Over everyone, the local player included: help is coming (#10). */}
      <RescueBar id={id} y={HEIGHT + 1.25} />
      {/* Lighting a prop or patting someone out (#16). */}
      <FireHoldBar id={id} y={HEIGHT + 1.25} />
    </group>
  );
}
