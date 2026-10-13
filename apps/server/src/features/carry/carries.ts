/** A teammate in a throw's flight (#11): who threw them and what they already hit. Server-only. */
export interface Flight {
  /** Session id of the thrower (for the hit events and the round stats). */
  by: string;
  /** Where the body was at the end of the last check: the next check sweeps from here. */
  x: number;
  z: number;
  /** Unit direction of the throw: CRS hit are knocked along it. */
  dirX: number;
  dirZ: number;
  /** CRS and props already hit: each at most once per flight. */
  hit: Set<string>;
  /** Already bounced back off a CRS: further CRS on the way are bowled over without turning it round again. */
  bounced: boolean;
}

/**
 * Who carries whom and who is flying (#11). Server-only; the room mirrors
 * `carriedBy` onto the carried player and applies every effect. The rules
 * (who can pick up whom, when a carry ends) are the pure functions in
 * @manif/shared `carry/`. One carry per player, either side: a carrier can't
 * be carried and nobody carries two.
 */
export class Carries {
  /** Carrier -> carried teammate, and when the carry started (room time). */
  private readonly pairs = new Map<string, { target: string; since: number }>();
  /** Carried -> carrier. */
  private readonly carriers = new Map<string, string>();
  private readonly flights = new Map<string, Flight>();

  /** Start a carry. False if either player is already in one. */
  pickUp(carrierId: string, targetId: string, now: number): boolean {
    if (carrierId === targetId || this.inCarry(carrierId) || this.inCarry(targetId)) return false;
    this.pairs.set(carrierId, { target: targetId, since: now });
    this.carriers.set(targetId, carrierId);
    return true;
  }

  inCarry(id: string): boolean {
    return this.pairs.has(id) || this.carriers.has(id);
  }

  /** The teammate `carrierId` carries, or null. */
  carriedOf(carrierId: string): string | null {
    return this.pairs.get(carrierId)?.target ?? null;
  }

  /** Who carries `id`, or null. */
  carrierOf(id: string): string | null {
    return this.carriers.get(id) ?? null;
  }

  isCarried(id: string): boolean {
    return this.carriers.has(id);
  }

  isCarrying(id: string): boolean {
    return this.pairs.has(id);
  }

  /** Every carry: [carrier, carried, seconds held]. A copy, so the caller may end carries while iterating. */
  all(now: number): [string, string, number][] {
    return Array.from(this.pairs, ([carrier, p]) => [carrier, p.target, now - p.since]);
  }

  /** End the carry `id` is in (either side). Returns [carrier, carried], or null if none. */
  release(id: string): [string, string] | null {
    const carrier = this.pairs.has(id) ? id : this.carriers.get(id);
    if (carrier === undefined) return null;
    const pair = this.pairs.get(carrier);
    if (!pair) return null;
    this.pairs.delete(carrier);
    this.carriers.delete(pair.target);
    return [carrier, pair.target];
  }

  startFlight(id: string, by: string, x: number, z: number, dirX: number, dirZ: number): void {
    this.flights.set(id, { by, x, z, dirX, dirZ, hit: new Set(), bounced: false });
  }

  flight(id: string): Flight | undefined {
    return this.flights.get(id);
  }

  isFlying(id: string): boolean {
    return this.flights.has(id);
  }

  endFlight(id: string): void {
    this.flights.delete(id);
  }

  /** Every flight, a copy (a hit may end one, or a disconnect remove it, meanwhile). */
  allFlights(): [string, Flight][] {
    return Array.from(this.flights);
  }

  /** A player left: their flight goes; their carry is ended by the room first (it drops the teammate). */
  remove(id: string): void {
    this.release(id);
    this.flights.delete(id);
  }

  clear(): void {
    this.pairs.clear();
    this.carriers.clear();
    this.flights.clear();
  }
}
