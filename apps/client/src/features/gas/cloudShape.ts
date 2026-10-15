/** Pure maths of how a gas cloud is drawn (#7, #28), shared by the placeholder and the model. */

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * The cloud's drawn size as a fraction of its radius, `age` seconds after it
 * appeared: a quick puff from a quarter of it, easing out to all of it.
 */
export function cloudGrowth(age: number, growIn: number): number {
  const g = growIn > 0 ? clamp01(age / growIn) : 1;
  return 0.25 + 0.75 * (1 - (1 - g) ** 3);
}

/** 1 until the last `fadeOut` seconds of the cloud, then down to 0 as it runs out. */
export function cloudFade(secondsLeft: number, fadeOut: number): number {
  return fadeOut > 0 ? clamp01(secondsLeft / fadeOut) : secondsLeft > 0 ? 1 : 0;
}
