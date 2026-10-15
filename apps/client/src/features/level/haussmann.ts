/*
 * The Haussmann look of a building block (#101), as plain data: where the
 * stone, the windows, the iron balconies, the zinc mansard roof, its dormers
 * and the chimney stacks go. Pure and seeded by the block's id, so every
 * client sees the same street; run once per round layout, never per frame.
 * `facadeGeometry.ts` turns it into one mesh. A future set of facade models
 * (#100) can replace either half.
 *
 * Everything is an axis-aligned box in world coordinates, except the
 * mansard, which slopes. The walls are the very pieces the server collides
 * with (`carveLevel`), so doorways stay open; the rest only stands out of the
 * walls by a balcony's depth at most, and never below the ground-floor base,
 * so it never covers a shop front or a doorway.
 *
 * Proportions are a cartoon's, not an architect's: a tall ground floor that
 * clears the tallest shop front, then floors of 2.2 to 2.8 m, a cornice, and
 * a mansard roof on top of the block's height.
 */
import { SHOP_ROOM, type BoxObstacle, type ShopRoom } from "@manif/shared";
import { seeded } from "./roomInterior.ts";

export type V3 = [number, number, number];

/** What a box is made of: picks its colour. */
export type Part =
  | "stone"
  | "base"
  | "joint"
  | "band"
  | "cornice"
  | "frame"
  | "glass"
  | "iron"
  | "door"
  | "dormer"
  | "zinc"
  | "chimney"
  | "pot";

export interface PartBox {
  part: Part;
  min: V3;
  max: V3;
}

/** The zinc roof: a frustum from the block's footprint at `y0` to the footprint shrunk by `inset` at `y1`, flat on top. */
export interface Mansard {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y0: number;
  y1: number;
  inset: number;
}

export interface HaussmannBlock {
  /** This block's limestone, as a CSS colour. */
  stone: string;
  /** Its ground-floor base, a shade darker. */
  base: string;
  boxes: PartBox[];
  roof: Mansard;
  /** Height of the flat top of the roof: what hides someone behind the block (chimneys aside). */
  top: number;
}

/** What the layout needs of a block: the same fields as `CarvedBlock` / `BuildingSpec`. */
export interface BlockInput {
  box: BoxObstacle;
  pieces: readonly BoxObstacle[];
  rooms: readonly ShopRoom[];
}

export const HAUSSMANN = {
  /** Ground floor at least this tall: over the tallest shop front (4.25 m), so balconies and bands stay above them. */
  ground: 4.4,
  minFloor: 2.2,
  maxFloor: 2.8,
  /** Mansard roof, over the block's height. */
  roof: 2.2,
  roofInset: 1.1,
  /** How far a balcony stands out of its wall: the most anything sticks out (the cornice is up under the roof). */
  balcony: 0.5,
  cornice: 0.3,
} as const;

/** Limestone shades, one per block, from cream to a warmer sand. */
const STONES: readonly (readonly [string, string])[] = [
  ["#ece4d3", "#d6cbb4"],
  ["#e9dfca", "#d3c6aa"],
  ["#efe9dc", "#dad1bf"],
  ["#e7dcc4", "#cfc0a2"],
  ["#ebe4d6", "#d5cdbb"],
];

/** The fixed colours. Stone and base come from the block. */
export const PART_COLORS: Readonly<Record<Exclude<Part, "stone" | "base">, string>> = {
  joint: "#b9a888",
  band: "#f5ecd9",
  cornice: "#f7f0e0",
  frame: "#f8f3e8",
  glass: "#3b4656",
  iron: "#1c1d21",
  door: "#2f4a3c",
  dormer: "#eee6d4",
  zinc: "#7d8b9c",
  chimney: "#d8b48c",
  pot: "#c0623f",
};

/** One face of the block: a vertical plane `axis = at`, facing `dir`, spanning `from..to` along the other axis. */
interface Face {
  axis: "x" | "z";
  at: number;
  dir: -1 | 1;
  from: number;
  to: number;
  street: boolean;
}

export function haussmann(block: BlockInput): HaussmannBlock {
  const H = HAUSSMANN;
  const { box } = block;
  const rand = seeded(box.id);
  const minX = box.x - box.halfX;
  const maxX = box.x + box.halfX;
  const minZ = box.z - box.halfZ;
  const maxZ = box.z + box.halfZ;
  const h = box.height;

  // Floors: as many as fit at least `minFloor` tall over the base, stretched up to `maxFloor`; the base takes the rest.
  const floors = Math.max(1, Math.floor((h - H.ground) / H.minFloor + 1e-9));
  const floorH = Math.min(H.maxFloor, (h - H.ground) / floors);
  const ground = h - floors * floorH;

  // This block's own rhythm.
  const [stone, base] = STONES[Math.floor(rand() * STONES.length)]!;
  const bay = 1.75 + rand() * 0.4;
  const topBalcony = floors >= 3 || (floors === 2 && rand() < 0.6);
  const balconettes = rand() < 0.6;
  const dormerEvery = rand() < 0.5 ? 1 : 2;
  const dormerOffset = Math.floor(rand() * dormerEvery);
  const balconyFloors = new Set<number>([0]);
  if (topBalcony) balconyFloors.add(floors - 1);

  // The street side: the face towards x = 0.
  const streetOnMax = box.x < 0;
  const faces: Face[] = [
    { axis: "x", at: streetOnMax ? maxX : minX, dir: streetOnMax ? 1 : -1, from: minZ, to: maxZ, street: true },
    { axis: "x", at: streetOnMax ? minX : maxX, dir: streetOnMax ? -1 : 1, from: minZ, to: maxZ, street: false },
    { axis: "z", at: maxZ, dir: 1, from: minX, to: maxX, street: false },
    { axis: "z", at: minZ, dir: -1, from: minX, to: maxX, street: false },
  ];

  const boxes: PartBox[] = [];
  const add = (part: Part, min: V3, max: V3) => boxes.push({ part, min, max });
  /** A box in a face's frame: `u` along it, `y` up, `w` out of the wall (negative: into it). */
  const put = (f: Face, part: Part, u0: number, u1: number, y0: number, y1: number, w0: number, w1: number) => {
    const a = f.at + f.dir * w0;
    const b = f.at + f.dir * w1;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (f.axis === "x") add(part, [lo, y0, u0], [hi, y1, u1]);
    else add(part, [u0, y0, lo], [u1, y1, hi]);
  };

  // The walls: the carved pieces and the slabs over the rooms, split into the base and the stone above it.
  const wall = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) => {
    if (y0 < ground) add("base", [x0, y0, z0], [x1, Math.min(ground, y1), z1]);
    if (y1 > ground) add("stone", [x0, Math.max(ground, y0), z0], [x1, y1, z1]);
  };
  for (const p of block.pieces) wall(p.x - p.halfX, p.x + p.halfX, p.z - p.halfZ, p.z + p.halfZ, 0, p.height);
  for (const r of block.rooms) if (h > r.height) wall(r.rect.minX, r.rect.maxX, r.rect.minZ, r.rect.maxZ, r.height, h);

  // The shop fronts on the street face, along it, with what stands below `height`: nothing of ours goes there.
  const fronts = block.rooms.map((r) => ({ from: r.rect.minZ - SHOP_ROOM.frame - 0.1, to: r.rect.maxZ + SHOP_ROOM.frame + 0.1, height: r.height }));
  /** The stretches of a face free of shop fronts at height `y`. */
  const freeSpans = (f: Face, from: number, to: number, y: number): [number, number][] => {
    let spans: [number, number][] = [[from, to]];
    if (!f.street) return spans;
    for (const s of fronts) {
      if (s.height <= y) continue;
      spans = spans.flatMap(([a, b]): [number, number][] =>
        s.to <= a || s.from >= b ? [[a, b]] : ([[a, s.from], [s.to, b]] as [number, number][]).filter(([c, d]) => d - c > 0.05),
      );
    }
    return spans;
  };

  for (const f of faces) {
    const length = f.to - f.from;
    // Window bays, evenly spread with a margin at each corner.
    const margin = 0.9;
    const cols = Math.max(1, Math.floor((length - 2 * margin) / bay));
    const step = (length - 2 * margin) / cols;
    const centres = Array.from({ length: cols }, (_, i) => f.from + margin + (i + 0.5) * step);
    const winW = Math.min(0.8, step * 0.5);

    // Rusticated base: a joint every half metre, broken by the shop fronts.
    for (let y = 0.55; y < ground - 0.3; y += 0.55) {
      for (const [a, b] of freeSpans(f, f.from, f.to, y)) put(f, "joint", a, b, y, y + 0.05, -0.01, 0.03);
    }
    // The ground floor: a carriage door or two on the street face, tall windows in the other bays, all clear of the shop fronts.
    const doorBays = new Set<number>();
    if (f.street) {
      const want = 1 + Math.floor(rand() * 2);
      const start = Math.floor(rand() * cols);
      for (let k = 0; k < cols && doorBays.size < want; k += 2) {
        const i = (start + k) % cols;
        const c = centres[i]!;
        if (fronts.every((s) => c + 1.4 < s.from || c - 1.4 > s.to) && c - 1.2 >= f.from && c + 1.2 <= f.to) doorBays.add(i);
      }
    }
    const doorTop = Math.min(3.3, ground - 0.7);
    const shopTop = Math.min(3, ground - 1);
    centres.forEach((c, i) => {
      if (doorBays.has(i)) {
        put(f, "frame", c - 0.95, c + 0.95, 0, doorTop + 0.25, 0, 0.05);
        put(f, "door", c - 0.75, c + 0.75, 0, doorTop, 0, 0.08);
        return;
      }
      const half = Math.min(0.6, step * 0.32);
      if (!fronts.every((s) => c + half + 0.3 < s.from || c - half - 0.3 > s.to)) return;
      put(f, "frame", c - half - 0.12, c + half + 0.12, 0.5, shopTop + 0.15, 0, 0.04);
      put(f, "glass", c - half, c + half, 0.62, shopTop, 0, 0.07);
    });
    // The string course over the base.
    put(f, "band", f.from, f.to, ground - 0.1, ground + 0.18, 0, 0.12);

    for (let k = 0; k < floors; k++) {
      const y0 = ground + k * floorH;
      const winBottom = y0 + 0.3;
      const winTop = winBottom + Math.min(1.75, floorH * 0.66);
      if (k > 0) put(f, "band", f.from, f.to, y0 - 0.05, y0 + 0.07, 0, 0.06);
      for (const c of centres) {
        put(f, "frame", c - winW / 2 - 0.12, c + winW / 2 + 0.12, winBottom - 0.1, winTop + 0.14, 0, 0.035);
        put(f, "glass", c - winW / 2, c + winW / 2, winBottom, winTop, 0, 0.06);
      }
      const long = f.axis === "x";
      if (balconyFloors.has(k) && long) {
        // A continuous balcony along the whole face: a stone slab and a black railing, closed at both ends.
        const a = f.from + 0.35;
        const b = f.to - 0.35;
        put(f, "band", a, b, y0 - 0.02, y0 + 0.1, 0, H.balcony);
        put(f, "iron", a, b, y0 + 0.1, y0 + 0.62, H.balcony - 0.05, H.balcony);
        put(f, "iron", a, b, y0 + 0.58, y0 + 0.66, H.balcony - 0.1, H.balcony);
        put(f, "iron", a, a + 0.05, y0 + 0.1, y0 + 0.62, 0, H.balcony);
        put(f, "iron", b - 0.05, b, y0 + 0.1, y0 + 0.62, 0, H.balcony);
      } else if (balconyFloors.has(k) || balconettes) {
        // One small balcony, or just a guard rail, in front of each window.
        const out = balconyFloors.has(k) ? 0.32 : 0.12;
        for (const c of centres) {
          const a = c - winW / 2 - 0.15;
          const b = c + winW / 2 + 0.15;
          if (out > 0.2) put(f, "band", a, b, y0 + 0.18, y0 + 0.28, 0, out);
          put(f, "iron", a, b, winBottom - 0.02, winBottom + 0.42, out - 0.04, out);
        }
      }
    }

    // The cornice under the roof, running past the corners so they close.
    put(f, "cornice", f.from - H.cornice, f.to + H.cornice, h - 0.35, h, 0, H.cornice);
    put(f, "band", f.from - 0.12, f.to + 0.12, h - 0.55, h - 0.35, 0, 0.12);

    // Dormers on the long faces' slopes, over the windows.
    if (f.axis === "x") {
      const inset = roofInset(box);
      const slopeAt = (dy: number) => -(inset * dy) / H.roof;
      const front = slopeAt(0.35) + 0.08;
      const back = -inset - 0.2;
      centres.forEach((c, i) => {
        if ((i + dormerOffset) % dormerEvery !== 0) return;
        put(f, "dormer", c - 0.5, c + 0.5, h + 0.2, h + 1.5, back, front);
        put(f, "glass", c - 0.3, c + 0.3, h + 0.45, h + 1.3, back, front + 0.04);
        put(f, "zinc", c - 0.62, c + 0.62, h + 1.5, h + 1.72, back, front + 0.1);
      });
    }
  }

  // The mansard, and chimney stacks across its flat top.
  const inset = roofInset(box);
  const roof: Mansard = { minX, maxX, minZ, maxZ, y0: h, y1: h + H.roof, inset };
  const top = roof.y1;
  const alongZ = maxZ - minZ >= maxX - minX;
  const lo = (alongZ ? minZ : minX) + inset + 0.8;
  const hi = (alongZ ? maxZ : maxX) - inset - 0.8;
  const across = alongZ ? box.x : box.z;
  const width = Math.min(1.8, (alongZ ? maxX - minX : maxZ - minZ) - 2 * inset - 0.4);
  const stacks = Math.max(1, Math.min(4, Math.round((hi - lo) / 9) + Math.floor(rand() * 2)));
  for (let i = 0; i < stacks; i++) {
    const t = stacks === 1 ? 0.5 : i / (stacks - 1);
    const at = lo + (hi - lo) * t + (rand() - 0.5) * 1.5;
    const tall = 0.9 + rand() * 0.5;
    const a = Math.max(lo, Math.min(hi, at));
    const stack = (u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, part: Part) =>
      alongZ ? add(part, [v0, y0, u0], [v1, y1, u1]) : add(part, [u0, y0, v0], [u1, y1, v1]);
    stack(a - 0.3, a + 0.3, across - width / 2, across + width / 2, top - 0.1, top + tall, "chimney");
    stack(a - 0.36, a + 0.36, across - width / 2 - 0.06, across + width / 2 + 0.06, top + tall, top + tall + 0.1, "band");
    const pots = Math.max(2, Math.floor(width / 0.45));
    for (let p = 0; p < pots; p++) {
      const v = across - width / 2 + (p + 0.5) * (width / pots);
      stack(a - 0.1, a + 0.1, v - 0.1, v + 0.1, top + tall + 0.1, top + tall + 0.38, "pot");
    }
  }

  return { stone, base, boxes, roof, top };
}

/** How far the mansard leans in, leaving a flat top at least 1.6 m wide on narrow blocks. */
function roofInset(box: BoxObstacle): number {
  return Math.max(0.4, Math.min(HAUSSMANN.roofInset, Math.min(box.halfX, box.halfZ) - 0.8));
}
