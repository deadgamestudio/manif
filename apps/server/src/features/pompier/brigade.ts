import type { MapSchema } from "@colyseus/schema";
import {
  CRS_STATS,
  CrsKind,
  CrsStatus,
  FireClaims,
  JetPushes,
  JetSoak,
  PLAYER_RADIUS,
  aimJet,
  approachPoint,
  closestPoint,
  crewGoesBack,
  crsRadius,
  distanceToShape,
  downTooLong,
  hasLineOfSight,
  inJet,
  isDown,
  isPolice,
  jetContact,
  jetPush,
  pickAccidentalTarget,
  pickBay,
  pickFire,
  pompierBehaviour,
  resolveCircle,
  rollAccidentalSpray,
  shouldDispatchTruck,
  truckBays,
  truckMayLeave,
  type BrigadeStats,
  type CollisionWorld,
  type CrsBot,
  type HoseStats,
  type Level,
  type Obstacles,
  type PompierOrder,
  type PropFire,
  type TruckBay,
  type Vec2,
  type WaterJet,
} from "@manif/shared";
import type { CrsSquad } from "../crs/index.js";
import { TruckView } from "./schema.js";

/** A protester as the hose sees them. */
export interface HoseTarget extends Vec2 {
  readonly id: string;
  readonly onFire: boolean;
}

/** What the room does for the brigade. Every method takes ids that may have just left: unknown ids are no-ops. */
export interface BrigadeHost {
  /** The burning props now. */
  fires(): Iterable<PropFire>;
  /** Protesters the water can reach (not arrested). */
  protesters(): Iterable<HoseTarget>;
  /** The jet pushes protester `id` along (dirX, dirZ) with `strength` m/s (#2 knockback). */
  pushProtester(id: string, dirX: number, dirZ: number, strength: number): void;
  /** The jet pushes police bot `id`. */
  pushBot(id: string, dirX: number, dirZ: number, strength: number): void;
  /** Water put out prop `id`'s fire. */
  extinguish(id: string): boolean;
  /** Water on a burning protester or bot: flames out. */
  putOutBody(id: string): boolean;
  log(message: string): void;
}

/** Dev-only tuning (#17 scripted tests): override the brigade's numbers until the next round. */
export interface BrigadeTuning {
  delay?: number;
  crew?: number;
  spray?: number;
  extra?: number;
  soak?: number;
}

type TruckPhase = "arriving" | "parked" | "leaving";

interface Truck {
  readonly id: string;
  readonly bay: TruckBay;
  x: number;
  z: number;
  phase: TruckPhase;
  /** Its pompiers still on the street, by bot id. */
  readonly crew: Set<string>;
}

interface Job {
  readonly id: string;
  readonly truckId: string;
  readonly order: PompierOrder;
  /** Seconds spent knocked over since it last sprayed (#17: down too long gives up the fire). */
  downFor: number;
  /** Fires given up on (stuck), by id, until a room time. */
  readonly ignore: Map<string, number>;
  /** Stuck check while walking to its fire: the closest it got to the fire's edge, and when. */
  bestEdge: number;
  bestAt: number;
  /** The "accidental" spray on a CRS: who, until when. */
  accidental: { id: string; until: number } | null;
  /** Without a fire, it looks for one again at this room time (path searches are not free). */
  nextPickAt: number;
}

const BASE = CRS_STATS[CrsKind.Pompier];
const BASE_BRIGADE = BASE.brigade as BrigadeStats;
const BASE_HOSE = BASE.hose as HoseStats;
/** Progress towards its fire's edge needed within `stuckTime` not to count as stuck. */
const STUCK_PROGRESS = 0.5;
/** A truck counts as arrived this close to its spot. */
const ARRIVED = 0.05;
/** Pompiers get off side by side, this far apart along the barrier. */
const CREW_SPACING = 1;
/** A pompier with no fire it can take looks again this often, seconds. */
const REPICK_INTERVAL = 0.5;

/**
 * Server-side fire brigade (#17): fire trucks, synced as `state.trucks`, and
 * the work of their pompiers, who are bots of `CrsKind.Pompier` in the CRS
 * squad (so they count towards MAX_CRS, walk the same grid and get knocked
 * over like any bot). The decisions are the pure functions of
 * @manif/shared's pompier domain; the water jet is the shared one, the same
 * the water cannon (#13) will use. The room supplies a `BrigadeHost` for what
 * the water does to protesters, bots and fires.
 */
export class FireBrigade {
  private readonly trucks = new Map<string, Truck>();
  private readonly jobs = new Map<string, Job>();
  private readonly claims = new FireClaims();
  private readonly soak = new JetSoak();
  private readonly pushes = new JetPushes();
  private readonly bays: TruckBay[];
  private counter = 0;
  /** Room time the street last went from no fire to some fire; null while nothing burns. */
  private burningSince: number | null = null;
  /** Room time the last fire went out. */
  private allOutAt = 0;
  private lastTruckAt = -Infinity;
  private stats: BrigadeStats = BASE_BRIGADE;
  private hose: HoseStats = BASE_HOSE;
  /** Scratch, reused every tick. */
  private readonly fireList: PropFire[] = [];
  private readonly fireIds = new Set<string>();

  constructor(
    level: Level,
    private readonly squad: CrsSquad,
    private readonly world: CollisionWorld,
    /** What blocks the water (the static walls and obstacles). */
    private readonly obstacles: Obstacles,
    private readonly views: MapSchema<TruckView>,
    private readonly random: () => number = Math.random,
  ) {
    this.bays = truckBays(level, BASE.radius);
    squad.setBehaviour(CrsKind.Pompier, pompierBehaviour((id) => this.jobs.get(id)?.order));
  }

  /** Fire trucks on the street now. */
  get truckCount(): number {
    return this.trucks.size;
  }

  /** Pompiers on the street now. */
  get pompierCount(): number {
    return this.jobs.size;
  }

  /** DEBUG (#17, dev only): tune the next trucks, for scripted tests. Undefined keeps a value. */
  tune(t: BrigadeTuning): void {
    this.stats = {
      ...this.stats,
      ...(t.delay !== undefined && { arriveDelay: t.delay }),
      ...(t.crew !== undefined && { crew: t.crew }),
      ...(t.extra !== undefined && { extraTruckAfter: t.extra }),
    };
    if (t.spray !== undefined) this.hose = { ...this.hose, accidentalSprayChance: t.spray };
    if (t.soak !== undefined) this.hose = { ...this.hose, soakRate: t.soak };
  }

  /** Back to the unit table's numbers (a new round). */
  resetTuning(): void {
    this.stats = BASE_BRIGADE;
    this.hose = BASE_HOSE;
  }

  /** No truck and no pompier (a reset; the squad removes the bots itself). */
  clear(): void {
    for (const job of this.jobs.values()) this.squad.retire(job.id);
    this.trucks.clear();
    this.jobs.clear();
    this.claims.clear();
    this.soak.clear();
    this.pushes.clear();
    this.views.clear();
    this.burningSince = null;
    this.lastTruckAt = -Infinity;
  }

  /** A protester left. */
  remove(id: string): void {
    this.pushes.remove(id);
  }

  /** One tick, after the bots moved: trucks come and go, pompiers pick fires and spray. */
  step(now: number, dt: number, host: BrigadeHost): void {
    const fires = this.fireList;
    fires.length = 0;
    this.fireIds.clear();
    for (const f of host.fires()) {
      fires.push(f);
      this.fireIds.add(f.id);
    }
    if (fires.length > 0) this.burningSince ??= now;
    else if (this.burningSince !== null) {
      this.burningSince = null;
      this.allOutAt = now;
    }
    this.claims.keep((id) => this.fireIds.has(id));
    this.soak.keep((id) => this.fireIds.has(id));

    const view = {
      burning: fires.length,
      burningFor: this.burningSince === null ? 0 : now - this.burningSince,
      trucks: this.trucks.size,
      sinceLastTruck: now - this.lastTruckAt,
    };
    if (shouldDispatchTruck(view, this.stats)) this.dispatch(fires, now, host);

    for (const truck of Array.from(this.trucks.values())) this.stepTruck(truck, fires.length, dt, host);
    for (const job of Array.from(this.jobs.values())) this.stepJob(job, now, dt, host);
  }

  /** Send a truck to the side street nearest the first fire nobody works on yet. */
  private dispatch(fires: readonly PropFire[], now: number, host: BrigadeHost): void {
    const fire = fires.find((f) => this.claims.holder(f.id) === undefined) ?? fires[0];
    if (!fire) return;
    const used = new Set(Array.from(this.trucks.values(), (t) => t.bay.id));
    const bay = pickBay(this.bays, fire.slot, (id) => used.has(id));
    if (!bay) return;
    const id = `truck-${++this.counter}`;
    const truck: Truck = { id, bay, x: bay.out.x, z: bay.out.z, phase: "arriving", crew: new Set() };
    this.trucks.set(id, truck);
    this.lastTruckAt = now;
    const v = new TruckView();
    v.x = truck.x;
    v.z = truck.z;
    v.rotation = bay.rotation;
    v.parked = false;
    this.views.set(id, v);
    host.log(`fire: ${id} on its way to ${bay.id} for ${fire.id} (${this.trucks.size} trucks)`);
  }

  private stepTruck(truck: Truck, burning: number, dt: number, host: BrigadeHost): void {
    if (truck.phase === "arriving") {
      if (this.drive(truck, truck.bay.park, dt)) {
        truck.phase = "parked";
        if (burning > 0) this.unload(truck, host);
      }
    } else if (truck.phase === "parked") {
      for (const id of truck.crew) if (!this.jobs.has(id)) truck.crew.delete(id);
      if (truckMayLeave(truck.crew.size)) {
        truck.phase = "leaving";
        host.log(`fire: ${truck.id} leaves`);
      }
    } else if (this.drive(truck, truck.bay.out, dt)) {
      this.trucks.delete(truck.id);
      this.views.delete(truck.id);
      return;
    }
    const v = this.views.get(truck.id);
    if (!v) return;
    if (v.x !== truck.x) v.x = truck.x;
    if (v.z !== truck.z) v.z = truck.z;
    const parked = truck.phase === "parked";
    if (v.parked !== parked) v.parked = parked;
  }

  /** Move the truck towards `to` at its speed. True once there. Side streets only: nothing in the way. */
  private drive(truck: Truck, to: Vec2, dt: number): boolean {
    const dx = to.x - truck.x;
    const dz = to.z - truck.z;
    const d = Math.hypot(dx, dz);
    const step = this.stats.driveSpeed * dt;
    if (d <= Math.max(step, ARRIVED)) {
      truck.x = to.x;
      truck.z = to.z;
      return true;
    }
    truck.x += (dx / d) * step;
    truck.z += (dz / d) * step;
    return false;
  }

  /** The crew get off at the barrier, side by side, as many as the bot cap allows. */
  private unload(truck: Truck, host: BrigadeHost): void {
    const n = Math.max(0, Math.floor(this.stats.crew));
    const door = truck.bay.door;
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const at = resolveCircle(this.world, door.x, door.z + (i - (n - 1) / 2) * CREW_SPACING, BASE.radius);
      const bot = this.squad.spawn(at.x, at.z, CrsKind.Pompier);
      if (!bot) break;
      bot.rotation = truck.bay.rotation;
      truck.crew.add(bot.id);
      ids.push(bot.id);
      this.jobs.set(bot.id, {
        id: bot.id,
        truckId: truck.id,
        order: { goal: null, aim: null },
        downFor: 0,
        ignore: new Map(),
        bestEdge: Infinity,
        bestAt: 0,
        accidental: null,
        nextPickAt: 0,
      });
    }
    host.log(`fire: ${truck.id} parked at ${truck.bay.id}, crew ${ids.join(", ") || "none (bot cap)"}`);
  }

  private stepJob(job: Job, now: number, dt: number, host: BrigadeHost): void {
    const bot = this.squad.get(job.id);
    const truck = this.trucks.get(job.truckId);
    if (!bot || bot.gone || !truck) {
      this.drop(job);
      return;
    }
    const order = job.order;
    order.goal = null;
    order.aim = null;
    let spraying = false;
    try {
      // Knocked over (#17): the work pauses, the fire stays its own unless it stays down too long.
      if (isDown(bot.body) || bot.status === CrsStatus.Out) {
        job.downFor += dt;
        job.accidental = null;
        job.bestAt = now;
        if (downTooLong(job.downFor, this.stats) && this.claims.release(job.id) !== undefined) {
          host.log(`fire: ${job.id} stayed down too long, lets go of its fire`);
        }
        return;
      }
      const door = truck.bay.door;
      if (crewGoesBack(this.fireList.length)) {
        this.claims.release(job.id);
        order.goal = door;
        const home = Math.hypot(door.x - bot.body.x, door.z - bot.body.z) <= this.stats.boardReach;
        if (home || now - this.allOutAt >= this.stats.boardTimeout) {
          this.squad.retire(job.id);
          truck.crew.delete(job.id);
          this.drop(job);
          host.log(`fire: ${job.id} back on ${truck.id}${home ? "" : " (timed out)"}`);
        }
        return;
      }
      const fire = this.fireFor(job, bot, now, host);
      if (!fire) {
        // Every fire is someone else's (or out of reach): wait by the truck.
        order.goal = door;
        return;
      }
      const contact = closestPoint(fire.shape, bot.body);
      const edge = distanceToShape(fire.shape, bot.body.x, bot.body.z);
      if (edge > this.hose.sprayFrom || !hasLineOfSight(this.obstacles, bot.body, contact)) {
        order.goal = approachPoint(fire.shape, bot.body);
        this.checkStuck(job, fire, edge, now, host);
        return;
      }
      job.downFor = 0;
      job.bestEdge = edge;
      job.bestAt = now;
      spraying = true;
      const aim = this.accidentalAim(job, bot, fire, now, dt, host) ?? contact;
      order.aim = aim;
      this.spray(bot, aimJet(bot.body, aim, bot.rotation), now, dt, host);
    } finally {
      const v = this.squad.view(job.id);
      if (v && v.spraying !== spraying) v.spraying = spraying;
    }
  }

  /** The fire pompier `job` works on: its claim if still burning, else the nearest reachable unclaimed one (claimed now). */
  private fireFor(job: Job, bot: Readonly<CrsBot>, now: number, host: BrigadeHost): PropFire | null {
    const claimed = this.claims.claimOf(job.id);
    const mine = claimed === undefined ? undefined : this.fireList.find((f) => f.id === claimed);
    if (mine) return mine;
    if (now < job.nextPickAt) return null;
    job.nextPickAt = now + REPICK_INTERVAL;
    const pick = pickFire(
      job.id,
      this.fireList,
      this.claims,
      (f) => this.squad.pathLength(bot.body, approachPoint(f.shape, bot.body)),
      (id) => (job.ignore.get(id) ?? -Infinity) > now,
    );
    if (!pick) return null;
    this.claims.claim(pick.id, job.id);
    job.bestEdge = Infinity;
    job.bestAt = now;
    job.downFor = 0;
    host.log(`fire: ${job.id} takes ${pick.id}`);
    return pick;
  }

  /** Walking to its fire without getting closer for `stuckTime`: give it up for a while (someone else may get there). */
  private checkStuck(job: Job, fire: PropFire, edge: number, now: number, host: BrigadeHost): void {
    if (edge < job.bestEdge - STUCK_PROGRESS) {
      job.bestEdge = edge;
      job.bestAt = now;
      return;
    }
    if (now - job.bestAt < this.stats.stuckTime) return;
    job.ignore.set(fire.id, now + this.stats.giveUpTime);
    this.claims.release(job.id);
    job.bestEdge = Infinity;
    job.bestAt = now;
    host.log(`fire: ${job.id} stuck on the way to ${fire.id}, gives it up for ${this.stats.giveUpTime} s`);
  }

  /**
   * The "accidental" spray (#17): now and then (`accidentalSprayChance` per
   * second) the hose swings over a CRS standing by this fire, for
   * `accidentalTime`. Returns where to aim meanwhile, or null for the fire.
   */
  private accidentalAim(job: Job, bot: Readonly<CrsBot>, fire: PropFire, now: number, dt: number, host: BrigadeHost): Vec2 | null {
    const h = this.hose;
    const a = job.accidental;
    if (a) {
      const victim = this.squad.get(a.id);
      if (now < a.until && victim && victim.status !== CrsStatus.Out && Math.hypot(victim.body.x - bot.body.x, victim.body.z - bot.body.z) <= h.range + 1) {
        return victim.body;
      }
      job.accidental = null;
      return null;
    }
    if (!rollAccidentalSpray(h.accidentalSprayChance, dt, this.random)) return null;
    const police = this.squad.all.filter((b) => isPolice(b.kind) && b.status !== CrsStatus.Out).map((b) => ({ id: b.id, x: b.body.x, z: b.body.z }));
    const victim = pickAccidentalTarget(fire.shape, bot.body, police, h.accidentalRange, h.range);
    if (!victim) return null;
    job.accidental = { id: victim.id, until: now + h.accidentalTime };
    host.log(`fire: ${job.id} "accidentally" sprays ${victim.id}`);
    return victim;
  }

  /**
   * The water jet for one tick (shared with the water cannon, #13): soaks
   * the fires it reaches (out at FIRE_SOAK), puts out burning bodies, washes
   * splats and stinks off bots, and pushes everyone in it along the jet, once
   * per `pushInterval` each. Never through walls; never the pompiers
   * themselves.
   */
  private spray(self: Readonly<CrsBot>, jet: WaterJet, now: number, dt: number, host: BrigadeHost): void {
    const h = this.hose;
    for (const f of this.fireList) {
      if (!this.fireIds.has(f.id)) continue;
      const at = jetContact(jet, h, f.shape);
      if (!at || !hasLineOfSight(this.obstacles, jet, at)) continue;
      if (!this.soak.pour(f.id, h.soakRate * dt)) continue;
      if (host.extinguish(f.id)) {
        this.fireIds.delete(f.id);
        host.log(`fire: ${self.id} put out ${f.id}`);
      }
    }
    for (const p of host.protesters()) {
      if (!inJet(jet, h, p.x, p.z, PLAYER_RADIUS) || !hasLineOfSight(this.obstacles, jet, p)) continue;
      if (p.onFire) host.putOutBody(p.id);
      if (!this.pushes.tryPush(p.id, now, h.pushInterval)) continue;
      const d = jetPush(jet, p.x, p.z);
      host.pushProtester(p.id, d.x, d.z, h.knockback);
    }
    for (const b of this.squad.all) {
      if (b.id === self.id || !isPolice(b.kind) || b.status === CrsStatus.Out) continue;
      if (!inJet(jet, h, b.body.x, b.body.z, crsRadius(b.kind, b.mount)) || !hasLineOfSight(this.obstacles, jet, b.body)) continue;
      host.putOutBody(b.id);
      this.squad.wash(b.id);
      if (!this.pushes.tryPush(b.id, now, h.pushInterval)) continue;
      const d = jetPush(jet, b.body.x, b.body.z);
      host.pushBot(b.id, d.x, d.z, h.knockback);
    }
  }

  private drop(job: Job): void {
    this.claims.release(job.id);
    this.jobs.delete(job.id);
    this.pushes.remove(job.id);
    const truck = this.trucks.get(job.truckId);
    truck?.crew.delete(job.id);
  }
}
