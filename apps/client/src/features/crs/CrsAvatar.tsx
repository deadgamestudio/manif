import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Vector3, type Group, type MeshStandardMaterial, type Sprite } from "three";
import { CRS_STATS, CrsKind, CrsStatus } from "@manif/shared";
import { damp } from "../../shared/iso/index.ts";
import { net } from "../../shared/net/index.ts";
import { useRagdoll } from "../ragdoll/index.ts";
import { CRS_LOOKS, type CrsRig } from "./crsVisuals.tsx";
import { BodyFire, ON_FIRE_FLAIL_ANGLE, ON_FIRE_FLAIL_SPEED } from "../fire/index.ts";

const FALLEN_ANGLE = Math.PI / 2;
const FALL_RATE = 14;
const GETUP_RATE = 7;
/** Baton swing (#5): wind-up then smash, ms and radians. */
const SWING_MS = 300;
const ARM_REST = -0.2;
const ARM_RAISED = 2.7;
const ARM_SMASH = -1.2;
/** Grabbing: both arms out in front, tugging. */
const ARM_GRAB = 1.3;
const TUG_SPEED = 14;
const TUG_ANGLE = 0.25;
/** Stunned: wobbles on the spot. */
const WOBBLE_SPEED = 9;
const WOBBLE_ANGLE = 0.3;
const HIT_FLASH_MS = 160;
/** Shield line shove (#6): the shield punches forward and comes back, ms and metres. */
const SHOVE_MS = 350;
const SHOVE_REACH = 0.45;
const UNIFORM = new Color("#1a2a4a");
const FLASH = new Color("#ffffff");
const BAR_WIDTH = 0.8;

/**
 * One police bot. Interpolated towards the server state each frame, like
 * PlayerAvatar. Ragdolls while down or out (#26, or tips over when too many
 * ragdolls are playing), wobbles while stunned,
 * tugs with both arms while grabbing, swings its baton on the server's swing
 * event, flashes on a protester's hit. All in useFrame: no React state per frame.
 */
export function CrsAvatar({ id }: { id: string }) {
  const group = useRef<Group>(null);
  const tilt = useRef<Group>(null);
  const yaw = useRef<Group>(null);
  const placed = useRef(false);
  const fall = useRef(0);
  const [fallAxis] = useState(() => new Vector3(1, 0, 0));
  const phase = useRef(0);
  // Pieces of the look (crsVisuals) we animate.
  const bodyMat = useRef<MeshStandardMaterial>(null);
  const batonArm = useRef<Group>(null);
  const shieldArm = useRef<Group>(null);
  const lineShield = useRef<Group>(null);
  const bar = useRef<Group>(null);
  const barFill = useRef<Sprite>(null);
  // The kind never changes for a bot; read it once.
  const [kind] = useState(() => (net.getCrs(id)?.kind ?? CrsKind.Crs) as CrsKind);
  const look = CRS_LOOKS[kind] ?? CRS_LOOKS[CrsKind.Crs];
  const stats = CRS_STATS[kind] ?? CRS_STATS[CrsKind.Crs];
  const ragdoll = useRagdoll(look.ragdoll);

  useFrame((_, dt) => {
    const g = group.current;
    const t = tilt.current;
    const y = yaw.current;
    const c = net.getCrs(id);
    if (!g || !t || !y) return;
    g.visible = c !== undefined;
    if (!c) {
      ragdoll.reset();
      return;
    }

    if (!placed.current) {
      g.position.set(c.x, 0, c.z);
      y.rotation.y = c.rotation;
      placed.current = true;
    }
    const k = damp(15, dt);
    g.position.x += (c.x - g.position.x) * k;
    g.position.z += (c.z - g.position.z) * k;
    let dr = c.rotation - y.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    y.rotation.y += dr * k;

    // Fall over like a bowling pin, along the last push.
    const lying = c.down || c.status === CrsStatus.Out;
    const ragdolling = ragdoll.update(dt, lying, g.position.x, g.position.z, y.rotation.y, net.getLastImpulse(id));
    t.visible = !ragdolling;
    if (ragdolling) fall.current = 0;
    else if (lying && fall.current < 0.3) {
      const hit = net.getLastImpulse(id);
      const dx = hit ? hit.dirX : -Math.sin(c.rotation);
      const dz = hit ? hit.dirZ : -Math.cos(c.rotation);
      fallAxis.set(dz, 0, -dx).normalize();
    }
    const target = lying && !ragdolling ? 1 : 0;
    fall.current += (target - fall.current) * damp(lying ? FALL_RATE : GETUP_RATE, dt);
    if (Math.abs(target - fall.current) < 1e-3) fall.current = target;
    const angle = fall.current * FALLEN_ANGLE;
    t.quaternion.setFromAxisAngle(fallAxis, angle);
    t.position.y = Math.sin(angle) * stats.radius;

    const grabbing = c.status === CrsStatus.Grabbing;
    const stunned = c.status === CrsStatus.Stunned;
    // On fire (#16): flails like a protester on fire.
    const burning = c.onFire === true && !lying;
    phase.current = grabbing || stunned || burning ? phase.current + dt : 0;
    y.rotation.z = burning
      ? Math.sin(phase.current * ON_FIRE_FLAIL_SPEED) * ON_FIRE_FLAIL_ANGLE
      : stunned
        ? Math.sin(phase.current * WOBBLE_SPEED) * WOBBLE_ANGLE
        : 0;

    const baton = batonArm.current;
    const shield = shieldArm.current;
    if (baton && shield) {
      if (grabbing) {
        // Clumsy tug of war.
        const tug = Math.sin(phase.current * TUG_SPEED) * TUG_ANGLE;
        baton.rotation.x = ARM_GRAB + tug;
        shield.rotation.x = ARM_GRAB - tug;
      } else {
        const swungAt = net.getLastSwing(id);
        const s = swungAt === undefined ? 1 : (performance.now() - swungAt) / SWING_MS;
        baton.rotation.x =
          s >= 1 ? ARM_REST : s < 0.35 ? ARM_REST + (ARM_RAISED - ARM_REST) * (s / 0.35) : ARM_RAISED + (ARM_SMASH - ARM_RAISED) * ((s - 0.35) / 0.65);
        shield.rotation.x = 0;
      }
    }

    // Shield line (#6): the riot shield replaces the arm shield, and punches forward on a shove.
    const riot = lineShield.current;
    if (riot) {
      riot.visible = c.formation === true;
      if (shield) shield.visible = !riot.visible;
      const shovedAt = net.getLastShove(id);
      const s = shovedAt === undefined ? 1 : (performance.now() - shovedAt) / SHOVE_MS;
      riot.position.z = s >= 1 ? 0 : Math.sin(Math.min(1, s) * Math.PI) * SHOVE_REACH;
    }

    const hitAt = net.getLastCrsHit(id);
    const flash = hitAt === undefined ? 0 : Math.max(0, 1 - (performance.now() - hitAt) / HIT_FLASH_MS);
    const m = bodyMat.current;
    if (m) {
      m.color.copy(UNIFORM).lerp(FLASH, flash);
      ragdoll.setColor(m.color);
    }

    // HP bar only once hurt.
    const ratio = Math.max(0, Math.min(1, c.hp / stats.maxHp));
    if (bar.current) bar.current.visible = ratio < 1 && c.status !== CrsStatus.Out;
    const f = barFill.current;
    if (f && ratio > 0) {
      f.scale.x = BAR_WIDTH * ratio;
      f.center.set(0.5 / ratio, 0.5);
    }
  });

  return (
    <group ref={group}>
      <group ref={tilt}>
        <group ref={yaw}>
          {look.render({ body: bodyMat, batonArm, shieldArm, lineShield } satisfies CrsRig)}
          <BodyFire isOnFire={() => net.getCrs(id)?.onFire === true} />
        </group>
      </group>
      {ragdoll.view}
      {/* Still on fire while ragdolling (#16): the flames ride the ragdoll's pelvis. */}
      <BodyFire isOnFire={() => net.getCrs(id)?.onFire === true} anchor={(out) => ragdoll.torso(out)} />
      <group ref={bar} position-y={look.height + 0.4} visible={false}>
        <sprite scale={[BAR_WIDTH + 0.06, 0.13, 1]} renderOrder={10}>
          <spriteMaterial color="#141414" depthTest={false} depthWrite={false} />
        </sprite>
        <sprite ref={barFill} scale={[BAR_WIDTH, 0.07, 1]} renderOrder={11}>
          <spriteMaterial color="#4f8cff" depthTest={false} depthWrite={false} />
        </sprite>
      </group>
    </group>
  );
}

/** Every police bot on the street (#5). Re-renders only when one appears or is removed. */
export function CrsView({ ids }: { ids: readonly string[] }) {
  return (
    <>
      {ids.map((id) => (
        <CrsAvatar key={id} id={id} />
      ))}
    </>
  );
}
