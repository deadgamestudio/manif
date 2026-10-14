/*
 * LOOKS for throwables (#8): Jordan's models (#28), and flat-coloured
 * placeholders drawn until they have loaded (or if they fail). All in this
 * one file, so the views (on the ground, in flight, in hand) never change.
 * One row per kind: pavé (#8), tomate, crotte, trottinette (#15).
 *
 * The models are life-size (a 10 cm pavé), far too small to read from the
 * isometric camera, so each is scaled up to about its placeholder's size.
 */
import type { ReactNode } from "react";
import { Vector3 } from "three";
import { THROWABLE_TYPES, ThrowableKind, type ItemKind } from "@manif/shared";
import { MODELS, modelBounds, useGltf, useStaticModel } from "../models/index.ts";

export interface ThrowableLook {
  /** The model, centred on the origin, resting on y = 0 when on the ground. */
  model: () => ReactNode;
  /** Height of the flight above the ground at the throw and the landing, and the extra height at the top of the arc. */
  flightY: number;
  arcHeight: number;
  /** Tumble speed in flight, radians per second. */
  spin: number;
  /** Where it sits in a raised hand, from the hand. */
  handY: number;
}

function Pave() {
  // A cobblestone, drawn a bit bigger than its collision circle so it reads from the isometric camera.
  const s = THROWABLE_TYPES[ThrowableKind.Pave].radius * 2.4;
  return (
    <mesh position-y={s * 0.35} castShadow>
      <boxGeometry args={[s, s * 0.7, s]} />
      <meshStandardMaterial color="#8a8d91" roughness={0.9} />
    </mesh>
  );
}

function Tomate() {
  // A ripe tomato with a green stalk (#15).
  const r = THROWABLE_TYPES[ThrowableKind.Tomate].radius * 1.4;
  return (
    <group>
      <mesh position-y={r} castShadow>
        <sphereGeometry args={[r, 12, 8]} />
        <meshStandardMaterial color="#d62a1e" roughness={0.45} />
      </mesh>
      <mesh position-y={r * 2}>
        <cylinderGeometry args={[r * 0.12, r * 0.18, r * 0.35, 6]} />
        <meshStandardMaterial color="#2e7d32" />
      </mesh>
    </group>
  );
}

/** Blobs of the dog poo (#15): x, y, z offsets and radius, as fractions of its size. */
const POO_BLOBS: readonly (readonly [number, number, number, number])[] = [
  [0, 0.35, 0, 0.5],
  [0.15, 0.75, 0.05, 0.38],
  [0.05, 1.05, 0, 0.26],
];

function Crotte() {
  // A cartoon swirl: three stacked brown blobs.
  const s = THROWABLE_TYPES[ThrowableKind.Crotte].radius * 2.2;
  return (
    <group>
      {POO_BLOBS.map(([x, y, z, r], i) => (
        <mesh key={i} position={[x * s, y * s * 0.6, z * s]} castShadow>
          <sphereGeometry args={[r * s, 10, 8]} />
          <meshStandardMaterial color="#5b3a1e" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

function Trottinette() {
  // An e-scooter lying down: a thin deck, a stem, two little wheels (#15). Drawn along local Z.
  const len = THROWABLE_TYPES[ThrowableKind.Trottinette].radius * 3.4;
  const wheel = 0.09;
  return (
    <group>
      <mesh position-y={wheel + 0.03} castShadow>
        <boxGeometry args={[0.16, 0.05, len]} />
        <meshStandardMaterial color="#3fb950" roughness={0.5} />
      </mesh>
      {/* The stem, folded down along the deck. */}
      <mesh position={[0.1, wheel + 0.06, len * 0.15]} castShadow>
        <boxGeometry args={[0.05, 0.05, len * 0.8]} />
        <meshStandardMaterial color="#2b2b2b" />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, wheel, (side * len) / 2]} rotation-z={Math.PI / 2} castShadow>
          <cylinderGeometry args={[wheel, wheel, 0.06, 12]} />
          <meshStandardMaterial color="#111111" />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Jordan's model of a throwable, standing on y = 0 and centred, `scale` times
 * its own size; `fallback` until it has loaded, or if it failed. Every copy
 * shares its geometry and materials (nothing changes them).
 */
function ThrowableModel({ url, scale, fallback }: { url: string; scale: number; fallback: ReactNode }) {
  const gltf = useGltf(url);
  const copy = useStaticModel(url);
  if (!gltf || !copy) return <>{fallback}</>;
  const b = modelBounds(gltf);
  const centre = b.getCenter(new Vector3());
  return (
    <group scale={scale}>
      <primitive object={copy} position={[-centre.x, -b.min.y, -centre.z]} dispose={null} />
    </group>
  );
}

const T = MODELS.throwables;

export const THROWABLE_LOOKS: Readonly<Record<ItemKind, ThrowableLook>> = {
  // 10 cm: drawn 3.5 times bigger, like its placeholder.
  [ThrowableKind.Pave]: { model: () => <ThrowableModel url={T.pave} scale={3.5} fallback={<Pave />} />, flightY: 1.2, arcHeight: 1.4, spin: 12, handY: -0.8 },
  [ThrowableKind.Tomate]: { model: () => <ThrowableModel url={T.tomato} scale={2.2} fallback={<Tomate />} />, flightY: 1.3, arcHeight: 1.8, spin: 9, handY: -0.75 },
  [ThrowableKind.Crotte]: { model: () => <ThrowableModel url={T.dogPoo} scale={1.4} fallback={<Crotte />} />, flightY: 1.2, arcHeight: 1.2, spin: 14, handY: -0.75 },
  // Parked upright on its stand, held up over the head, end over end in the air.
  [ThrowableKind.Trottinette]: { model: () => <ThrowableModel url={T.trottinette} scale={1} fallback={<Trottinette />} />, flightY: 1.1, arcHeight: 0.8, spin: 7, handY: -0.65 },
};

/** The look of a synced kind, or null for "nothing" and unknown kinds. */
export function lookOf(kind: number): ThrowableLook | null {
  return (THROWABLE_LOOKS as Record<number, ThrowableLook | undefined>)[kind] ?? null;
}
