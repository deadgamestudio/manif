// Water jets (#17): the pompiers' hose now, the CRS water cannon (#13) later.
// One effect, one set of numbers per user. Distances in world units, speeds
// in m/s, durations in seconds of room time.

/** What one water jet does. A pompier's hose is a small one; a water cannon is the same effect, bigger. */
export interface WaterJetStats {
  /** How far the jet reaches from the nozzle. */
  range: number;
  /** Half the opening angle of the cone, radians. */
  halfAngle: number;
  /** Knockback on a body in the jet, m/s, along the jet. At KNOCKDOWN_THRESHOLD (10) or more it also floors. */
  knockback: number;
  /** A body that stays in the jet is pushed again after this long (one push per body per interval). */
  pushInterval: number;
  /** Water poured on each fire the jet reaches, per second. A fire goes out at FIRE_SOAK. */
  soakRate: number;
}

/** Water a burning prop needs before it goes out. A pompier's hose (soakRate 1) takes this many seconds. */
export const FIRE_SOAK = 2;
