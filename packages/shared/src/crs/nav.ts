/**
 * Navigation for bots (#5): a walkable grid built from a collision world, A*
 * over it, and a cheap "can I walk straight there" check.
 *
 * A cell is walkable when a circle of the bot's radius centred on it touches
 * nothing. The grid is rasterized from the shapes (not by testing every cell
 * against every shape), so rebuilding it when a prop breaks is cheap. Search
 * buffers are allocated once per grid and reused, so a path search allocates
 * only the path it returns.
 */
import type { CollisionWorld, Vec2 } from "../physics/index.js";
import { NAV_CELL } from "./constants.js";

const SQRT2 = Math.SQRT2;
/** A* gives up after expanding this many cells (a bounded worst case per search). */
const MAX_EXPANSIONS = 12000;

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly minX: number;
  readonly minZ: number;
  /** 1 = walkable. */
  readonly walkable: Uint8Array;

  // Search scratch, reused by every findPath call.
  private readonly g: Float64Array;
  private readonly parent: Int32Array;
  /** Search id that last touched a cell; avoids clearing the arrays between searches. */
  private readonly seen: Uint32Array;
  private readonly closed: Uint32Array;
  private searchId = 0;
  private readonly heap: number[] = [];
  private readonly heapF: number[] = [];

  constructor(
    world: CollisionWorld,
    readonly clearance: number,
    readonly cell = NAV_CELL,
  ) {
    const b = world.bounds;
    this.minX = b.minX;
    this.minZ = b.minZ;
    this.cols = Math.max(1, Math.ceil((b.maxX - b.minX) / cell));
    this.rows = Math.max(1, Math.ceil((b.maxZ - b.minZ) / cell));
    const n = this.cols * this.rows;
    this.walkable = new Uint8Array(n);
    this.g = new Float64Array(n);
    this.parent = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.rebuild(world);
  }

  /** Re-rasterize from the world (call when a prop breaks). Same bounds as at construction. */
  rebuild(world: CollisionWorld): void {
    const r = this.clearance;
    const b = world.bounds;
    // Inside the bounds, shrunk by the clearance.
    for (let row = 0; row < this.rows; row++) {
      const z = this.centreZ(row);
      const zOk = z >= b.minZ + r && z <= b.maxZ - r;
      for (let col = 0; col < this.cols; col++) {
        const x = this.centreX(col);
        this.walkable[row * this.cols + col] = zOk && x >= b.minX + r && x <= b.maxX - r ? 1 : 0;
      }
    }
    for (const box of world.boxes) {
      this.forCellsIn(box.x - box.halfX - r, box.x + box.halfX + r, box.z - box.halfZ - r, box.z + box.halfZ + r, (i, x, z) => {
        const ox = Math.max(Math.abs(x - box.x) - box.halfX, 0);
        const oz = Math.max(Math.abs(z - box.z) - box.halfZ, 0);
        if (ox * ox + oz * oz < r * r) this.walkable[i] = 0;
      });
    }
    for (const c of world.circles) {
      const rr = c.r + r;
      this.forCellsIn(c.x - rr, c.x + rr, c.z - rr, c.z + rr, (i, x, z) => {
        if ((x - c.x) ** 2 + (z - c.z) ** 2 < rr * rr) this.walkable[i] = 0;
      });
    }
  }

  colOf(x: number): number {
    return Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.minX) / this.cell)));
  }

  rowOf(z: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor((z - this.minZ) / this.cell)));
  }

  cellAt(x: number, z: number): number {
    return this.rowOf(z) * this.cols + this.colOf(x);
  }

  centreX(col: number): number {
    return this.minX + (col + 0.5) * this.cell;
  }

  centreZ(row: number): number {
    return this.minZ + (row + 0.5) * this.cell;
  }

  isWalkable(cell: number): boolean {
    return this.walkable[cell] === 1;
  }

  /** Centre of a cell, written into `out` (no allocation). */
  centre(cell: number, out: Vec2): Vec2 {
    out.x = this.centreX(cell % this.cols);
    out.z = this.centreZ(Math.floor(cell / this.cols));
    return out;
  }

  /** The walkable cell nearest to (x, z), searching rings up to `maxRing` cells out; -1 if none. */
  nearestWalkable(x: number, z: number, maxRing = 8): number {
    const c0 = this.colOf(x);
    const r0 = this.rowOf(z);
    const start = r0 * this.cols + c0;
    if (this.walkable[start] === 1) return start;
    let best = -1;
    let bestD = Infinity;
    for (let ring = 1; ring <= maxRing; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const col = c0 + dc;
          const row = r0 + dr;
          if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) continue;
          const i = row * this.cols + col;
          if (this.walkable[i] !== 1) continue;
          const d = (this.centreX(col) - x) ** 2 + (this.centreZ(row) - z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
      if (best !== -1) return best;
    }
    return -1;
  }

  /**
   * Whether a bot can walk the straight segment from `a` to `b` without
   * touching anything: every grid cell sampled along it (every half cell) is
   * walkable. Conservative near walls, which is what we want.
   */
  segmentWalkable(a: Vec2, b: Vec2): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (this.walkable[this.cellAt(a.x + dx * t, a.z + dz * t)] !== 1) return false;
    }
    return true;
  }

  /**
   * A* from `from` to `to` (8 neighbours, no cutting corners). Both ends snap
   * to the nearest walkable cell. Returns the cells to walk through, start
   * excluded, goal included; [] when already there; null when unreachable or
   * the search hit its expansion cap.
   */
  findPath(from: Vec2, to: Vec2): number[] | null {
    const start = this.nearestWalkable(from.x, from.z);
    const goal = this.nearestWalkable(to.x, to.z);
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [];

    const id = ++this.searchId;
    const cols = this.cols;
    const gc = goal % cols;
    const gr = Math.floor(goal / cols);
    const h = (i: number) => {
      const dc = Math.abs((i % cols) - gc);
      const dr = Math.abs(Math.floor(i / cols) - gr);
      return dc + dr + (SQRT2 - 2) * Math.min(dc, dr);
    };

    this.heap.length = 0;
    this.heapF.length = 0;
    this.seen[start] = id;
    this.g[start] = 0;
    this.parent[start] = -1;
    this.push(start, h(start));

    let expansions = 0;
    while (this.heap.length > 0) {
      const cur = this.pop();
      if (this.closed[cur] === id) continue;
      this.closed[cur] = id;
      if (cur === goal) return this.unwind(goal);
      if (++expansions > MAX_EXPANSIONS) return null;

      const col = cur % cols;
      const row = Math.floor(cur / cols);
      const gCur = this.g[cur] ?? 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nc = col + dc;
          const nr = row + dr;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= this.rows) continue;
          const n = nr * cols + nc;
          if (this.walkable[n] !== 1 || this.closed[n] === id) continue;
          // Diagonal: both side cells must be open, or the bot would clip the corner.
          if (dr !== 0 && dc !== 0 && (this.walkable[row * cols + nc] !== 1 || this.walkable[nr * cols + col] !== 1)) continue;
          const ng = gCur + (dr !== 0 && dc !== 0 ? SQRT2 : 1);
          if (this.seen[n] === id && ng >= (this.g[n] ?? Infinity)) continue;
          this.seen[n] = id;
          this.g[n] = ng;
          this.parent[n] = cur;
          this.push(n, ng + h(n));
        }
      }
    }
    return null;
  }

  private unwind(goal: number): number[] {
    const path: number[] = [];
    for (let i = goal; this.parent[i] !== -1; i = this.parent[i] ?? -1) path.push(i);
    return path.reverse();
  }

  private forCellsIn(minX: number, maxX: number, minZ: number, maxZ: number, fn: (i: number, x: number, z: number) => void) {
    const c0 = this.colOf(minX);
    const c1 = this.colOf(maxX);
    const r0 = this.rowOf(minZ);
    const r1 = this.rowOf(maxZ);
    for (let row = r0; row <= r1; row++) {
      const z = this.centreZ(row);
      for (let col = c0; col <= c1; col++) fn(row * this.cols + col, this.centreX(col), z);
    }
  }

  // Binary min-heap on f, in two parallel arrays.
  private push(cell: number, f: number) {
    const heap = this.heap;
    const fs = this.heapF;
    let i = heap.length;
    heap.push(cell);
    fs.push(f);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((fs[p] ?? 0) <= f) break;
      heap[i] = heap[p] ?? 0;
      fs[i] = fs[p] ?? 0;
      i = p;
    }
    heap[i] = cell;
    fs[i] = f;
  }

  private pop(): number {
    const heap = this.heap;
    const fs = this.heapF;
    const top = heap[0] ?? -1;
    const lastCell = heap.pop() ?? 0;
    const lastF = fs.pop() ?? 0;
    const n = heap.length;
    if (n === 0) return top;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= n) break;
      const r = l + 1;
      const c = r < n && (fs[r] ?? 0) < (fs[l] ?? 0) ? r : l;
      if ((fs[c] ?? 0) >= lastF) break;
      heap[i] = heap[c] ?? 0;
      fs[i] = fs[c] ?? 0;
      i = c;
    }
    heap[i] = lastCell;
    fs[i] = lastF;
    return top;
  }
}
