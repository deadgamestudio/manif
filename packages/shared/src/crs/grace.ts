/**
 * Fair play with the CRS (#131), grown out of #70's baton knockdown flag.
 *
 * - A protester a baton floored is not "down" enough to be grabbed for it
 *   (#70, see `isWeakened`): `floored`, forgotten once they stand (`stand`).
 * - A short grace (CRS_GRACE) after struggling free, after getting back up
 *   from any knockdown, and after coming back into the street (a respawn or a
 *   mid-march join): no CRS may baton or grab them, and the CRS look for
 *   someone else meanwhile. Gas, water and the LBD still apply: it is only
 *   about not being beaten in a loop.
 *
 * Server-side bookkeeping keyed by protester id, times in seconds of room
 * time. The room asks it before every baton hit and grab, shows the grace on
 * the player (`Player.grace`), and hands it to the bots through
 * `ProtesterView.batonDown` and `ProtesterView.graced`.
 */
import { RESPAWN_INVULNERABILITY } from "../health/index.js";
import { CRS_GRACE } from "./constants.js";

export class CrsGrace {
  private readonly batonDowned = new Set<string>();
  private readonly until = new Map<string, number>();

  /** A baton (or anything that should count as one, #123) floored `id` (#70). */
  floored(id: string): void {
    this.batonDowned.add(id);
  }

  /** Whether `id`, lying `down` right now, was floored by a baton (#70). */
  isBatonDown(id: string, down: boolean): boolean {
    return down && this.batonDowned.has(id);
  }

  /** `id` is on their feet: a baton knockdown is forgotten (#70). */
  stand(id: string): void {
    this.batonDowned.delete(id);
  }

  /** Freed from a grab at `now` (#131): struggled free, pulled out by a teammate, or let go by a CRS. */
  freed(id: string, now: number): void {
    this.grant(id, now);
  }

  /** Back on their feet at `now` after any knockdown (#131). The baton knockdown is forgotten too. */
  gotUp(id: string, now: number): void {
    this.stand(id);
    this.grant(id, now);
  }

  /** Back from the van at `now` (#131): the grace runs on past the respawn invulnerability, which already blocks everything. */
  respawned(id: string, now: number): void {
    this.grant(id, now, RESPAWN_INVULNERABILITY + CRS_GRACE);
  }

  /** Joined the street mid-march at `now` (#131). */
  joined(id: string, now: number): void {
    this.grant(id, now);
  }

  /** No CRS baton or grab on `id` for `seconds` from `now` (the longer wins over one already running). */
  grant(id: string, now: number, seconds = CRS_GRACE): void {
    if (!(seconds > 0)) return;
    const until = now + seconds;
    if (until > (this.until.get(id) ?? -Infinity)) this.until.set(id, until);
  }

  /** Whether `id` is in their grace at `now`. */
  isGraced(id: string, now: number): boolean {
    const until = this.until.get(id);
    return until !== undefined && now < until;
  }

  /** `id` left the street. */
  remove(id: string): void {
    this.batonDowned.delete(id);
    this.until.delete(id);
  }

  clear(): void {
    this.batonDowned.clear();
    this.until.clear();
  }
}
