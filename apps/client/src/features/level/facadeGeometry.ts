/*
 * One building's Haussmann look (#101) as a single geometry with vertex
 * colours: walls, windows, balconies, roof, dormers and chimneys all in one
 * draw call, so the block still fades as one with its own material (#80).
 * Built once per round layout, never per frame.
 */
import { BufferGeometry, Color, Float32BufferAttribute } from "three";
import { PART_COLORS, type HaussmannBlock, type Part } from "./haussmann.ts";

type Rgb = [number, number, number];

class Builder {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  indices: number[] = [];

  /** A flat quad, corners in order round it, all facing `n`. */
  quad(a: number[], b: number[], c: number[], d: number[], n: number[], col: Rgb) {
    const i = this.positions.length / 3;
    for (const p of [a, b, c, d]) {
      this.positions.push(p[0]!, p[1]!, p[2]!);
      this.normals.push(n[0]!, n[1]!, n[2]!);
      this.colors.push(col[0], col[1], col[2]);
    }
    this.indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  /** An axis-aligned box. The bottom is left out: nothing ever sees under these. */
  box(min: readonly number[], max: readonly number[], col: Rgb) {
    const [x0, y0, z0] = min as [number, number, number];
    const [x1, y1, z1] = max as [number, number, number];
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], col);
    this.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0], col);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], col);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], col);
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], col);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.positions, 3));
    g.setAttribute("normal", new Float32BufferAttribute(this.normals, 3));
    g.setAttribute("color", new Float32BufferAttribute(this.colors, 3));
    g.setIndex(this.indices);
    g.computeBoundingSphere();
    return g;
  }
}

const rgbCache = new Map<string, Rgb>();
/** A CSS colour in three's working (linear) space, the way vertex colours want it. */
function rgb(css: string): Rgb {
  let out = rgbCache.get(css);
  if (!out) {
    const c = new Color(css);
    out = [c.r, c.g, c.b];
    rgbCache.set(css, out);
  }
  return out;
}

/** Slightly darker roof top than its slopes, so the mansard's break line reads from above. */
const ZINC_TOP = "#6c7888";

export function facadeGeometry(block: HaussmannBlock): BufferGeometry {
  const b = new Builder();
  const colour = (part: Part): Rgb => (part === "stone" ? rgb(block.stone) : part === "base" ? rgb(block.base) : rgb(PART_COLORS[part]));
  for (const p of block.boxes) b.box(p.min, p.max, colour(p.part));

  // The mansard: four sloping sides and the flat top.
  const { minX, maxX, minZ, maxZ, y0, y1, inset: i } = block.roof;
  const zinc = rgb(PART_COLORS.zinc);
  const run = y1 - y0;
  const len = Math.hypot(run, i);
  const up = i / len;
  const out = run / len;
  const ix0 = minX + i;
  const ix1 = maxX - i;
  const iz0 = minZ + i;
  const iz1 = maxZ - i;
  b.quad([maxX, y0, minZ], [ix1, y1, iz0], [ix1, y1, iz1], [maxX, y0, maxZ], [out, up, 0], zinc);
  b.quad([minX, y0, maxZ], [ix0, y1, iz1], [ix0, y1, iz0], [minX, y0, minZ], [-out, up, 0], zinc);
  b.quad([maxX, y0, maxZ], [ix1, y1, iz1], [ix0, y1, iz1], [minX, y0, maxZ], [0, up, out], zinc);
  b.quad([minX, y0, minZ], [ix0, y1, iz0], [ix1, y1, iz0], [maxX, y0, minZ], [0, up, -out], zinc);
  b.quad([ix0, y1, iz0], [ix0, y1, iz1], [ix1, y1, iz1], [ix1, y1, iz0], [0, 1, 0], rgb(ZINC_TOP));
  return b.build();
}
