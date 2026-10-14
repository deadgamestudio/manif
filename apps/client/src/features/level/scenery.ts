/*
 * Where the level's repeated ground pieces go (#28): the road dashes down the
 * middle, the crosswalks and the pavement along the facades. Pure layout from
 * the shared level, no three.js; Level.tsx draws them as instanced models.
 */
import type { Level } from "@manif/shared";

/** One copy of a model on the ground: where its origin goes, and its turn about Y. */
export interface Placement {
  x: number;
  z: number;
  yaw: number;
}

/** Crosswalks across the street, at side-street mouths (along Z). Any outside the street or on a zone is left out. */
const CROSSWALK_Z = [77, 37, -3, -23];
/** A crosswalk model is this deep along the street. */
const CROSSWALK_DEPTH = 4;
/** A road dash is this long, one every DASH_EVERY. */
const DASH_LENGTH = 2;
const DASH_EVERY = 4;
/** The pavement tile: its kerb along one 2 m edge (+Z in the model), 3 m deep from the kerb. */
const TILE_ALONG = 2;
const TILE_DEEP = 3;

function inside(z: number, minZ: number, maxZ: number, margin = 0): boolean {
  return z >= minZ - margin && z <= maxZ + margin;
}

/** The crosswalks of the level, across the middle of the street. */
export function crosswalkPlacements(level: Level): Placement[] {
  const half = CROSSWALK_DEPTH / 2;
  return CROSSWALK_Z.filter(
    (z) =>
      inside(z, level.bounds.minZ + half, level.bounds.maxZ - half) &&
      !inside(z, level.start.minZ, level.start.maxZ, half) &&
      !inside(z, level.destination.minZ, level.destination.maxZ, half),
  ).map((z) => ({ x: 0, z, yaw: 0 }));
}

/** The centre line's dashes (their middles), from the destination to the start, none across a crosswalk. */
export function dashPlacements(level: Level): Placement[] {
  const crossings = crosswalkPlacements(level);
  const out: Placement[] = [];
  for (let z = level.destination.maxZ + 2; z < level.start.minZ - 2; z += DASH_EVERY) {
    const mid = z + DASH_LENGTH / 2;
    if (crossings.some((c) => Math.abs(c.z - mid) < (CROSSWALK_DEPTH + DASH_LENGTH) / 2)) continue;
    out.push({ x: 0, z: mid, yaw: 0 });
  }
  return out;
}

/**
 * Pavement tiles along every facade: a strip TILE_DEEP wide against the
 * facade, kerb on the street side, one tile every TILE_ALONG down the block.
 */
export function pavementPlacements(level: Level): Placement[] {
  const out: Placement[] = [];
  for (const f of level.facades) {
    // The model's kerb (+Z) turned towards the street: +X on the left side, -X on the right.
    const yaw = f.side < 0 ? Math.PI / 2 : -Math.PI / 2;
    const x = f.side * (f.face - TILE_DEEP / 2);
    for (let z = f.minZ; z + TILE_ALONG <= f.maxZ + 1e-6; z += TILE_ALONG) out.push({ x, z: z + TILE_ALONG / 2, yaw });
  }
  return out;
}
