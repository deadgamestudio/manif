/*
 * PLACEHOLDER LOOK for the fire truck (#17): a red box with a cab, four
 * cylinder wheels, a ladder on the roof and blue lights that flash while it
 * is parked. Primitives only, all in this file, so a real model (Jordan's)
 * replaces it here without touching TrucksView. Drawn nose towards +Z, at the
 * synced size (TRUCK_LENGTH x TRUCK_WIDTH).
 */
import type { RefObject } from "react";
import type { MeshStandardMaterial } from "three";
import { TRUCK_LENGTH, TRUCK_WIDTH } from "@manif/shared";

const RED = "#c62828";
const CAB_RED = "#b71c1c";
const WHEEL = "#1b1b1b";
const CHROME = "#cfd8dc";
const GLASS = "#90caf9";
const LIGHT = "#2962ff";

const L = TRUCK_LENGTH;
const W = TRUCK_WIDTH;
const WHEEL_R = 0.45;
const BODY_H = 2.1;
const CAB_LEN = 1.5;
const CAB_H = 1.8;

export const TRUCK_LOOK = {
  /** The blue lights flash this many times a second while parked. */
  flashRate: 3,
  lightOn: 2.2,
  lightOff: 0.1,
} as const;

/** The truck itself. `lights` are the two roof lights' materials, flashed by TrucksView. */
export function TruckModel({ lights }: { lights: RefObject<(MeshStandardMaterial | null)[]> }) {
  const bodyLen = L - CAB_LEN;
  return (
    <group>
      {/* The body, behind the cab. */}
      <mesh position={[0, WHEEL_R + BODY_H / 2, -L / 2 + bodyLen / 2]} castShadow>
        <boxGeometry args={[W, BODY_H, bodyLen]} />
        <meshStandardMaterial color={RED} />
      </mesh>
      {/* A white band along each side. */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * W) / 2 + s * 0.01, WHEEL_R + BODY_H * 0.45, -L / 2 + bodyLen / 2]}>
          <boxGeometry args={[0.02, 0.18, bodyLen * 0.95]} />
          <meshStandardMaterial color="#f5f5f5" />
        </mesh>
      ))}
      {/* The cab, lower, at the front, with its windscreen. */}
      <mesh position={[0, WHEEL_R + CAB_H / 2, L / 2 - CAB_LEN / 2]} castShadow>
        <boxGeometry args={[W, CAB_H, CAB_LEN]} />
        <meshStandardMaterial color={CAB_RED} />
      </mesh>
      <mesh position={[0, WHEEL_R + CAB_H * 0.7, L / 2 + 0.01]}>
        <boxGeometry args={[W * 0.85, CAB_H * 0.4, 0.02]} />
        <meshStandardMaterial color={GLASS} metalness={0.2} roughness={0.2} />
      </mesh>
      {/* The ladder on the roof: two rails. */}
      {[-0.4, 0.4].map((x) => (
        <mesh key={x} position={[x, WHEEL_R + BODY_H + 0.12, -L / 2 + bodyLen / 2]}>
          <boxGeometry args={[0.08, 0.08, bodyLen * 0.95]} />
          <meshStandardMaterial color={CHROME} metalness={0.6} roughness={0.3} />
        </mesh>
      ))}
      {/* Blue lights on the cab roof. */}
      {[-0.6, 0.6].map((x, i) => (
        <mesh key={x} position={[x, WHEEL_R + CAB_H + 0.1, L / 2 - CAB_LEN / 2]}>
          <boxGeometry args={[0.35, 0.18, 0.3]} />
          <meshStandardMaterial
            ref={(m) => {
              lights.current[i] = m;
            }}
            color={LIGHT}
            emissive={LIGHT}
            emissiveIntensity={TRUCK_LOOK.lightOff}
          />
        </mesh>
      ))}
      {/* Four wheels, axis across the truck. */}
      {[-1, 1].flatMap((side) =>
        [L / 2 - 1, -L / 2 + 1].map((z) => (
          <mesh key={`${side}:${z}`} position={[(side * W) / 2, WHEEL_R, z]} rotation-z={Math.PI / 2} castShadow>
            <cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.3, 16]} />
            <meshStandardMaterial color={WHEEL} />
          </mesh>
        )),
      )}
    </group>
  );
}
