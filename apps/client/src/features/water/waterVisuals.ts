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

/**
 * Jordan's water jet (#28): twelve packets of water streaming along +Z from
 * the nozzle, 2.38 m long and sagging 0.38 m at scale 1, one run of the 2 s
 * loop. Stretched to the jet's range and to the placeholder's sag, so it ends
 * where the faint cone (what the water reaches) ends, and thickened to read
 * at phone size. Played faster on a short jet, so the water always flies at
 * `speed`.
 */
export const JET_MODEL = {
  length: 2.38,
  sag: 0.38,
  /** How long one packet takes from the nozzle to the end, seconds, as authored. */
  loop: 2.04,
  /** Sideways thickening of the packets (they are 0.1 m wide at scale 1). */
  width: 4,
  /** Metres per second. */
  speed: 7,
} as const;
