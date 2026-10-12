import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Vector3, type Group, type MeshStandardMaterial } from "three";
import { PLAYER_RADIUS, PlayerStatus } from "@manif/shared";
import { damp } from "../../shared/iso/index.ts";
import { net } from "../../shared/net/index.ts";
import { HealthBar } from "../health/index.ts";
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
          {/* Small nose so facing direction is visible. */}
          <mesh position={[0, HEIGHT * 0.7, PLAYER_RADIUS]} castShadow>
            <boxGeometry args={[0.2, 0.2, 0.3]} />
            <meshStandardMaterial color="#212121" />
          </mesh>
        </group>
      </group>
      <NameTag name={name} isLocal={isLocal} y={HEIGHT + 0.55} />
      {/* The local player's HP is in the HUD. */}
      {!isLocal && <HealthBar id={id} y={HEIGHT + 0.95} />}
    </group>
  );
}
