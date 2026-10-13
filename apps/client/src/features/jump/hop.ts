import { JUMP_DURATION, jumpHeight } from "@manif/shared";

/** Landing squash (#45): how long it lasts (s) and how much it flattens. */
export const LAND_TIME = 0.18;
export const LAND_SQUASH = 0.25;
/** How fast a hop cut short (floored, grabbed) settles back down, per second. */
const SETTLE_RATE = 18;

/**
 * The cosmetic hop of one avatar (#45), stepped once per frame from the
 * synced `airborne` flag: the server never sends a height. The arc runs on
 * local time from when the flag was first seen; when the flag clears early
 * (a knock-down mid-hop), the height settles down quickly instead of snapping.
 */
export class HopArc {
  /** Height to draw the body at, metres. */
  lift = 0;
  /** 0..1: the landing squash, 1 right at touch-down. */
  squash = 0;
  /** True on the frame the hop starts (for a dust puff). */
  tookOff = false;
  private airborne = false;
  private elapsed = 0;

  update(dt: number, airborne: boolean): void {
    const frame = Number.isFinite(dt) && dt > 0 ? dt : 0;
    this.tookOff = airborne && !this.airborne;
    if (this.tookOff) this.elapsed = 0;
    if (!airborne && this.airborne) this.squash = 1;
    this.airborne = airborne;
    if (airborne) {
      this.elapsed += frame;
      // Past the end of the arc while the landing patch is on its way: stay on the ground.
      this.lift = jumpHeight(Math.min(this.elapsed, JUMP_DURATION), JUMP_DURATION);
    } else {
      this.lift *= Math.exp(-SETTLE_RATE * frame);
      if (this.lift < 1e-3) this.lift = 0;
    }
    this.squash = Math.max(0, this.squash - frame / LAND_TIME);
  }

  reset(): void {
    this.lift = 0;
    this.squash = 0;
    this.airborne = false;
    this.elapsed = 0;
    this.tookOff = false;
  }
}
