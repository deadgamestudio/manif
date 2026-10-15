/*
 * Where the two bodies of a grab pair are drawn (#28). Jordan's clips stay
 * in place; pairs.json says where the CRS stands relative to the protester
 * (`gltf_crs_offset`, `gltf_crs_yaw_radians`, in the protester's frame: +Z
 * forward, Y up). Here it is turned around: the protester in the CRS's frame.
 *
 * The server owns the positions. The pair is drawn as one rigid piece,
 * centred on the midpoint of the two server positions and turned so that the
 * CRS faces along the line to the protester. Each body is then off its server
 * spot by half the difference between the server gap and the authored one
 * (about 0.15 m), well under MAX_DRIFT, so hits and rescues still land on
 * what players see.
 *
 * Yaw convention (three.js `rotation.y`, as the server's `rotation`): local +Z
 * points to (sin θ, cos θ) on the ground, local +X to (cos θ, -sin θ).
 */
import type { PairClips } from "./phase.ts";

/** A pairs.json entry: the CRS relative to the protester. */
export interface PairOffset {
  /** gltf_crs_offset, x and z (y is 0). */
  x: number;
  z: number;
  /** gltf_crs_yaw_radians. */
  yaw: number;
}

/** animations-saisies-v02/pairs.json, collar (the same for every profile). */
export const STANDING_COLLAR: PairOffset = { x: 0, z: 0.61, yaw: Math.PI };
/** animations-trainage-v02/pairs.json, collar. */
export const GROUND_COLLAR: PairOffset = { x: 0.15, z: -0.95, yaw: 0 };

export function offsetFor(stance: PairClips["stance"]): PairOffset {
  return stance === "standing" ? STANDING_COLLAR : GROUND_COLLAR;
}

/** The protester relative to the CRS: position in the CRS's frame, and yaw on top of the CRS's. */
export interface VictimInCrs {
  x: number;
  z: number;
  yaw: number;
}

/**
 * Invert a pairs.json offset. CRS = victim + R(vy)·c with CRS yaw vy + cy, so
 * victim = CRS - R(vy)·c = CRS + R(θ)·(-R(-cy)·c), θ being the CRS's yaw.
 */
export function victimInCrs(o: PairOffset): VictimInCrs {
  const c = Math.cos(-o.yaw);
  const s = Math.sin(-o.yaw);
  // R(-cy)·c, then negated.
  const x = -(o.x * c + o.z * s);
  const z = -(-o.x * s + o.z * c);
  return { x: clean(x), z: clean(z), yaw: -o.yaw };
}

/** Where to draw both bodies. */
export interface PairPose {
  /** The midpoint of the pair. */
  cx: number;
  cz: number;
  /** The CRS's yaw. */
  yaw: number;
}

/** A body in the world: ground position and yaw. */
export interface Placed {
  x: number;
  z: number;
  yaw: number;
}

/**
 * The pose that puts the pair on the server positions (`crs`, `victim`): the
 * midpoint, and the CRS yaw that lines the authored offset `rel` up with the
 * line from the CRS to the protester. Bodies on the same spot: the CRS keeps
 * `fallbackYaw` (its server facing, turned to face the trail behind it).
 */
export function targetPose(crsX: number, crsZ: number, victimX: number, victimZ: number, rel: VictimInCrs, fallbackYaw: number, out: PairPose): PairPose {
  out.cx = (crsX + victimX) / 2;
  out.cz = (crsZ + victimZ) / 2;
  const dx = victimX - crsX;
  const dz = victimZ - crsZ;
  out.yaw = dx * dx + dz * dz < 1e-6 ? fallbackYaw : Math.atan2(dx, dz) - Math.atan2(rel.x, rel.z);
  return out;
}

/** The two bodies of pose `p` for offset `rel`. */
export function placeBodies(p: PairPose, rel: VictimInCrs, crs: Placed, victim: Placed): void {
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  // R(θ)·rel, halved either side of the midpoint.
  const hx = (rel.x * c + rel.z * s) / 2;
  const hz = (-rel.x * s + rel.z * c) / 2;
  crs.x = p.cx - hx;
  crs.z = p.cz - hz;
  crs.yaw = p.yaw;
  victim.x = p.cx + hx;
  victim.z = p.cz + hz;
  victim.yaw = p.yaw + rel.yaw;
}

/** A body is never drawn further than this from its server position, metres. */
export const MAX_DRIFT = 0.5;

/**
 * Pull body `b` back within MAX_DRIFT of its server spot (`x`, `z`), if the
 * smoothing left it behind. Returns the shift applied (0 when within).
 */
export function clampDrift(b: Placed, x: number, z: number): number {
  const dx = b.x - x;
  const dz = b.z - z;
  const d = Math.hypot(dx, dz);
  if (d <= MAX_DRIFT) return 0;
  const k = MAX_DRIFT / d;
  b.x = x + dx * k;
  b.z = z + dz * k;
  return d - MAX_DRIFT;
}

/** The shortest signed turn from angle `from` to `to`, in (-π, π]. */
export function turn(from: number, to: number): number {
  const d = to - from;
  return Math.atan2(Math.sin(d), Math.cos(d));
}

function clean(v: number): number {
  return Math.abs(v) < 1e-9 ? 0 : v;
}
