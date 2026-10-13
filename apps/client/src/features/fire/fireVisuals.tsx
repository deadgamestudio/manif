/*
 * PLACEHOLDER LOOKS for fire (#16). Flat emissive cones and grey spheres, all
 * in this one file, so real flames and smoke (Jordan's) can replace them
 * without touching the views. Cheap on the GPU: unlit materials, no lights,
 * a handful of meshes per fire, nothing synced per particle.
 */
import { Color } from "three";

/**
 * Flames on a burning prop: a few cones around its centre, flickering. Sizes
 * are fractions of the synced fire radius (the prop plus its hurt zone), so a
 * car gets bigger flames than a bin. Intensity 1..3 scales their height.
 */
export const FLAME_LOOK = {
  /** Cones as [angle, distance from the centre, base radius, height], distance, radius and height as fractions of the fire radius. */
  cones: [
    [0, 0, 0.32, 1.1],
    [0.9, 0.35, 0.22, 0.75],
    [2.6, 0.38, 0.24, 0.85],
    [4.3, 0.33, 0.2, 0.7],
  ] as readonly (readonly [number, number, number, number])[],
  /** Outer flame and inner core colours. */
  outer: "#ff6a00",
  inner: "#ffd23f",
  /** The core is this much smaller than its cone. */
  core: 0.55,
  /** The flames start this high (on top of a bin or a car roof, roughly). */
  baseY: 0.7,
  /** Height factor per intensity (index 0 unused). */
  intensityScale: [0, 0.45, 0.8, 1.1] as readonly number[],
  /** Flicker: how much each cone stretches, and how fast. */
  flicker: 0.25,
  flickerSpeed: 13,
  /** A new fire flares up over this long, seconds. */
  growIn: 0.5,
} as const;

/** Black smoke puffs rising above a fire and fading, looped. */
export const SMOKE_LOOK = {
  color: "#2b2b2b",
  puffs: 4,
  /** Size of a puff, world units, growing by `grow` over its rise. */
  size: 0.35,
  grow: 1.4,
  /** How high a puff rises above the flames before it vanishes, and how long it takes, seconds. */
  rise: 3,
  period: 2.2,
  opacity: 0.55,
  /** Sideways drift over the rise. */
  drift: 0.6,
} as const;

/** A charred prop: everything goes this colour. */
export const CHARRED_COLOR = new Color("#2a2522");

/** The slapstick bum on fire: small flames behind a burning body, and the frantic flail. */
export const BODY_FLAME_LOOK = {
  /** Cones as [x, y, z offset from the body's feet in its own frame, height]. Behind (-z) and low: the bum. */
  cones: [
    [0, 0.55, -0.35, 0.55],
    [0.15, 0.7, -0.3, 0.4],
    [-0.15, 0.65, -0.32, 0.45],
  ] as readonly (readonly [number, number, number, number])[],
  radius: 0.14,
  color: "#ff7b00",
  core: "#ffe066",
  flickerSpeed: 18,
} as const;

/** A burning body flails: faster and wider than a grabbed one (radians, per second). */
export const ON_FIRE_FLAIL_ANGLE = 0.45;
export const ON_FIRE_FLAIL_SPEED = 26;

/** The bar over someone holding interact to light a prop or pat someone out. */
export const HOLD_BAR_COLOR = "#ff8a00";

/** HUD lines. */
export const FIRE_TEXT = {
  onFire: "Au feu ! Ton derrière brûle : cours, ou fais-toi éteindre (E maintenu par un·e camarade)",
  putOut: (name: string) => `Maintiens E pour éteindre ${name} !`,
  light: (what: string) => `Maintiens E pour mettre le feu ${what}`,
  /** What a prop kind is called in the prompt. */
  kinds: { bin: "à la poubelle", car: "à la voiture", bus_shelter: "à l'abribus", shop_window: "à la vitrine" } as Record<string, string>,
} as const;
