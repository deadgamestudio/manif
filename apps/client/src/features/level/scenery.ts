/*
 * Where the level's repeated ground pieces go (#28): the road dashes down the
 * middle, the crosswalks, and the pavement along the facades with its kerb
 * (#102). Pure layout from the shared level, no three.js; Level.tsx draws them
 * instanced.
 */
import type { Level, Rect } from "@manif/shared";

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

/** The pavement (#102): this deep from the facade to the kerb. */
export const PAVEMENT_DEEP = 3;
/** The granite kerb is this wide, on the pavement side of the kerb line. */
export const KERB_WIDTH = 0.3;
/** The dark gutter line is this wide, on the road side of the kerb line. */
export const GUTTER_WIDTH = 0.3;

/** Where the pavement and its edge are drawn: flat rectangles on the ground, one instance each. */
export interface KerbLayout {
  /** The pavement's top, from the kerb line to the facade. */
  pavements: Rect[];
  /** The granite kerb stones: along the street, and across each end of a block where a side street opens. */
  kerbs: Rect[];
  /** The dark line on the road against the kerb. */
  gutters: Rect[];
}

/** What is left of [from, to] once the `cuts` intervals are taken out, in order. */
export function cutRange(from: number, to: number, cuts: readonly (readonly [number, number])[]): [number, number][] {
  let parts: [number, number][] = [[from, to]];
  for (const [a, b] of cuts) {
    parts = parts.flatMap(([p, q]): [number, number][] => {
      if (b <= p || a >= q) return [[p, q]];
      const out: [number, number][] = [];
      if (a > p) out.push([p, a]);
      if (b < q) out.push([b, q]);
      return out;
    });
  }
  return parts;
}

/** The rectangle between two x values (either order) and two z values. */
function span(x1: number, x2: number, minZ: number, maxZ: number): Rect {
  return { minX: Math.min(x1, x2), maxX: Math.max(x1, x2), minZ, maxZ };
}

/**
 * The pavement along every facade, PAVEMENT_DEEP wide, with a light granite
 * kerb on its street edge and a dark gutter line on the road beside it (#102).
 * Cosmetic: nothing collides with it. The kerb breaks where a crosswalk meets
 * the pavement (a lowered kerb: the stripes run up to the pavement) and turns
 * the corner at each end of a block, where a side street opens. Nothing is
 * laid over the destination, where the Préfecture's forecourt is drawn.
 */
export function kerbLayout(level: Level): KerbLayout {
  const out: KerbLayout = { pavements: [], kerbs: [], gutters: [] };
  const half = CROSSWALK_DEPTH / 2;
  const crossings = crosswalkPlacements(level).map((c): [number, number] => [c.z - half, c.z + half]);
  const d = level.destination;
  for (const f of level.facades) {
    const s = f.side;
    const kerb = f.face - PAVEMENT_DEEP;
    // Stops short of the destination if its strip would run over it.
    const strip = span(s * kerb, s * f.face, f.minZ, f.maxZ);
    const overDestination = strip.minX < d.maxX && strip.maxX > d.minX;
    const minZ = overDestination ? Math.max(f.minZ, d.maxZ) : f.minZ;
    const maxZ = f.maxZ;
    if (maxZ - minZ <= KERB_WIDTH * 2) continue;
    out.pavements.push({ ...strip, minZ, maxZ });
    for (const [a, b] of cutRange(minZ, maxZ, crossings)) {
      out.kerbs.push(span(s * kerb, s * (kerb + KERB_WIDTH), a, b));
      out.gutters.push(span(s * (kerb - GUTTER_WIDTH), s * kerb, a, b));
    }
    // The kerb turns the corner at the block's ends (not overlapping the one along it), except against the wall behind the start.
    const across = (z1: number, z2: number) => out.kerbs.push(span(s * (kerb + KERB_WIDTH), s * f.face, z1, z2));
    across(minZ, minZ + KERB_WIDTH);
    if (maxZ < level.bounds.maxZ) across(maxZ - KERB_WIDTH, maxZ);
  }
  return out;
}
