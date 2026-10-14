// DEBUG ONLY (#84): in dev builds a client can break a shop and step inside
// its room, to test walking in, the loot and the CRS coming in after you
// without smashing a window by hand. Accepted only in development.

import { PLAYER_RADIUS, type ShopLot, type ShopRoom, type Vec2 } from "@manif/shared";

/** The debug message is only accepted when NODE_ENV is exactly "development" (bun run dev sets it); anything else, unset included, refuses it. */
export const DEBUG_SHOP_ENABLED = process.env.NODE_ENV === "development";

/** Reads the untrusted payload: a whole `index` from 0, a `depth` clamped to 0..1. Never null: an empty payload means "the nearest shop". */
export function parseDebugShop(message: unknown): { index?: number; depth: number } {
  const m = (message ?? {}) as { index?: unknown; depth?: unknown };
  const index = Number(m.index);
  const depth = Number(m.depth);
  return {
    ...(m.index !== undefined && Number.isInteger(index) && index >= 0 && { index }),
    depth: m.depth !== undefined && Number.isFinite(depth) ? Math.max(0, Math.min(1, depth)) : 0.75,
  };
}

/**
 * The shop the debug message means (`index`, or the nearest to `at`) and
 * where to stand in its room: on the doorway's centre line, `depth` of the
 * way in, clear of the walls, facing the street. Null with no such shop.
 */
export function debugShopSpot(
  shops: readonly ShopLot[],
  rooms: readonly ShopRoom[],
  cmd: { index?: number; depth: number },
  at: Vec2,
): { id: string; x: number; z: number; rotation: number } | null {
  let lot: ShopLot | undefined;
  if (cmd.index !== undefined) lot = shops[cmd.index];
  else {
    let best = Infinity;
    for (const s of shops) {
      const d = Math.hypot(s.side * s.face - at.x, s.z - at.z);
      if (d < best) {
        best = d;
        lot = s;
      }
    }
  }
  const room = lot && rooms.find((r) => r.id === lot.id);
  if (!lot || !room) return null;
  const deep = room.rect.maxX - room.rect.minX - PLAYER_RADIUS - 0.05;
  const d = Math.min(deep, Math.max(PLAYER_RADIUS + 0.05, cmd.depth * deep));
  // Facing the street: towards -side along X (rotation is atan2 of the facing's x and z).
  return { id: lot.id, x: room.door.x + room.side * d, z: room.door.z, rotation: Math.atan2(-room.side, 0) };
}
