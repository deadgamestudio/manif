/*
 * PLACEHOLDER LOOKS for throwables (#8). Flat-coloured primitives, all in this
 * one file, so a real model (Jordan's) can replace a kind here without
 * touching the views. #15 adds a row per new kind (tomato, dog poo...).
 */
import type { ReactNode } from "react";
import { THROWABLE_TYPES, ThrowableKind, type ItemKind } from "@manif/shared";

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

export const THROWABLE_LOOKS: Readonly<Record<ItemKind, ThrowableLook>> = {
  [ThrowableKind.Pave]: { model: () => <Pave />, flightY: 1.2, arcHeight: 1.4, spin: 12, handY: -0.8 },
};

/** The look of a synced kind, or null for "nothing" and unknown kinds. */
export function lookOf(kind: number): ThrowableLook | null {
  return (THROWABLE_LOOKS as Record<number, ThrowableLook | undefined>)[kind] ?? null;
}
