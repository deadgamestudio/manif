/*
 * PLACEHOLDER LOOK for police bots (#5). A dark blue capsule with a helmet, a
 * visor, a shield and a baton arm, all in this one file, so a real model
 * (Jordan's) can replace it here without touching the logic in CrsAvatar.
 * One look per unit kind (#13 adds rows); the size comes from CRS_STATS, so
 * what you see is what you bump into.
 */
import type { ReactNode, RefObject } from "react";
import type { Group, MeshStandardMaterial } from "three";
import { CRS_STATS, CrsKind, LINE_SHIELD_RADIUS } from "@manif/shared";
import { crsRagdoll, type RagdollLook } from "../ragdoll/index.ts";

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
}

export interface CrsLook {
  /** Total height, for the HP bar above it. */
  height: number;
  render: (rig: CrsRig) => ReactNode;
  /** Its floppy look while knocked down (#26); the primitives are in ragdoll/ragdollVisuals.tsx. */
  ragdoll: RagdollLook;
}

const CAPSULE_LENGTH = 1.05;

function crsLook(radius: number): CrsLook {
  const height = CAPSULE_LENGTH + radius * 2;
  return {
    height,
    ragdoll: crsRagdoll(radius),
    render: (rig) => (
      <>
        {/* Body: navy uniform. */}
        <mesh position-y={height / 2} castShadow>
          <capsuleGeometry args={[radius, CAPSULE_LENGTH, 4, 12]} />
          <meshStandardMaterial ref={rig.body} color="#1a2a4a" />
        </mesh>
        {/* Helmet and visor. */}
        <mesh position-y={height - 0.12} castShadow>
          <sphereGeometry args={[radius * 0.82, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#0d1526" metalness={0.3} roughness={0.4} />
        </mesh>
        <mesh position={[0, height - 0.28, radius * 0.72]}>
          <boxGeometry args={[radius * 1.3, 0.18, 0.06]} />
          <meshStandardMaterial color="#9fb7d6" transparent opacity={0.6} />
        </mesh>
        {/* Shield on the left arm. */}
        <group ref={rig.shieldArm} position={[-radius - 0.05, height * 0.62, 0.1]}>
          <mesh position={[0, -0.25, 0.25]} castShadow>
            <boxGeometry args={[0.55, 0.95, 0.06]} />
            <meshStandardMaterial color="#cfd8dc" transparent opacity={0.75} />
          </mesh>
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
            <meshStandardMaterial color="#1a2a4a" />
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

export const CRS_LOOKS: Readonly<Record<CrsKind, CrsLook>> = {
  [CrsKind.Crs]: crsLook(CRS_STATS[CrsKind.Crs].radius),
};
