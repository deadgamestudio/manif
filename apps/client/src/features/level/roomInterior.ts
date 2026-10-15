/*
 * PLACEHOLDER LOOK of a looted shop room (#84): where the overturned shelves,
 * the counter, the crates and the litter go, from plain boxes, until Jordan's
 * models (#28) replace them. Pure and seeded by the room's id, so every
 * client sees the same mess. Nothing here collides: the clutter keeps to the
 * walls and leaves the doorway and the middle of the floor clear.
 *
 * Local frame of a room (RoomsView sets it): the origin is on the facade at
 * the middle of the doorway, +X goes into the room (0 to `depth`), Z runs
 * along the street (-halfWidth to halfWidth), Y is up.
 */
import type { ShopRoom } from "@manif/shared";

export type ClutterMaterial = "shelf" | "crate" | "counter" | "counterTop" | "litter" | "tube";

type V3 = [number, number, number];

/** One box of the mess: centre, size and rotation (Euler XYZ) in the room's local frame. */
export interface ClutterPiece {
  at: V3;
  size: V3;
  rot: V3;
  m: ClutterMaterial;
}

/** Room size in its local frame. */
export function roomSize(room: ShopRoom): { depth: number; halfWidth: number } {
  return { depth: room.rect.maxX - room.rect.minX, halfWidth: (room.rect.maxZ - room.rect.minZ) / 2 };
}

/** How far into the room the clutter starts (litter aside), so the doorway stays clear. */
export const CLEAR_DOORWAY = 1.2;

/** A small deterministic generator from a string. */
export function seeded(id: string): () => number {
  let a = 2166136261;
  for (let i = 0; i < id.length; i++) a = Math.imul(a ^ id.charCodeAt(i), 16777619);
  a = a >>> 0 || 1;
  return () => {
    a ^= a << 13;
    a >>>= 0;
    a ^= a >>> 17;
    a ^= a << 5;
    a >>>= 0;
    return a / 4294967296;
  };
}

/** The mess in one room: a counter on one side, an overturned shelf on the other, one leaning on the back wall, crates, litter, a fallen strip light. */
export function roomClutter(room: ShopRoom): ClutterPiece[] {
  const rand = seeded(room.id);
  const { depth: D, halfWidth: W } = roomSize(room);
  const out: ClutterPiece[] = [];
  const s = rand() < 0.5 ? -1 : 1;
  // Keeps a centre inside the room, `half` away from each wall.
  const u = (x: number, half: number) => Math.min(D - half, Math.max(CLEAR_DOORWAY + half, x));
  const v = (z: number, half: number) => Math.max(-W + half, Math.min(W - half, z));

  // The counter, along one side wall towards the back, its top a little askew.
  const counterLen = Math.max(0.8, Math.min(2.2, D - CLEAR_DOORWAY - 0.3));
  const cu = u(D - 0.3 - counterLen / 2, counterLen / 2);
  const cv = v(s * (W - 0.35), 0.35);
  out.push({ at: [cu, 0.5, cv], size: [counterLen, 1, 0.6], rot: [0, 0.04 * s, 0], m: "counter" });
  out.push({ at: [cu, 1.03, cv - s * 0.05], size: [counterLen, 0.06, 0.7], rot: [0.06 * s, 0.1 * s, 0], m: "counterTop" });

  // A shelf unit pulled down flat on the floor along the other wall, one end propped up.
  const shelfLen = Math.max(0.8, Math.min(1.8, D - CLEAR_DOORWAY - 0.2));
  out.push({
    at: [u(CLEAR_DOORWAY + 0.1 + shelfLen / 2 + rand() * 0.4, shelfLen / 2), 0.3, v(-s * (W - 0.7), 0.6)],
    size: [shelfLen, 0.4, 1.1],
    rot: [0, (rand() - 0.5) * 0.5, 0.15],
    m: "shelf",
  });

  // Another leaning crooked against the back wall.
  out.push({
    at: [D - 0.35, 0.85, v((rand() - 0.5) * W, 0.8)],
    size: [0.4, 1.7, 1.2],
    rot: [(rand() < 0.5 ? -1 : 1) * 0.3, 0, -0.12],
    m: "shelf",
  });

  // Crates: one in the back corner, one by the wall, one knocked on its edge.
  const sizes = [0.55 + rand() * 0.15, 0.5 + rand() * 0.15, 0.45 + rand() * 0.15];
  const [a, b, c] = sizes as [number, number, number];
  out.push({ at: [D - a / 2 - 0.05, a / 2, v(-s * W, a / 2 + 0.05)], size: [a, a, a], rot: [0, rand() * 0.6, 0], m: "crate" });
  out.push({ at: [u(CLEAR_DOORWAY + rand() * (D - CLEAR_DOORWAY), b / 2), b / 2, v(-s * W, b / 2 + 0.1)], size: [b, b, b], rot: [0, rand() * 1.5, 0], m: "crate" });
  out.push({ at: [u(D * 0.6, c), c * 0.6, v((rand() - 0.5) * W, c)], size: [c, c, c], rot: [0, rand() * 3, 0.6], m: "crate" });

  // A strip light hanging off the ceiling by one end: the room's only glow.
  out.push({ at: [u(D * 0.55, 0.6), room.height - 0.55, v((rand() - 0.5) * W * 0.6, 0.2)], size: [1.2, 0.06, 0.12], rot: [0, rand() * 0.8 - 0.4, 0.7], m: "tube" });

  // Litter all over the floor, flat enough to read as rubbish, doorway included.
  for (let i = 0; i < 7; i++) {
    const w = 0.25 + rand() * 0.3;
    out.push({ at: [0.3 + rand() * (D - 0.6), 0.02, v((rand() * 2 - 1) * W, w / 2)], size: [w, 0.03, 0.15 + rand() * 0.25], rot: [0, rand() * 3, 0], m: "litter" });
  }
  return out;
}
