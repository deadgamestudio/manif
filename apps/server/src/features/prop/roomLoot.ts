import {
  PLAYER_RADIUS,
  PROP_TYPES,
  ROOM_LOOT,
  ROOM_LOOT_REFILL,
  THROWABLE_TYPES,
  circleOverlaps,
  resolveCircle,
  type CollisionWorld,
  type ItemKind,
  type PropKind,
  type ShopRoom,
  type Vec2,
} from "@manif/shared";

/** Loot is kept this far from a room's walls: a protester standing on it fits, so it is always within reach. */
const WALL_MARGIN = PLAYER_RADIUS + 0.1;
/** Loot lies in the back of the room, past this share of its depth: going in for it is the risk (#84). */
const BACK_SHARE = 0.35;
/** Loot items are at least about this far apart. */
const SPACING = 0.7;

/**
 * Where `count` items of `kind` lie in `room` (#84): a small grid in the back
 * of the room, every spot inside it, clear of its walls by a body's radius
 * (so it can be picked up standing on it) and of anything solid in `world`.
 */
export function roomLootSpots(room: ShopRoom, kind: ItemKind, count: number, world: CollisionWorld): Vec2[] {
  const out: Vec2[] = [];
  if (count <= 0) return out;
  const r = THROWABLE_TYPES[kind].radius;
  const margin = Math.max(WALL_MARGIN, r + 0.1);
  const rect = room.rect;
  const depth = rect.maxX - rect.minX;
  // Depth measured from the facade into the building.
  const near = Math.min(Math.max(margin, depth * BACK_SHARE), depth - margin);
  const far = depth - margin;
  const z0 = rect.minZ + margin;
  const z1 = rect.maxZ - margin;
  const cols = Math.max(1, Math.min(count, Math.floor((z1 - z0) / SPACING) + 1));
  const rows = Math.ceil(count / cols);
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Deepest row first.
    const d = rows === 1 ? (near + far) / 2 : far - ((far - near) * row) / (rows - 1);
    const z = cols === 1 ? (z0 + z1) / 2 : z0 + ((z1 - z0) * col) / (cols - 1);
    const x = room.door.x + room.side * d;
    const p = circleOverlaps(world, x, z, r) ? resolveCircle(world, x, z, r) : { x, z };
    // Never pushed out of the room: back to the planned spot if it was.
    const inRoom = p.x >= rect.minX + r && p.x <= rect.maxX - r && p.z >= rect.minZ + r && p.z <= rect.maxZ - r;
    out.push(inRoom ? { x: p.x, z: p.z } : { x, z });
  }
  return out;
}

interface Stash {
  kind: ItemKind;
  spots: Vec2[];
  /** The items on the ground from the last drop. */
  ids: string[];
  /** Room time when the last of them was taken; null while some lie there. */
  emptiedAt: number | null;
}

/**
 * The loot inside broken shops (#84). When a shop breaks, its room gets
 * `ROOM_LOOT[kind]` of the shop's throwables. Once every one of them has been
 * taken, they come back `refillDelay` seconds later, once a round. The room
 * supplies how to drop an item (returning its id) and whether an id still
 * lies on the ground; `reset` at each new street.
 */
export class RoomLoot {
  private readonly stashes = new Map<string, Stash>();

  constructor(
    private readonly drop: (kind: ItemKind, x: number, z: number) => string,
    private readonly onGround: (id: string) => boolean,
    private readonly refillDelay = ROOM_LOOT_REFILL,
  ) {}

  /** A new street: no room has any loot, and none is due back. */
  reset(): void {
    this.stashes.clear();
  }

  /** Shop `room` (of `kind`) just broke: its loot goes in. Returns how many items were dropped (0 for a kind with none). */
  open(room: ShopRoom, kind: PropKind, world: CollisionWorld): number {
    if (this.stashes.has(room.id)) return 0;
    const item = PROP_TYPES[kind].dropKind;
    const count = (ROOM_LOOT as Partial<Record<PropKind, number>>)[kind] ?? 0;
    const spots = roomLootSpots(room, item, count, world);
    if (spots.length === 0) return 0;
    const stash: Stash = { kind: item, spots, ids: [], emptiedAt: null };
    this.fill(stash);
    this.stashes.set(room.id, stash);
    return spots.length;
  }

  /** Watch the rooms' loot; refill a room whose loot has all been taken for long enough (its last refill). */
  step(now: number): void {
    for (const [id, stash] of this.stashes) {
      if (stash.emptiedAt === null) {
        if (stash.ids.every((i) => !this.onGround(i))) stash.emptiedAt = now;
        continue;
      }
      if (now < stash.emptiedAt + this.refillDelay) continue;
      this.fill(stash);
      // Only once: nothing to watch after this.
      this.stashes.delete(id);
    }
  }

  private fill(stash: Stash): void {
    stash.ids = stash.spots.map((p) => this.drop(stash.kind, p.x, p.z));
  }
}
