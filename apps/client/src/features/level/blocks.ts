/*
 * The building blocks as the client draws them (#84): each block of the level
 * with the pieces `carveLevel` leaves around this round's shop rooms, grouped
 * back by block so a block still fades as one. Pure; run once per round
 * layout, never per frame.
 */
import { carveLevel, type BoxObstacle, type Level, type ShopLot, type ShopRoom } from "@manif/shared";

export interface CarvedBlock {
  /** The whole block, as the level has it. */
  box: BoxObstacle;
  /** Its index in `level.boxes` (the colour is picked from it). */
  index: number;
  /** The pieces left around its rooms, in street order; `[box]` for a block with no shop. */
  pieces: BoxObstacle[];
  /** The rooms carved out of it. */
  rooms: ShopRoom[];
}

/** Carve the level around the shop rooms (the same pieces the server collides with) and group the pieces by block. */
export function carveBlocks(level: Level, lots: readonly ShopLot[]): { blocks: CarvedBlock[]; rooms: readonly ShopRoom[] } {
  const carved = carveLevel(level, lots);
  const blocks: CarvedBlock[] = [];
  const byId = new Map<string, CarvedBlock>();
  level.boxes.forEach((box, index) => {
    if (box.kind !== "building") return;
    const block: CarvedBlock = { box, index, pieces: [], rooms: [] };
    blocks.push(block);
    byId.set(box.id, block);
  });
  for (const piece of carved.level.boxes) {
    if (piece.kind !== "building") continue;
    const colon = piece.id.lastIndexOf(":");
    const block = byId.get(piece.id) ?? (colon > 0 ? byId.get(piece.id.slice(0, colon)) : undefined);
    block?.pieces.push(piece);
  }
  for (const room of carved.rooms) byId.get(room.building)?.rooms.push(room);
  return { blocks, rooms: carved.rooms };
}
