/*
 * PLACEHOLDER LOOKS for police bots (#5, #13), all in this one file, so real
 * models (Jordan's) can replace them here without touching the logic in
 * CrsAvatar. One look per unit kind and mount:
 * - CRS: a dark blue capsule with a helmet, a visor, a shield and a baton arm.
 * - BAC once revealed (#13): a protester's capsule with an orange armband.
 *   Before that it is not drawn here at all: CrsAvatar draws it with the
 *   protester's own avatar.
 * - BRAV-M (#13): on foot, black with a motorbike helmet and no shield; on
 *   the bike, a long low box on two wheels with one or two riders; the wreck
 *   is the bike alone.
 * - Pompier (#17, not police): a navy capsule with yellow reflective bands,
 *   a yellow helmet with a red stripe, and a brass hose nozzle in hand. The
 *   water jet itself is the water feature's (WaterJet).
 * - CRS LBD (#73): a CRS without a shield, with bright orange bands on the
 *   uniform and the helmet, and a fat, stubby, toy-coloured launcher held
 *   forward in the left hand. Clearly a toy: no realistic gun.
 * Sizes come from CRS_STATS (crsRadius), so what you see is what you bump into.
 *
 * Jordan's models (#28, policeModels.tsx) replace `render` once they are in;
 * these looks stay as the stand-in while they load, or if a file fails.
 */
import type { ReactNode, RefObject } from "react";
import type { Group, MeshStandardMaterial } from "three";
import { CRS_STATS, CrsKind, CrsMount, LINE_SHIELD_RADIUS, PLAYER_RADIUS } from "@manif/shared";
import { PROTESTER_RAGDOLL, crsRagdoll, pompierRagdoll, type RagdollLook } from "../ragdoll/index.ts";

/** Refs CrsAvatar animates. A real model should expose the same pieces. */
export interface CrsRig {
  /** Uniform body colour, flashed white on a hit. */
  body: RefObject<MeshStandardMaterial | null>;
  /** Baton arm, pivoting at the shoulder (rotation-x swings it). */
  batonArm: RefObject<Group | null>;
  /** Shield arm, pivoting at the shoulder (pushed forward while grabbing). Hidden in a shield line. */
  shieldArm: RefObject<Group | null>;
  /**
   * The big riot shield held up in front in a shield line (#6), as wide as
   * the shield's collision reach. Shown only in formation; CrsAvatar moves it
   * forward on a shove (its rest position is z = 0 in this group).
   */
  lineShield: RefObject<Group | null>;
  /** A splatted tomato on the visor (#15). Shown only while `splatted`. */
  splat: RefObject<Group | null>;
}

export interface CrsLook {
  /** Total height, for the HP bar above it. */
  height: number;
  /** Body colour, flashed white on a hit (CrsAvatar resets it every frame). */
  color: string;
  render: (rig: CrsRig) => ReactNode;
  /** Pieces still drawn over Jordan's model (#28): the LBD's toy launcher, which has no model yet. */
  Keep?: (props: { rig: CrsRig }) => ReactNode;
  /**
   * Its floppy look while knocked down (#26); the primitives are in
   * ragdoll/ragdollVisuals.tsx. Null: it simply tips over (a bike).
   */
  ragdoll: RagdollLook | null;
}

const CAPSULE_LENGTH = 1.05;

/** Drips and bits of the tomato splat (#15): x, y, radius, as fractions of the CRS radius. */
const SPLAT_DRIPS: readonly (readonly [number, number, number])[] = [
  [-0.35, -0.3, 0.1],
  [0.25, -0.38, 0.08],
  [0.45, 0.15, 0.09],
  [-0.5, 0.1, 0.07],
];

/** Puffs of the stink cloud (#15): angle around the head (radians), height, size. */
const STINK_PUFFS: readonly (readonly [number, number, number])[] = [
  [0, 0.1, 0.38],
  [2.1, 0.3, 0.32],
  [4.2, 0.05, 0.35],
  [1.0, 0.55, 0.26],
  [3.3, 0.6, 0.24],
];

/**
 * The little green stink cloud over a stinky CRS (#15). Mount it outside the
 * tilted body (it stays upright); CrsAvatar shows it and turns `group`.
 */
export function StinkCloud({ group, height }: { group: RefObject<Group | null>; height: number }) {
  return (
    <group ref={group} position-y={height + 0.1} visible={false}>
      {STINK_PUFFS.map(([a, y, s], i) => (
        <sprite key={i} position={[Math.cos(a) * 0.45, y, Math.sin(a) * 0.45]} scale={[s, s, 1]}>
          <spriteMaterial color={i % 2 === 0 ? "#8bc34a" : "#689f38"} transparent opacity={0.75} depthWrite={false} />
        </sprite>
      ))}
    </group>
  );
}

/** The tomato splat on a visor (#15), at the visor's spot; CrsAvatar (or the model, on its head) shows it. */
export function Splat({ group, radius, at }: { group: RefObject<Group | null>; radius: number; at: readonly [number, number, number] }) {
  return (
    <group ref={group} position={at} visible={false}>
      <mesh scale={[1, 0.75, 0.25]}>
        <sphereGeometry args={[radius * 0.42, 12, 8]} />
        <meshStandardMaterial color="#d62a1e" roughness={0.3} />
      </mesh>
      {SPLAT_DRIPS.map(([x, y, r], i) => (
        <mesh key={i} position={[x * radius, y * radius, 0.02]}>
          <sphereGeometry args={[r * radius, 8, 6]} />
          <meshStandardMaterial color="#b71c1c" roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

const CRS_UNIFORM = "#1a2a4a";
/** BRAV-M (#13): black leather and a full-face motorbike helmet. */
const BRAVM_UNIFORM = "#22252b";
const BRAVM_HELMET = "#e8e8e8";

function crsLook(radius: number, bravm = false): CrsLook {
  const height = CAPSULE_LENGTH + radius * 2;
  const uniform = bravm ? BRAVM_UNIFORM : CRS_UNIFORM;
  return {
    height,
    color: uniform,
    ragdoll: crsRagdoll(radius),
    render: (rig) => (
      <>
        {/* Body: the uniform. */}
        <mesh position-y={height / 2} castShadow>
          <capsuleGeometry args={[radius, CAPSULE_LENGTH, 4, 12]} />
          <meshStandardMaterial ref={rig.body} color={uniform} />
        </mesh>
        {/* Helmet and visor: a riot helmet, or a full-face motorbike one (BRAV-M). */}
        <mesh position-y={height - 0.12} castShadow>
          <sphereGeometry args={bravm ? [radius * 0.85, 16, 12] : [radius * 0.82, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={bravm ? BRAVM_HELMET : "#0d1526"} metalness={0.3} roughness={0.4} />
        </mesh>
        <mesh position={[0, height - 0.28, radius * 0.72]}>
          <boxGeometry args={[radius * 1.3, 0.18, 0.06]} />
          <meshStandardMaterial color="#9fb7d6" transparent opacity={0.6} />
        </mesh>
        {/* Tomato splat on the visor (#15): a squashed red blob and a few drips. */}
        <Splat group={rig.splat} radius={radius} at={[0, height - 0.28, radius * 0.76]} />
        {/* Shield on the left arm; a BRAV-M has none, only its arm. */}
        <group ref={rig.shieldArm} position={[-radius - 0.05, height * 0.62, 0.1]}>
          {bravm ? (
            <mesh position-y={-0.3} castShadow>
              <boxGeometry args={[0.15, 0.6, 0.15]} />
              <meshStandardMaterial color={uniform} />
            </mesh>
          ) : (
            <mesh position={[0, -0.25, 0.25]} castShadow>
              <boxGeometry args={[0.55, 0.95, 0.06]} />
              <meshStandardMaterial color="#cfd8dc" transparent opacity={0.75} />
            </mesh>
          )}
        </group>
        {/* Shield line (#6): a tall riot shield held up in front, nearly touching the neighbours'. */}
        <group ref={rig.lineShield} visible={false}>
          <mesh position={[0, height * 0.45, radius + 0.12]} castShadow>
            <boxGeometry args={[LINE_SHIELD_RADIUS * 1.9, height * 0.8, 0.06]} />
            <meshStandardMaterial color="#cfd8dc" transparent opacity={0.7} />
          </mesh>
          {/* "POLICE" band across it. */}
          <mesh position={[0, height * 0.62, radius + 0.16]}>
            <boxGeometry args={[LINE_SHIELD_RADIUS * 1.7, 0.14, 0.02]} />
            <meshStandardMaterial color="#1a2a4a" />
          </mesh>
        </group>
        {/* Baton arm on the right, swings on a baton hit. */}
        <group ref={rig.batonArm} position={[radius + 0.08, height * 0.66, 0]}>
          <mesh position-y={-0.3} castShadow>
            <boxGeometry args={[0.15, 0.6, 0.15]} />
            <meshStandardMaterial color={uniform} />
          </mesh>
          <mesh position={[0, -0.6, 0.25]} rotation-x={Math.PI / 2} castShadow>
            <cylinderGeometry args={[0.04, 0.04, 0.7, 8]} />
            <meshStandardMaterial color="#111111" />
          </mesh>
        </group>
      </>
    ),
  };
}

/** The protester avatar's sizes and colours (PlayerAvatar.tsx), for the revealed BAC. */
const PROTESTER_CAPSULE = 1;
const PROTESTER_BLUE = "#42a5f5";
const SKIN = "#8d6e63";
const ARMBAND = "#ff7a00";

/**
 * A BAC once revealed (#13): still the protester's capsule, nose and colours
 * (the costume), now with a baton in the right hand and an orange armband
 * on the left arm.
 */
function bacLook(): CrsLook {
  const radius = PLAYER_RADIUS;
  const height = PROTESTER_CAPSULE + radius * 2;
  return {
    height,
    color: PROTESTER_BLUE,
    ragdoll: PROTESTER_RAGDOLL,
    render: (rig) => (
      <>
        <mesh position-y={height / 2} castShadow>
          <capsuleGeometry args={[radius, PROTESTER_CAPSULE, 4, 12]} />
          <meshStandardMaterial ref={rig.body} color={PROTESTER_BLUE} />
        </mesh>
        <mesh position={[0, height * 0.7, radius]} castShadow>
          <boxGeometry args={[0.2, 0.2, 0.3]} />
          <meshStandardMaterial color="#212121" />
        </mesh>
        <Splat group={rig.splat} radius={radius} at={[0, height * 0.78, radius * 0.95]} />
        {/* Left arm with the armband: the reveal. */}
        <group ref={rig.shieldArm} position={[-radius - 0.08, height * 0.68, 0]}>
          <mesh position-y={-0.35} castShadow>
            <boxGeometry args={[0.16, 0.7, 0.16]} />
            <meshStandardMaterial color={SKIN} />
          </mesh>
          <mesh position-y={-0.2} rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.13, 0.05, 8, 16]} />
            <meshStandardMaterial color={ARMBAND} emissive={ARMBAND} emissiveIntensity={0.4} />
          </mesh>
        </group>
        {/* Right arm with a short baton. */}
        <group ref={rig.batonArm} position={[radius + 0.08, height * 0.68, 0]}>
          <mesh position-y={-0.35} castShadow>
            <boxGeometry args={[0.16, 0.7, 0.16]} />
            <meshStandardMaterial color={SKIN} />
          </mesh>
          <mesh position={[0, -0.68, 0.18]} rotation-x={Math.PI / 2} castShadow>
            <cylinderGeometry args={[0.035, 0.035, 0.45, 8]} />
            <meshStandardMaterial color="#111111" />
          </mesh>
        </group>
        <group ref={rig.lineShield} visible={false} />
      </>
    ),
  };
}

/** One BRAV-M rider sitting on the bike, `z` along it. */
function Rider({ z, body, radius }: { z: number; body?: RefObject<MeshStandardMaterial | null>; radius: number }) {
  return (
    <group position-z={z}>
      <mesh position-y={0.95} castShadow>
        <capsuleGeometry args={[radius * 0.8, 0.45, 4, 10]} />
        <meshStandardMaterial ref={body} color={BRAVM_UNIFORM} />
      </mesh>
      <mesh position-y={1.45} castShadow>
        <sphereGeometry args={[radius * 0.62, 14, 10]} />
        <meshStandardMaterial color={BRAVM_HELMET} metalness={0.3} roughness={0.4} />
      </mesh>
    </group>
  );
}

const BIKE_LENGTH = 1.9;
const WHEEL_RADIUS = 0.32;

/**
 * The BRAV-M bike (#13) with `riders` on it (2 the duo, 1 the driver alone, 0
 * the wreck): a long low box on two wheels, the driver in front. The rig's
 * baton arm is the back rider's, so a passenger's swing would show; the rest
 * of the rig is empty groups (nothing to animate on a bike).
 */
function bikeLook(riders: 0 | 1 | 2): CrsLook {
  const bike = CRS_STATS[CrsKind.BravM].bike;
  const radius = bike?.radius ?? 0.6;
  const rider = CRS_STATS[CrsKind.BravM].radius;
  return {
    height: riders > 0 ? 1.7 : 0.8,
    color: BRAVM_UNIFORM,
    ragdoll: null,
    render: (rig) => (
      <>
        {/* Frame and seat. */}
        <mesh position-y={0.5} castShadow>
          <boxGeometry args={[0.32, 0.3, BIKE_LENGTH * 0.75]} />
          {/* No rider: the frame takes the hit flash. */}
          <meshStandardMaterial ref={riders === 0 ? rig.body : undefined} color="#30343b" metalness={0.4} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.7, -0.15]}>
          <boxGeometry args={[0.36, 0.12, 0.9]} />
          <meshStandardMaterial color="#111111" />
        </mesh>
        {/* Handlebar and a blue light. */}
        <mesh position={[0, 0.95, BIKE_LENGTH * 0.33]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.03, 0.03, 0.7, 8]} />
          <meshStandardMaterial color="#111111" />
        </mesh>
        <mesh position={[0, 1.02, BIKE_LENGTH * 0.38]}>
          <boxGeometry args={[0.16, 0.08, 0.1]} />
          <meshStandardMaterial color="#2962ff" emissive="#2962ff" emissiveIntensity={0.8} />
        </mesh>
        {/* Wheels: cylinders with their axis across the bike. */}
        {[BIKE_LENGTH / 2 - WHEEL_RADIUS, -BIKE_LENGTH / 2 + WHEEL_RADIUS].map((z) => (
          <mesh key={z} position={[0, WHEEL_RADIUS, z]} rotation-z={Math.PI / 2} castShadow>
            <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, 0.16, 16]} />
            <meshStandardMaterial color="#141414" />
          </mesh>
        ))}
        {riders >= 1 && <Rider z={0.2} body={rig.body} radius={rider} />}
        {riders >= 2 && <Rider z={-0.45} radius={rider} />}
        <Splat group={rig.splat} radius={radius * 0.6} at={[0, 1.45, 0.2 + rider * 0.55]} />
        <group ref={rig.batonArm} position={[rider * 0.8 + 0.05, 1.15, riders >= 2 ? -0.45 : 0.2]} visible={riders > 0}>
          <mesh position-y={-0.25} castShadow>
            <boxGeometry args={[0.13, 0.5, 0.13]} />
            <meshStandardMaterial color={BRAVM_UNIFORM} />
          </mesh>
        </group>
        <group ref={rig.shieldArm} />
        <group ref={rig.lineShield} visible={false} />
      </>
    ),
  };
}

const POMPIER_UNIFORM = "#1f2a44";
const POMPIER_BAND = "#ffd600";
const POMPIER_HELMET = "#f9c80e";
const POMPIER_STRIPE = "#d32f2f";
const NOZZLE = "#c9a227";
const HOSE = "#b71c1c";

/** Where a pompier's nozzle is (local to its facing group): the water jet starts there. */
export const POMPIER_NOZZLE_Y = 1.05;

/**
 * A pompier (#17): a navy capsule with two yellow reflective bands, a yellow
 * helmet with a red stripe, both arms forward on the hose (CrsAvatar raises
 * them while spraying), the brass nozzle in the right hand.
 */
function pompierLook(radius: number): CrsLook {
  const height = CAPSULE_LENGTH + radius * 2;
  return {
    height,
    color: POMPIER_UNIFORM,
    ragdoll: pompierRagdoll(radius, { uniform: POMPIER_UNIFORM, helmet: POMPIER_HELMET, nozzle: NOZZLE }),
    render: (rig) => (
      <>
        <mesh position-y={height / 2} castShadow>
          <capsuleGeometry args={[radius, CAPSULE_LENGTH, 4, 12]} />
          <meshStandardMaterial ref={rig.body} color={POMPIER_UNIFORM} />
        </mesh>
        {/* Reflective bands round the chest and the legs. */}
        {[height * 0.32, height * 0.6].map((y) => (
          <mesh key={y} position-y={y}>
            <cylinderGeometry args={[radius + 0.015, radius + 0.015, 0.09, 16, 1, true]} />
            <meshStandardMaterial color={POMPIER_BAND} emissive={POMPIER_BAND} emissiveIntensity={0.35} />
          </mesh>
        ))}
        {/* The helmet, with a red stripe over the top front to back. */}
        <mesh position-y={height - 0.14} castShadow>
          <sphereGeometry args={[radius * 0.88, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={POMPIER_HELMET} metalness={0.4} roughness={0.35} />
        </mesh>
        <mesh position-y={height - 0.14} rotation-z={Math.PI / 2}>
          <torusGeometry args={[radius * 0.89, 0.035, 6, 20, Math.PI]} />
          <meshStandardMaterial color={POMPIER_STRIPE} />
        </mesh>
        <Splat group={rig.splat} radius={radius} at={[0, height - 0.3, radius * 0.8]} />
        {/* Left arm on the hose. */}
        <group ref={rig.shieldArm} position={[-radius - 0.05, height * 0.62, 0.05]}>
          <mesh position-y={-0.3} castShadow>
            <boxGeometry args={[0.15, 0.6, 0.15]} />
            <meshStandardMaterial color={POMPIER_UNIFORM} />
          </mesh>
          <mesh position={[0.25, -0.55, 0]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.06, 0.06, 0.6, 8]} />
            <meshStandardMaterial color={HOSE} />
          </mesh>
        </group>
        {/* Right arm with the brass nozzle (pointing forward once the arm is raised). */}
        <group ref={rig.batonArm} position={[radius + 0.05, height * 0.62, 0.05]}>
          <mesh position-y={-0.3} castShadow>
            <boxGeometry args={[0.15, 0.6, 0.15]} />
            <meshStandardMaterial color={POMPIER_UNIFORM} />
          </mesh>
          <mesh position-y={-0.68}>
            <cylinderGeometry args={[0.05, 0.08, 0.32, 8]} />
            <meshStandardMaterial color={NOZZLE} metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
        <group ref={rig.lineShield} visible={false} />
      </>
    ),
  };
}

const LBD_BAND = "#ff7a00";
const LAUNCHER = "#ff8f1f";
const LAUNCHER_TRIM = "#ffd600";

/** The launcher's muzzle, local to the facing group of a CRS LBD (#73), +z forward: the laser starts there. */
export const LBD_MUZZLE = { x: -0.12, y: 1.09, z: 0.95 } as const;

/**
 * A CRS LBD (#73): the CRS capsule and riot helmet with no shield, a wide
 * orange band round the chest and an orange stripe over the helmet, the
 * left arm held forward on a chunky toy launcher (a fat orange tube with a
 * yellow muzzle ring and a yellow grip), the baton on the right as usual.
 * The launcher is posed forward inside `shieldArm`, which CrsAvatar kicks
 * up a little on a shot. It is in `keep`: with Jordan's model it is still
 * drawn (no launcher model was delivered), and the laser still starts at
 * LBD_MUZZLE.
 */
function lbdLook(radius: number): CrsLook {
  const height = CAPSULE_LENGTH + radius * 2;
  return {
    height,
    color: CRS_UNIFORM,
    ragdoll: crsRagdoll(radius),
    render: (rig) => (
      <>
        <mesh position-y={height / 2} castShadow>
          <capsuleGeometry args={[radius, CAPSULE_LENGTH, 4, 12]} />
          <meshStandardMaterial ref={rig.body} color={CRS_UNIFORM} />
        </mesh>
        {/* The orange band round the chest: tells it apart from a plain CRS at a glance. */}
        <mesh position-y={height * 0.56}>
          <cylinderGeometry args={[radius + 0.015, radius + 0.015, 0.16, 16, 1, true]} />
          <meshStandardMaterial color={LBD_BAND} emissive={LBD_BAND} emissiveIntensity={0.4} />
        </mesh>
        {/* Riot helmet with an orange stripe front to back, and the visor. */}
        <mesh position-y={height - 0.12} castShadow>
          <sphereGeometry args={[radius * 0.82, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#0d1526" metalness={0.3} roughness={0.4} />
        </mesh>
        <mesh position-y={height - 0.12} rotation-z={Math.PI / 2}>
          <torusGeometry args={[radius * 0.83, 0.045, 6, 20, Math.PI]} />
          <meshStandardMaterial color={LBD_BAND} emissive={LBD_BAND} emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[0, height - 0.28, radius * 0.72]}>
          <boxGeometry args={[radius * 1.3, 0.18, 0.06]} />
          <meshStandardMaterial color="#9fb7d6" transparent opacity={0.6} />
        </mesh>
        <Splat group={rig.splat} radius={radius} at={[0, height - 0.28, radius * 0.76]} />
        {/* Left arm held forward on the launcher. */}
        <mesh position={[-radius + 0.1, height * 0.62 - 0.1, 0.35]} rotation-y={0.5} castShadow>
          <boxGeometry args={[0.15, 0.15, 0.55]} />
          <meshStandardMaterial color={CRS_UNIFORM} />
        </mesh>
        <group ref={rig.lineShield} visible={false} />
        {/* Baton arm on the right, as a plain CRS (a slow, soft one). */}
        <group ref={rig.batonArm} position={[radius + 0.08, height * 0.66, 0]}>
          <mesh position-y={-0.3} castShadow>
            <boxGeometry args={[0.15, 0.6, 0.15]} />
            <meshStandardMaterial color={CRS_UNIFORM} />
          </mesh>
          <mesh position={[0, -0.6, 0.25]} rotation-x={Math.PI / 2} castShadow>
            <cylinderGeometry args={[0.04, 0.04, 0.7, 8]} />
            <meshStandardMaterial color="#111111" />
          </mesh>
        </group>
      </>
    ),
    Keep: ({ rig }) => (
      <>
        {/* The launcher (posed here: CrsAvatar only adds the recoil). */}
        <group ref={rig.shieldArm} position={[-radius - 0.05, height * 0.62, 0.1]}>
          {/* A fat, short orange tube pointing forward... */}
          <mesh position={[LBD_MUZZLE.x + radius + 0.05, -0.12, 0.55]} rotation-x={Math.PI / 2} castShadow>
            <cylinderGeometry args={[0.13, 0.15, 0.55, 14]} />
            <meshStandardMaterial color={LAUNCHER} roughness={0.5} />
          </mesh>
          {/* ...a big yellow ring at the muzzle... */}
          <mesh position={[LBD_MUZZLE.x + radius + 0.05, -0.12, 0.83]}>
            <torusGeometry args={[0.13, 0.05, 8, 18]} />
            <meshStandardMaterial color={LAUNCHER_TRIM} roughness={0.4} />
          </mesh>
          {/* ...and a chunky yellow grip under it. */}
          <mesh position={[LBD_MUZZLE.x + radius + 0.05, -0.28, 0.42]} rotation-x={0.3}>
            <boxGeometry args={[0.1, 0.22, 0.12]} />
            <meshStandardMaterial color={LAUNCHER_TRIM} roughness={0.4} />
          </mesh>
        </group>
      </>
    ),
  };
}

const LOOKS = {
  crs: crsLook(CRS_STATS[CrsKind.Crs].radius),
  bac: bacLook(),
  bravmFoot: crsLook(CRS_STATS[CrsKind.BravM].radius, true),
  duo: bikeLook(2),
  solo: bikeLook(1),
  wreck: bikeLook(0),
  pompier: pompierLook(CRS_STATS[CrsKind.Pompier].radius),
  lbd: lbdLook(CRS_STATS[CrsKind.Lbd].radius),
};

/** The look of a bot of `kind` riding `mount` (a disguised BAC is drawn as a protester, not with these). */
export function crsLookFor(kind: CrsKind, mount: CrsMount): CrsLook {
  if (kind === CrsKind.Bac) return LOOKS.bac;
  if (kind === CrsKind.Pompier) return LOOKS.pompier;
  if (kind === CrsKind.Lbd) return LOOKS.lbd;
  if (kind === CrsKind.BravM) {
    if (mount === CrsMount.Duo) return LOOKS.duo;
    if (mount === CrsMount.Solo) return LOOKS.solo;
    if (mount === CrsMount.Wreck) return LOOKS.wreck;
    return LOOKS.bravmFoot;
  }
  return LOOKS.crs;
}
