import { healRate, stepHeal, type AuraSubject } from "@manif/shared";

/**
 * Heal auras (#14, the CGT's merguez and sound system), server-side: the
 * fraction of an HP each protester is owed, so a slow rate still heals in
 * whole HP. The rule (no stacking, never yourself) is `healRate` in
 * @manif/shared; the room applies the HP through `Healths.heal`.
 */
export class HealAuras {
  private readonly carry = new Map<string, number>();

  /**
   * One tick: the whole HP each of `targets` gets from `healers` (both free
   * protesters; the caller filters). Healers are few (a CGT or two), so this
   * is targets x healers, a handful of distance checks. Returns [id, hp] for
   * every target healed at least 1 HP this tick.
   */
  step(targets: Iterable<AuraSubject>, healers: readonly AuraSubject[], dt: number): [string, number][] {
    const out: [string, number][] = [];
    if (healers.length === 0) {
      this.carry.clear();
      return out;
    }
    for (const t of targets) {
      const res = stepHeal(this.carry.get(t.id) ?? 0, healRate(t, healers), dt);
      if (res.carry > 0) this.carry.set(t.id, res.carry);
      else this.carry.delete(t.id);
      if (res.heal > 0) out.push([t.id, res.heal]);
    }
    return out;
  }

  remove(id: string): void {
    this.carry.delete(id);
  }

  clear(): void {
    this.carry.clear();
  }
}
