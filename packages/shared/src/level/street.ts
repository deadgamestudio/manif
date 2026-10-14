import { ThrowableKind } from "../throwable/index.js";
import type { BoxKind, BoxObstacle, CircleKind, CircleObstacle, Level, LevelItem, PropKind, PropSlot } from "./level.js";

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

  // Police vans ("paniers à salade"): where a CRS drags whoever it grabbed (#5, #70).
  // Two in front of the Préfecture, and one every 30 to 40 down the street,
  // parked flush against a facade, clear of the lanes the cortège and the
  // shield lines use.
  box("van-1", "van", -8.2, -5.8, -88, -83, 2.4),
  box("van-2", "van", 5.8, 8.2, -91, -86, 2.4),
  box("van-3", "van", -10, -7.6, 81.5, 86.5, 2.4),
  box("van-4", "van", 7.1, 9.5, 48, 53, 2.4),
  box("van-5", "van", 7.6, 10, 12, 17, 2.4),
  box("van-6", "van", -10, -7.6, -18, -13, 2.4),
  box("van-7", "van", 6.6, 9, -48, -43, 2.4),
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

/** Where breakable props go (#4). Their shapes and HP are in `prop/constants.ts`. */
const propSlots: PropSlot[] = [
  prop("bin-1", "bin", -8, 75),
  prop("bin-2", "bin", 8, 46),
  prop("bin-3", "bin", -8.5, -4),
  prop("bin-4", "bin", 8, -72),
  // Bins parked beside a car, close enough for a fire to spread (#16).
  prop("bin-5", "bin", -8.5, 36.5),
  prop("bin-6", "bin", 8.5, -10),
  prop("shelter-1", "bus_shelter", 7.9, 58),
  prop("shelter-2", "bus_shelter", -7.8, -48),
  prop("window-1", "shop_window", -8.6, 45),
  prop("window-2", "shop_window", 9.6, 26),
  prop("window-3", "shop_window", -9.6, 5),
  prop("window-4", "shop_window", 8.6, -30),
  prop("car-1", "car", -5.5, 32),
  prop("car-2", "car", 5, -14),
  prop("car-3", "car", -6, -70),
  // Market stalls (#15), flush against the facades: smash one for tomatoes.
  prop("stall-1", "market_stall", 8.7, 70),
  prop("stall-2", "market_stall", -8.7, -35),
];

/** CRS spawn points (#5): in the side-street gaps and ahead in the street. The round's waves (#12) pick the ones ahead of the cortège. */
const crsSpawns = [
  { x: 10.8, z: 77 },
  { x: -10.8, z: 67 },
  { x: 0, z: 62 },
  { x: 10.8, z: 37 },
  { x: -10.8, z: 27 },
  { x: 1, z: 45 },
  { x: 10.8, z: -3 },
  { x: -10.8, z: -23 },
  { x: 10.8, z: -53 },
  { x: -10.8, z: -73 },
];

/**
 * Where shield lines form (#6): the round's waves (#12) put each line on the
 * nearest one far enough ahead of the cortège (z 54 at the start, z -38 at
 * progress 0.4). Each faces the cortège (+Z) and advances towards it once
 * protesters come close. The first one waits after the first stretch of
 * street; the second guards the Préfecture end.
 */
const lineSpawns = [
  { x: 0, z: 54 },
  { x: 0, z: -38 },
];

/** Pavés lying on the street when the march starts (#8): two in the start zone to try, then a few down the street. */
const items: LevelItem[] = [
  { x: -3, z: 88 },
  { x: 3, z: 88 },
  { x: -4, z: 76 },
  { x: 4, z: 74 },
  { x: 0, z: 66 },
  { x: 3, z: 52 },
  { x: -2, z: 38 },
  { x: 1, z: 22 },
  { x: -1, z: 0 },
  { x: 2, z: -25 },
  { x: -1, z: -50 },
  { x: 1, z: -62 },
].map((p) => ({ kind: ThrowableKind.Pave, ...p }));

/** Dog poo on the pavement (#15): a trap for anyone who walks on it, protester or CRS, until someone picks it up. Never in the start zone. */
const poos: LevelItem[] = [
  { x: 5, z: 77 },
  { x: -5.5, z: 61 },
  { x: -3, z: 28 },
  { x: 4, z: 3 },
  { x: -5, z: -17 },
  { x: 3, z: -44 },
  { x: -2, z: -66 },
].map((p) => ({ kind: ThrowableKind.Crotte, ...p }));

/** Trottinettes parked along the street (#15): one by the start to try, then a few further down. */
const trottinettes: LevelItem[] = [
  { x: 6, z: 84 },
  { x: -7.5, z: 18 },
  { x: 6, z: -36 },
  { x: -7, z: -77 },
].map((p) => ({ kind: ThrowableKind.Trottinette, ...p }));

export const STREET_LEVEL: Level = {
  id: "street",
  bounds: { minX: -HALF_WIDTH, maxX: HALF_WIDTH, minZ: END_Z, maxZ: START_Z },
  start: { minX: -7, maxX: 7, minZ: 86, maxZ: 98 },
  destination: { minX: -9, maxX: 9, minZ: END_Z, maxZ: -92 },
  progress: { from: { x: 0, z: 92 }, to: { x: 0, z: -92 } },
  boxes,
  circles,
  propSlots,
  crsSpawns,
  lineSpawns,
  items: [...items, ...poos, ...trottinettes],
};
