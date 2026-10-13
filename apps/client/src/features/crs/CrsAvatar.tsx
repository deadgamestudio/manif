import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Vector3, type Group, type MeshStandardMaterial, type Sprite } from "three";
import { CRS_STATS, CrsKind, CrsMount, CrsStatus, crsMaxHp, crsRadius } from "@manif/shared";
import { damp } from "../../shared/iso/index.ts";
import { net } from "../../shared/net/index.ts";
import { PROTESTER_RAGDOLL, useRagdoll } from "../ragdoll/index.ts";
import { NameTag, PlayerAvatar } from "../player/index.ts";
import { POMPIER_NOZZLE_Y, StinkCloud, crsLookFor, type CrsRig } from "./crsVisuals.tsx";
import { WaterJet } from "../water/index.ts";
import { disguiseSource, forgetDisguise } from "./disguise.ts";
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
/** A pompier spraying (#17): both arms forward on the hose, and the hose shaking a little. */
const ARM_HOSE = 1.5;
const HOSE_SHAKE_SPEED = 22;
const HOSE_SHAKE = 0.06;
/** The hose's reach and spread (#17): the jet drawn is the one the server uses. */
const HOSE = CRS_STATS[CrsKind.Pompier].hose;
const TUG_SPEED = 14;
const TUG_ANGLE = 0.25;
/** Stink cloud (#15): turns around the head and bobs, radians per second and metres. */
const STINK_SPIN = 1.6;
const STINK_BOB = 0.08;
/** Stunned: wobbles on the spot. */
const WOBBLE_SPEED = 9;
const WOBBLE_ANGLE = 0.3;
const HIT_FLASH_MS = 160;
/** Shield line shove (#6): the shield punches forward and comes back, ms and metres. */
const SHOVE_MS = 350;
const SHOVE_REACH = 0.45;
const FLASH = new Color("#ffffff");
const BAR_WIDTH = 0.8;
/** The BAC's reveal (#13): the placard shown over it for this long, ms, and the little "ta-da" pop. */
const REVEAL_TAG_MS = 3000;
const REVEAL_TAG = "C'était un BAC !";
const REVEAL_POP_MS = 350;
const REVEAL_POP = 0.35;

/** What decides how a bot is drawn (#13): its kind, what it rides, and a BAC's disguise. */
function lookKey(id: string): string {
  const c = net.getCrs(id);
  if (!c) return "";
  return `${c.kind}:${c.mount ?? CrsMount.Foot}:${c.revealed === false ? 0 : 1}`;
}

/**
 * One police bot (#5). Picks how to draw it, and redraws it when that
 * changes (#13): a disguised BAC is drawn by the protester's own avatar
 * (`PlayerAvatar`, fed by its bot state), so nothing tells it apart; once
 * revealed, or for any other unit, `CrsBody` with the look for its kind and
 * mount (a BRAV-M getting off or knocked off its bike swaps from the bike to
 * a rider on foot). Only re-renders when the look changes.
 */
export function CrsAvatar({ id }: { id: string }) {
  const [key, setKey] = useState(() => lookKey(id));
  useFrame(() => {
    const k = lookKey(id);
    if (k !== key && k !== "") setKey(k);
  });
  const c = net.getCrs(id);
  if (!c) return null;
  const kind = c.kind as CrsKind;
  if (kind === CrsKind.Bac && c.revealed === false) return <BacDisguise key={key} id={id} name={c.name} />;
  return <CrsBody key={key} id={id} kind={kind} mount={(c.mount ?? CrsMount.Foot) as CrsMount} />;
}

/** A BAC in plain clothes (#13): a protester like any other, same avatar, placard and HP bar. */
function BacDisguise({ id, name }: { id: string; name: string }) {
  useEffect(() => () => forgetDisguise(id), [id]);
  return <PlayerAvatar id={id} name={name} isLocal={false} source={disguiseSource} />;
}

/**
 * One police bot's body. Interpolated towards the server state each frame, like
 * PlayerAvatar. Ragdolls while down or out (#26, or tips over when too many
 * ragdolls are playing, or always for a bike), wobbles while stunned,
 * tugs with both arms while grabbing, swings its baton on the server's swing
 * event, flashes on a protester's hit. All in useFrame: no React state per frame.
 */
function CrsBody({ id, kind, mount }: { id: string; kind: CrsKind; mount: CrsMount }) {
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
  const splat = useRef<Group>(null);
  const stink = useRef<Group>(null);
  const stinkPhase = useRef(0);
  const bar = useRef<Group>(null);
  const barFill = useRef<Sprite>(null);
  // Kind and mount are fixed for this body (CrsAvatar remounts it when they change).
  const look = crsLookFor(kind, mount);
  const radius = crsRadius(kind, mount);
  const maxHp = crsMaxHp(kind, mount);
  const [uniform] = useState(() => new Color(look.color));
  // A bike has no ragdoll: it tips over (the hook still needs a look; it is never started).
  const ragdoll = useRagdoll(look.ragdoll ?? PROTESTER_RAGDOLL);
  /** A revealed BAC (#13): when this body appeared, for the placard and the pop. */
  const [shownAt] = useState(() => performance.now());
  const revealTag = useRef<Group>(null);

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
    const ragdolling = ragdoll.update(dt, lying && look.ragdoll !== null, g.position.x, g.position.z, y.rotation.y, net.getLastImpulse(id));
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
    t.position.y = Math.sin(angle) * radius;

    // The BAC's reveal (#13): a quick pop and its placard for a moment.
    if (kind === CrsKind.Bac) {
      const age = performance.now() - shownAt;
      const pop = age < REVEAL_POP_MS ? 1 + REVEAL_POP * Math.sin((age / REVEAL_POP_MS) * Math.PI) : 1;
      g.scale.setScalar(pop);
      if (revealTag.current) revealTag.current.visible = age < REVEAL_TAG_MS;
    }

    // Thrown-item statuses (#15): a red visor, a green cloud. A splatted CRS also wobbles like a stunned one.
    if (splat.current) splat.current.visible = c.splatted === true;
    const cloud = stink.current;
    if (cloud) {
      cloud.visible = c.stinky === true;
      if (cloud.visible) {
        stinkPhase.current += dt;
        cloud.rotation.y = stinkPhase.current * STINK_SPIN;
        cloud.position.y = look.height + 0.1 + Math.sin(stinkPhase.current * 3) * STINK_BOB;
      }
    }

    const grabbing = c.status === CrsStatus.Grabbing;
    const stunned = c.status === CrsStatus.Stunned || (c.splatted === true && !lying);
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
    if (baton && shield && kind === CrsKind.Pompier) {
      // A pompier (#17) never swings: arms up on the hose while spraying, down otherwise.
      const spraying = c.spraying === true && !lying;
      const shake = spraying ? Math.sin(performance.now() / 1000 * HOSE_SHAKE_SPEED) * HOSE_SHAKE : 0;
      baton.rotation.x = spraying ? ARM_HOSE + shake : ARM_REST;
      shield.rotation.x = spraying ? ARM_HOSE - shake : ARM_REST;
    } else if (baton && shield) {
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
      m.color.copy(uniform).lerp(FLASH, flash);
      ragdoll.setColor(m.color);
    }

    // HP bar only once hurt.
    const ratio = Math.max(0, Math.min(1, c.hp / maxHp));
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
          {look.render({ body: bodyMat, batonArm, shieldArm, lineShield, splat } satisfies CrsRig)}
          <BodyFire isOnFire={() => net.getCrs(id)?.onFire === true} />
          {kind === CrsKind.Pompier && HOSE && (
            <WaterJet
              isOn={() => {
                const s = net.getCrs(id);
                return s?.spraying === true && !s.down;
              }}
              range={HOSE.range}
              halfAngle={HOSE.halfAngle}
              y={POMPIER_NOZZLE_Y}
            />
          )}
        </group>
      </group>
      {look.ragdoll && ragdoll.view}
      <StinkCloud group={stink} height={look.height} />
      {kind === CrsKind.Bac && (
        <group ref={revealTag}>
          <NameTag name={REVEAL_TAG} isLocal y={look.height + 0.55} />
        </group>
      )}
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
