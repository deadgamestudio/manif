import { FIRE_REACH, zoneGrowth } from "@manif/shared";

/**
 * How big a burning prop's flames are drawn, `age` seconds after it caught
 * (#16, #91): `r` is the hurt zone's radius right now (it grows from the
 * prop's edge to the synced radius), `height` the flames' height factor from
 * the intensity (`look.intensityScale`), flaring up from nothing over
 * `look.growIn` seconds. `look` is FLAME_LOOK.
 */
export function flameSize(
  radius: number,
  intensity: number,
  age: number,
  look: { readonly growIn: number; readonly intensityScale: readonly number[] },
): { r: number; height: number } {
  const grow = look.growIn > 0 ? Math.min(1, Math.max(0, age / look.growIn)) : 1;
  return {
    r: radius - FIRE_REACH * (1 - zoneGrowth(age)),
    height: (look.intensityScale[intensity] ?? 1) * grow,
  };
}
