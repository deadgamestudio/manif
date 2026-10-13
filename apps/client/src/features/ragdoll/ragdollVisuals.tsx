/*
 * PLACEHOLDER LOOK of the ragdolls (#26): primitive limbs, sizes and colours,
 * all in this one file, so Jordan's models can replace them here without
 * touching the physics. One look per kind of body (protester, CRS).
 *
 * Each segment is drawn in its bone's frame (pose.ts): origin at the parent
 * joint, +Y along the bone to the child joint (`length` away), +X the body's
 * left. For the torso and head +Z is the body's front; along the hanging arms
 * the front is -Z (+Y points down there).
 */
import type { ReactNode } from "react";
import type { MeshStandardMaterial } from "three";
import { S, type RagdollProportions, type SegmentId } from "./skeleton.ts";

/** Registers a material that takes the body colour (setColor), e.g. the local player's yellow. */
export type BodyMaterial = (m: MeshStandardMaterial | null) => void;

export interface RagdollLook {
  proportions: RagdollProportions;
  /** The primitives of one segment, in its bone frame. */
  renderSegment: (segment: SegmentId, length: number, body: BodyMaterial) => ReactNode;
}

/** A capsule from the bone's start to its end. */
function limb(length: number, radius: number, material: ReactNode): ReactNode {
  return (
    <mesh position-y={length / 2} castShadow>
      <capsuleGeometry args={[radius, length, 4, 8]} />
      {material}
    </mesh>
  );
}

/** A protester: same size, colours and lone left arm as the capsule avatar (PlayerAvatar.tsx). */
const PROTESTER: RagdollProportions = {
  height: 1.8,
  leftShoulderX: 0.48,
  rightShoulderX: 0.28,
  hipX: 0.17,
  torsoRadius: 0.34,
  headRadius: 0.2,
  limbRadius: 0.11,
};
const SKIN = "#8d6e63";
/** Trousers: the legs stand out from the torso once it is on the ground (and hide inside the capsule standing). */
const TROUSERS = "#37474f";

export const PROTESTER_RAGDOLL: RagdollLook = {
  proportions: PROTESTER,
  renderSegment: (segment, length, body) => {
    const bodyMat = <meshStandardMaterial ref={body} color="#42a5f5" />;
    switch (segment) {
      case S.Torso:
        return (
          <>
            {limb(length, PROTESTER.torsoRadius, bodyMat)}
            {/* The capsule avatar's nose, at the same spot standing (0.7 of the height, the pelvis is at 0.44). */}
            <mesh position={[0, PROTESTER.height * (0.7 - 0.44), 0.4]} castShadow>
              <boxGeometry args={[0.2, 0.2, 0.3]} />
              <meshStandardMaterial color="#212121" />
            </mesh>
          </>
        );
      case S.Head:
        return (
          <mesh position-y={length} castShadow>
            <sphereGeometry args={[PROTESTER.headRadius, 12, 8]} />
            {bodyMat}
          </mesh>
        );
      case S.LUpperArm:
      case S.LForearm:
      case S.RUpperArm:
      case S.RForearm:
        return limb(length, 0.08, <meshStandardMaterial color={SKIN} />);
      default:
        return limb(length, PROTESTER.limbRadius, <meshStandardMaterial color={TROUSERS} />);
    }
  },
};

/** A CRS (crsVisuals.tsx): navy uniform, helmet, baton in the left hand, small shield on the right arm. */
const UNIFORM = "#1a2a4a";

export function crsRagdoll(radius: number): RagdollLook {
  const p: RagdollProportions = {
    height: 1.05 + radius * 2,
    leftShoulderX: radius + 0.08,
    rightShoulderX: radius + 0.05,
    hipX: radius * 0.45,
    torsoRadius: radius * 0.9,
    headRadius: radius * 0.5,
    limbRadius: 0.12,
  };
  return {
    proportions: p,
    renderSegment: (segment, length, body) => {
      const bodyMat = <meshStandardMaterial ref={body} color={UNIFORM} />;
      switch (segment) {
        case S.Torso:
          return limb(length, p.torsoRadius, bodyMat);
        case S.Head:
          return (
            <>
              <mesh position-y={length} castShadow>
                <sphereGeometry args={[p.headRadius, 12, 8]} />
                <meshStandardMaterial color="#0d1526" metalness={0.3} roughness={0.4} />
              </mesh>
              <mesh position={[0, length - 0.02, p.headRadius * 0.8]}>
                <boxGeometry args={[p.headRadius * 1.6, 0.16, 0.06]} />
                <meshStandardMaterial color="#9fb7d6" transparent opacity={0.6} />
              </mesh>
            </>
          );
        case S.LForearm:
          return (
            <>
              {limb(length, 0.075, bodyMat)}
              {/* Baton, held forward (-Z along a hanging arm). */}
              <mesh position={[0, length, -0.25]} rotation-x={Math.PI / 2} castShadow>
                <cylinderGeometry args={[0.04, 0.04, 0.7, 8]} />
                <meshStandardMaterial color="#111111" />
              </mesh>
            </>
          );
        case S.RForearm:
          return (
            <>
              {limb(length, 0.075, bodyMat)}
              <mesh position={[0, length * 0.5, -0.12]} castShadow>
                <boxGeometry args={[0.45, 0.7, 0.05]} />
                <meshStandardMaterial color="#cfd8dc" transparent opacity={0.75} />
              </mesh>
            </>
          );
        case S.LUpperArm:
        case S.RUpperArm:
          return limb(length, 0.075, bodyMat);
        default:
          return limb(length, p.limbRadius, bodyMat);
      }
    },
  };
}
