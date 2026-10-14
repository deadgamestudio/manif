/**
 * Who broke, hit or threw something lately (#73, decision 1): the room marks
 * a protester on every prop or CRS hit and every throw, and the LBD only
 * aims at those marked in the last OFFENDER_MEMORY seconds (`isOffender`).
 * Plain room times, no Schema: nothing here is synced.
 */
export class Offenders {
  private readonly last = new Map<string, number>();

  /** Protester `id` broke, hit or threw something at room time `now`. */
  mark(id: string, now: number): void {
    const before = this.last.get(id);
    if (before === undefined || now > before) this.last.set(id, now);
  }

  /** Room time of their last offence, or undefined if none (the `ProtesterView.offendedAt` field). */
  lastAt(id: string): number | undefined {
    return this.last.get(id);
  }

  /** They left the street. */
  forget(id: string): void {
    this.last.delete(id);
  }

  /** A new round: everyone starts clean. */
  clear(): void {
    this.last.clear();
  }
}
