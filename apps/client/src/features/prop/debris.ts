/**
 * Cosmetic debris (#4). Each client simulates its own pieces when it sees a
 * prop break: nothing here is synced, and debris never collides with players
 * (they only bounce on the ground). A fixed pool, so a riot can't allocate
 * without bound: when full, the oldest pieces are reused.
 */

export const MAX_DEBRIS = 240;
const GRAVITY = 18;
const LIFETIME = 2.6;
const FADE = 0.6;
const BOUNCE = 0.35;
const GROUND_FRICTION = 0.6;

export interface DebrisPiece {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  spin: number;
  size: number;
  color: string;
  /** Seconds left; 0 = free slot. */
  life: number;
}

export const pieces: DebrisPiece[] = Array.from({ length: MAX_DEBRIS }, () => ({
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  rx: 0,
  ry: 0,
  rz: 0,
  spin: 0,
  size: 0,
  color: "#ffffff",
  life: 0,
}));
let cursor = 0;

export interface DebrisBurst {
  x: number;
  z: number;
  /** Height the burst starts from. */
  y: number;
  count: number;
  colors: readonly string[];
  /** Typical piece size, world units. */
  size: number;
  /** Horizontal launch speed, m/s. Goofy: big. */
  speed: number;
}

/** Spray `count` pieces from a point. Cosmetic only. */
export function spawnDebris(b: DebrisBurst): void {
  for (let i = 0; i < b.count; i++) {
    const p = pieces[cursor]!;
    cursor = (cursor + 1) % MAX_DEBRIS;
    const a = Math.random() * Math.PI * 2;
    const s = b.speed * (0.4 + Math.random() * 0.8);
    p.x = b.x + (Math.random() - 0.5) * 0.6;
    p.y = b.y * (0.3 + Math.random() * 0.7);
    p.z = b.z + (Math.random() - 0.5) * 0.6;
    p.vx = Math.cos(a) * s;
    p.vz = Math.sin(a) * s;
    p.vy = 4 + Math.random() * 6;
    p.rx = Math.random() * Math.PI;
    p.ry = Math.random() * Math.PI;
    p.rz = Math.random() * Math.PI;
    p.spin = (Math.random() - 0.5) * 20;
    p.size = b.size * (0.5 + Math.random());
    p.color = b.colors[i % b.colors.length] ?? "#ffffff";
    p.life = LIFETIME * (0.7 + Math.random() * 0.3);
  }
}

/** Advance every live piece. Returns how many are alive. */
export function stepDebris(dt: number): number {
  let alive = 0;
  for (const p of pieces) {
    if (p.life <= 0) continue;
    p.life = Math.max(0, p.life - dt);
    p.vy -= GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.y < p.size / 2) {
      p.y = p.size / 2;
      p.vy = Math.abs(p.vy) > 1 ? -p.vy * BOUNCE : 0;
      const k = Math.exp(-GROUND_FRICTION * 10 * dt);
      p.vx *= k;
      p.vz *= k;
      p.spin *= k;
    }
    p.rx += p.spin * dt;
    p.rz += p.spin * 0.7 * dt;
    if (p.life > 0) alive++;
  }
  return alive;
}

/** Scale of a piece: shrinks away during its last FADE seconds. */
export function debrisScale(p: DebrisPiece): number {
  return p.life <= 0 ? 0 : p.size * Math.min(1, p.life / FADE);
}

export function clearDebris(): void {
  for (const p of pieces) p.life = 0;
}
