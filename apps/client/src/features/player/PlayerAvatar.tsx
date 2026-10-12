import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Vector3, type Group, type MeshStandardMaterial } from "three";
import { PLAYER_RADIUS, PlayerStatus } from "@manif/shared";
import { damp } from "../../shared/iso/index.ts";
import { net } from "../../shared/net/index.ts";
import { HealthBar } from "../health/index.ts";
import { RescueBar } from "../rescue/index.ts";
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
const LOCAL_COLOR = new Color("#ffca28");
const OTHER_COLOR = new Color("#42a5f5");
/** Grabbed, KO: the body goes a bit pale. */
const HURT_COLOR = new Color("#b0bec5");
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
const DUST_PUFFS: readonly [number, number][] = [
  [-0.25, -0.15],
  [0.25, -0.2],
  [0, -0.4],
];

/**
 * One player. Its position is interpolated towards the server state each frame.
 * While `down` (#2) the capsule tips over towards the push, pivoting at its
 * feet, and stands back up when `down` clears. All in useFrame: no React state
 * per frame. #26 replaces the tip-over with a ragdoll.
 *
 * Health (#3): KO lies flat like `down`, grabbed flails, arrested hides the
 * avatar (it is in the van), and a respawn snaps to the new spot instead of
 * sliding there across the street.
 */
export function PlayerAvatar({ id, name, isLocal }: { id: string; name: string; isLocal: boolean }) {
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

  useFrame((_, dt) => {
    const g = group.current;
    const t = tilt.current;
    const y = yaw.current;
    const p = net.getPlayer(id);
    if (!g || !t || !y || !p) return;

    const arrested = p.status === PlayerStatus.Arrested;
    g.visible = !arrested;
    // Back from the van: appear at the respawn point, standing.
    const respawned = lastStatus.current === PlayerStatus.Arrested && !arrested;
    lastStatus.current = p.status;
    if (arrested) return;

    if (!placed.current || respawned) {
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
    if (lying && fall.current < 0.3) {
      const hit = net.getLastImpulse(id);
      // No event seen (joined late): fall backwards.
      const dx = hit ? hit.dirX : -Math.sin(p.rotation);
      const dz = hit ? hit.dirZ : -Math.cos(p.rotation);
      // Rotating +Y about (dz, 0, -dx) by +90° lands it on (dx, 0, dz).
      fallAxis.set(dz, 0, -dx).normalize();
    }

    const target = lying ? 1 : 0;
    fall.current += (target - fall.current) * damp(lying ? FALL_RATE : GETUP_RATE, dt);
    if (Math.abs(target - fall.current) < 1e-3) fall.current = target;
    const angle = fall.current * FALLEN_ANGLE;
    t.quaternion.setFromAxisAngle(fallAxis, angle);
    // Lift the pivot as it tips, so the lying capsule rests on the ground instead of in it.
    t.position.y = Math.sin(angle) * PLAYER_RADIUS;

    // Grabbed: flail side to side (the drag itself is the CRS's, #5).
    const grabbed = p.status === PlayerStatus.Grabbed;
    flail.current = grabbed ? flail.current + dt * FLAIL_SPEED : 0;
    y.rotation.z = grabbed ? Math.sin(flail.current) * FLAIL_ANGLE : 0;
    // Swing (#4): raise the arm, then smash it down in front. The local one
    // plays at the click; others' on the server's swing event.
    const a = arm.current;
    if (a) {
      const swungAt = net.getLastSwing(id);
      const s = swungAt === undefined ? 1 : (performance.now() - swungAt) / SWING_MS;
      a.rotation.x =
        s >= 1 ? ARM_REST : s < 0.35 ? ARM_REST + (ARM_RAISED - ARM_REST) * (s / 0.35) : ARM_RAISED + (ARM_SMASH - ARM_RAISED) * ((s - 0.35) / 0.65);
    }

    // Dodge (#9): lean forward and squash into a dive, puff of dust where it started.
    const dodging = p.dodging && !lying;
    if (dodging && !wasDodging.current) {
      dustAge.current = 0;
      dustAt.set(g.position.x, 0, g.position.z);
    }
    wasDodging.current = dodging;
    dive.current += ((dodging ? 1 : 0) - dive.current) * damp(DODGE_RATE, dt);
    // Yaw last, so the lean (x) and the flail (z) are in the body's own frame.
    if (y.rotation.order !== "YXZ") y.rotation.order = "YXZ";
    y.rotation.x = dive.current * DODGE_LEAN;
    y.scale.set(1, 1 - (1 - DODGE_SQUASH) * dive.current, 1);
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

    body.current?.color.copy(grabbed || p.status === PlayerStatus.Ko ? HURT_COLOR : isLocal ? LOCAL_COLOR : OTHER_COLOR);
  });

  return (
    <group ref={group}>
      <group ref={tilt}>
        <group ref={yaw}>
          <mesh position-y={HEIGHT / 2} castShadow>
            <capsuleGeometry args={[PLAYER_RADIUS, CAPSULE_LENGTH, 4, 12]} />
            <meshStandardMaterial ref={body} color={isLocal ? LOCAL_COLOR : OTHER_COLOR} />
          </mesh>
          {/* Placeholder arm (#4), pivoting at the shoulder; it swings on attack. */}
          <group ref={arm} position={[PLAYER_RADIUS + 0.08, HEIGHT * 0.68, 0]} rotation-x={ARM_REST}>
            <mesh position-y={-0.35} castShadow>
              <boxGeometry args={[0.16, 0.7, 0.16]} />
              <meshStandardMaterial color="#8d6e63" />
            </mesh>
          </group>
          {/* Small nose so facing direction is visible. */}
          <mesh position={[0, HEIGHT * 0.7, PLAYER_RADIUS]} castShadow>
            <boxGeometry args={[0.2, 0.2, 0.3]} />
            <meshStandardMaterial color="#212121" />
          </mesh>
        </group>
      </group>
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
      {!isLocal && <HealthBar id={id} y={HEIGHT + 0.95} />}
      {/* Over everyone, the local player included: help is coming (#10). */}
      <RescueBar id={id} y={HEIGHT + 1.25} />
    </group>
  );
}
