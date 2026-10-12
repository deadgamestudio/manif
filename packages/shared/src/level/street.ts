import type { BoxKind, BoxObstacle, CircleKind, CircleObstacle, Level, PropKind, PropSlot } from "./level.js";

/*
 * The street: about 20 wide between the facades and 200 long, running along Z.
 * The march starts at the +Z end and ends at the Préfecture, at the -Z end.
 *
 * Layout rules:
 * - Every obstacle is at least 2 * MIN_OBSTACLE_HALF_THICKNESS (1 unit) thick
 *   on both axes, or 0.5 in radius. Tests enforce it. Thinner walls could be
 *   tunnelled through by very fast bodies.
 * - Side streets are gaps in the facades, closed by a barrier that overlaps the
 *   street bounds, so the player stops at something visible.
 * - Keep at least ~1 unit between obstacles (a player is 0.8 wide) or leave
 *   them touching; narrower gaps make places where bodies wedge.
 * - Leave the start zone clear: players spawn there.
 */

/** A box from its min/max corners, which reads better than centre + half size. */
function box(id: string, kind: BoxKind, minX: number, maxX: number, minZ: number, maxZ: number, height: number): BoxObstacle {
  return {
    id,
    kind,
    x: (minX + maxX) / 2,
    z: (minZ + maxZ) / 2,
    halfX: (maxX - minX) / 2,
    halfZ: (maxZ - minZ) / 2,
    height,
  };
}

function circle(id: string, kind: CircleKind, x: number, z: number, r: number, height: number): CircleObstacle {
  return { id, kind, x, z, r, height };
}

function prop(id: string, kind: PropKind, x: number, z: number, rotation = 0): PropSlot {
  return { id, kind, x, z, rotation };
}

const HALF_WIDTH = 12; // bounds, side streets included
const FAR = 16; // outer face of the facade blocks, beyond the bounds
const START_Z = 100;
const END_Z = -100;

/** Facade blocks: [minZ, maxZ, inner face distance from the centre line, height]. */
const LEFT: ReadonlyArray<readonly [number, number, number, number]> = [
  [70, START_Z, 10, 8],
  [30, 64, 9, 11],
  [-20, 24, 10, 7],
  [-70, -26, 9.5, 9],
  [END_Z, -76, 10, 8],
];
const RIGHT: ReadonlyArray<readonly [number, number, number, number]> = [
  [80, START_Z, 10, 9],
  [40, 74, 9.5, 7],
  [0, 34, 10, 10],
  [-50, -6, 9, 8],
  [END_Z, -56, 10, 11],
];
/** Side-street openings, closed by barriers: [side, minZ, maxZ]. */
const SIDE_STREETS: ReadonlyArray<readonly [-1 | 1, number, number]> = [
  [-1, 64, 70],
  [-1, 24, 30],
  [-1, -26, -20],
  [-1, -76, -70],
  [1, 74, 80],
  [1, 34, 40],
  [1, -6, 0],
  [1, -56, -50],
];

const boxes: BoxObstacle[] = [
  ...LEFT.map(([minZ, maxZ, inner, h], i) => box(`bldg-l${i + 1}`, "building", -FAR, -inner, minZ, maxZ, h)),
  ...RIGHT.map(([minZ, maxZ, inner, h], i) => box(`bldg-r${i + 1}`, "building", inner, FAR, minZ, maxZ, h)),
  ...SIDE_STREETS.map(([side, minZ, maxZ], i) =>
    side < 0
      ? box(`barrier-${i + 1}`, "barrier", -HALF_WIDTH - 0.5, -HALF_WIDTH + 0.5, minZ, maxZ, 1.2)
      : box(`barrier-${i + 1}`, "barrier", HALF_WIDTH - 0.5, HALF_WIDTH + 0.5, minZ, maxZ, 1.2),
  ),

  // Behind the start: a wall closes the street.
  box("start-wall", "wall", -FAR, FAR, START_Z, START_Z + 2, 2),
  // The goal. Its front face is the end of the street bounds.
  box("prefecture", "prefecture", -FAR - 2, FAR + 2, END_Z - 14, END_Z, 14),

  // Newspaper kiosks: big, square, good to hide behind.
  box("kiosk-1", "kiosk", -5, -3, 49, 51, 2.6),
  box("kiosk-2", "kiosk", 4, 6, 9, 11, 2.6),
  box("kiosk-3", "kiosk", -4, -2, -41, -39, 2.6),

  // Half-street construction walls: the cortège has to squeeze past.
  box("works-1", "wall", 3, 10, 19.5, 20.5, 1.6),
  box("works-2", "wall", -9.5, -3, -60.5, -59.5, 1.6),
  // A kiosk flush against the works wall: an inner corner to get stuck in.
  box("kiosk-4", "kiosk", -5, -3, -59.5, -57.5, 2.6),

  // Police vans parked in front of the Préfecture (drag destination for #5).
  box("van-1", "van", -8.2, -5.8, -88, -83, 2.4),
  box("van-2", "van", 5.8, 8.2, -91, -86, 2.4),
];

const circles: CircleObstacle[] = [
  // A row of bollards just after the start: the first thing to bump into.
  circle("bollard-1", "bollard", -6, 80, 0.5, 0.9),
  circle("bollard-2", "bollard", -2, 80, 0.5, 0.9),
  circle("bollard-3", "bollard", 2, 80, 0.5, 0.9),
  circle("bollard-4", "bollard", 6, 80, 0.5, 0.9),
  // Bollards around the forecourt.
  circle("bollard-5", "bollard", -3, -80, 0.5, 0.9),
  circle("bollard-6", "bollard", 0, -80, 0.5, 0.9),
  circle("bollard-7", "bollard", 3, -80, 0.5, 0.9),

  // Trees and lamp posts down both sides.
  circle("tree-1", "tree", -7, 58, 0.7, 4.5),
  circle("tree-2", "tree", 7, 30, 0.7, 4.5),
  circle("tree-3", "tree", -7, 10, 0.7, 4.5),
  circle("tree-4", "tree", 6.5, -20, 0.7, 4.5),
  circle("tree-5", "tree", -7, -10, 0.7, 4.5),
  circle("tree-6", "tree", 7, -66, 0.7, 4.5),
  circle("lamp-1", "lamp", 7.5, 66, 0.5, 5),
  circle("lamp-2", "lamp", -7.5, 40, 0.5, 5),
  circle("lamp-3", "lamp", 7.5, 0, 0.5, 5),
  circle("lamp-4", "lamp", -7.5, -30, 0.5, 5),
  circle("lamp-5", "lamp", 7, -40, 0.5, 5),
];

/** Where breakable props go (#4). Not collided with yet. */
const propSlots: PropSlot[] = [
  prop("bin-1", "bin", -8, 75),
  prop("bin-2", "bin", 8, 46),
  prop("bin-3", "bin", -8.5, -4),
  prop("bin-4", "bin", 8, -72),
  prop("shelter-1", "bus_shelter", 8, 58),
  prop("shelter-2", "bus_shelter", -7.8, -48),
  prop("window-1", "shop_window", -8.6, 45),
  prop("window-2", "shop_window", 9.6, 26),
  prop("window-3", "shop_window", -9.6, 5),
  prop("window-4", "shop_window", 8.6, -30),
  prop("car-1", "car", -5.5, 32),
  prop("car-2", "car", 5, -14),
  prop("car-3", "car", -6, -70),
];

export const STREET_LEVEL: Level = {
  id: "street",
  bounds: { minX: -HALF_WIDTH, maxX: HALF_WIDTH, minZ: END_Z, maxZ: START_Z },
  start: { minX: -7, maxX: 7, minZ: 86, maxZ: 98 },
  destination: { minX: -9, maxX: 9, minZ: END_Z, maxZ: -92 },
  progress: { from: { x: 0, z: 92 }, to: { x: 0, z: -92 } },
  boxes,
  circles,
  propSlots,
};
