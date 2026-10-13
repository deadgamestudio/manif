/*
 * PLACEHOLDER LOOK for the water jet (#17 pompiers' hose, reused by the CRS
 * water cannon #13): a thin bright stream, a faint cone showing what the
 * water reaches, and droplets flying along it. Primitives only; a real
 * effect (Jordan's) replaces it here without touching WaterJet's logic.
 */
export const JET_LOOK = {
  /** The stream: radius at the nozzle and at the far end, metres. */
  streamNear: 0.05,
  streamFar: 0.22,
  streamColor: "#bfe9ff",
  streamOpacity: 0.85,
  /** The cone of what the water reaches. */
  coneColor: "#64b5f6",
  coneOpacity: 0.16,
  /** The jet drops this far over its length (it is water, it falls). */
  sag: 0.6,
  /** Droplets flying along the jet: how many, size, how many times a second each runs its length. */
  drops: 10,
  dropSize: 0.09,
  dropColor: "#e3f6ff",
  dropRate: 1.6,
  /** How fast the jet grows to full length when turned on, and shrinks when off (per second, 0..1). */
  growRate: 6,
} as const;
