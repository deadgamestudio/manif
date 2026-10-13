/*
 * PLACEHOLDER LOOKS for tear gas (#7). Flat-coloured primitives and one CSS
 * overlay, all in this one file, so real models and effects (Jordan's) can
 * replace them without touching the views.
 */
import type { CSSProperties } from "react";

/** The canister: a small grey-green can, tumbling along a lob. */
export const CANISTER_LOOK = {
  radius: 0.09,
  length: 0.32,
  color: "#5f6b55",
  /** Height of the throw and the landing, and the extra height at the top of the lob. */
  flightY: 1.5,
  arcHeight: 3,
  /** Tumble speed, radians per second. */
  spin: 10,
} as const;

/**
 * The cloud: a few translucent puffs that grow in when the canister lands,
 * drift a little, and fade out over the last seconds. Comic green-grey.
 */
export const CLOUD_LOOK = {
  color: "#a4b98a",
  opacity: 0.42,
  /** Puffs around the centre, as [angle offset, distance from the centre, size], distance and size as fractions of the cloud radius. */
  puffs: [
    [0, 0, 0.62],
    [0.2, 0.55, 0.48],
    [1.3, 0.6, 0.44],
    [2.4, 0.52, 0.5],
    [3.5, 0.6, 0.42],
    [4.6, 0.55, 0.47],
    [5.6, 0.45, 0.4],
  ] as readonly (readonly [number, number, number])[],
  /** Puffs sit this high (fraction of their size), so the cloud hugs the ground. */
  lift: 0.45,
  /** Grow-in time and the fade-out at the end, in seconds. */
  growIn: 0.6,
  fadeOut: 1.5,
  /** Gentle bob and slow turn of the whole cloud. */
  bob: 0.12,
  turnSpeed: 0.25,
} as const;

/** A gassed protester coughs: a slow, lopsided wobble (radians, per second). */
export const COUGH_ANGLE = 0.18;
export const COUGH_SPEED = 7;

/** The screen when the local player is in the gas: a green-grey vignette that comes and goes. */
export const GAS_SCREEN_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  pointerEvents: "none",
  background: "radial-gradient(ellipse at center, rgb(164 185 138 / 0.08) 35%, rgb(120 140 90 / 0.55) 100%)",
  transition: "opacity 400ms ease-out",
};

/** The little line shown on the screen while coughing. */
export const COUGH_TEXT = "Kof kof ! Les lacrymos piquent les yeux";

export const COUGH_TEXT_STYLE: CSSProperties = {
  position: "fixed",
  bottom: 24,
  left: "50%",
  transform: "translateX(-50%)",
  padding: "4px 12px",
  borderRadius: 6,
  background: "rgb(0 0 0 / 0.5)",
  color: "#e6f0d8",
  font: "600 15px/1.4 system-ui, sans-serif",
  pointerEvents: "none",
};
