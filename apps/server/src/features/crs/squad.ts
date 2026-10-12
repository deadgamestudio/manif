import type { MapSchema } from "@colyseus/schema";
import {
  CRS_RESPAWN_DELAY,
  CRS_SPAWN_CLEARANCE,
  CRS_STATS,
  CrsKind,
  CrsStatus,
  MAX_CRS,
  NavGrid,
  createCrsBot,
  hitCrs,
  isDown,
  pickSpawn,
  stepCrs,
  stunCrs,
  vanDoors,
  type CollisionWorld,
  type CrsBehaviour,
  type CrsBot,
  type CrsContext,
  type CrsHitResult,
  type CrsHost,
  type Level,
  type MeleeTarget,
  type Vec2,
} from "@manif/shared";
import { Crs } from "./schema.js";

/** Rotation changes smaller than this are not sent (radians). */
const ROTATION_EPSILON = 0.01;

/**
 * Server-side police bots (#5). Holds each bot's full state (target, path,
 * timers, body) and mirrors the synced fields into `state.crs`. The AI itself
 * is the pure `stepCrs` from @manif/shared; the room supplies a `CrsHost` for
 * the effects on protesters.
 *
 * Spawning: `spawn` puts one bot at a point, under the MAX_CRS cap.
 * `spawnAtStart` places the first wave when the host starts. Until the round
 * loop (#12) exists, a bot taken out is replaced after CRS_RESPAWN_DELAY,
 * keeping `reinforceTo` bots on the street; #12 sets `reinforceTo` to 0 and
 * calls `spawn` itself for its waves.
 */
export class CrsSquad {
  /** Keep this many bots on the street by replacing those taken out. 0 turns it off (#12). */
  reinforceTo = 0;
  private readonly bots: CrsBot[] = [];
  private readonly byId = new Map<string, CrsBot>();
  private readonly nav: NavGrid;
  private readonly vans: Vec2[];
  private readonly ctx: CrsContext;
  /** Room times when a replacement is due. */
  private respawnAt: number[] = [];
  private counter = 0;

  constructor(
    private readonly level: Level,
    private readonly world: CollisionWorld,
    private readonly views: MapSchema<Crs>,
    private readonly behaviour?: CrsBehaviour,
  ) {
    // One grid for every unit type, cleared for the widest of them.
    const clearance = Math.max(...Object.values(CRS_STATS).map((s) => s.radius));
    this.nav = new NavGrid(world, clearance);
    this.vans = vanDoors(level);
    this.ctx = { world, nav: this.nav, vans: this.vans, bots: this.bots, now: 0, dt: 0 };
  }

  get size(): number {
    return this.bots.length;
  }

  get(id: string): Readonly<CrsBot> | undefined {
    return this.byId.get(id);
  }

  /** The collision world changed (a prop broke): re-rasterize the navigation grid. */
  worldChanged(): void {
    this.nav.rebuild(this.world);
  }

  /** Remove every bot. */
  clear(): void {
    this.bots.length = 0;
    this.byId.clear();
    this.views.clear();
    this.respawnAt = [];
  }

  /** Add one bot at (x, z), facing the start of the street. Null at the MAX_CRS cap. */
  spawn(x: number, z: number, kind: CrsKind = CrsKind.Crs): CrsBot | null {
    if (this.bots.length >= MAX_CRS) return null;
    const id = `crs-${++this.counter}`;
    // Facing +Z: towards the start, where the cortège comes from.
    const bot = createCrsBot(id, kind, x, z, 0);
    this.bots.push(bot);
    this.byId.set(id, bot);
    const view = new Crs();
    view.kind = kind;
    this.mirror(bot, view);
    this.views.set(id, view);
    return bot;
  }

  /** The first wave when the host starts: one bot on each of the level's first `count` spawn points. */
  spawnAtStart(count: number): void {
    const points = this.level.crsSpawns;
    for (let i = 0; i < count && points.length > 0; i++) {
      const p = points[i % points.length]!;
      // A second lap around the points shifts sideways so bots don't stack.
      const lap = Math.floor(i / points.length);
      this.spawn(p.x - Math.sign(p.x || 1) * lap * 1.2, p.z);
    }
  }

  /** What a protester's swing can land on: every bot not out, as a circle. */
  *meleeTargets(): Generator<MeleeTarget> {
    for (const bot of this.bots) {
      if (bot.status === CrsStatus.Out) continue;
      yield { id: bot.id, shape: { type: "circle", x: bot.body.x, z: bot.body.z, r: bot.stats.radius } };
    }
  }

  /** A protester's melee (#4) lands on bot `id`, swung from (fromX, fromZ). Null for an unknown or out bot. */
  hit(id: string, fromX: number, fromZ: number, damage: number, now: number): CrsHitResult | null {
    const bot = this.byId.get(id);
    if (!bot) return null;
    const res = hitCrs(bot, fromX, fromZ, damage, now);
    const view = this.views.get(id);
    if (res && view) this.mirror(bot, view);
    return res;
  }

  /** Stun bot `id` (a pavé, #8). It lets go of any grab on its next tick. */
  stun(id: string, now: number, duration?: number): boolean {
    const bot = this.byId.get(id);
    if (!bot || !stunCrs(bot, now, duration)) return false;
    const view = this.views.get(id);
    if (view) this.mirror(bot, view);
    return true;
  }

  /**
   * One fixed tick for every bot, after the protesters have moved. Bots that
   * have been out long enough are removed (and a replacement scheduled).
   * `protesters` is where replacements avoid spawning.
   */
  step(now: number, dt: number, host: CrsHost, protesters: () => Vec2[]): void {
    this.ctx.now = now;
    this.ctx.dt = dt;
    for (let i = this.bots.length - 1; i >= 0; i--) {
      const bot = this.bots[i]!;
      if (bot.status === CrsStatus.Out && now >= bot.statusUntil) this.remove(i, now);
    }
    for (const bot of this.bots) {
      stepCrs(bot, this.ctx, host, this.behaviour);
      const view = this.views.get(bot.id);
      if (view) this.mirror(bot, view);
    }
    this.reinforce(now, protesters);
  }

  private remove(index: number, now: number): void {
    const bot = this.bots[index]!;
    this.bots.splice(index, 1);
    this.byId.delete(bot.id);
    this.views.delete(bot.id);
    if (this.reinforceTo > 0) this.respawnAt.push(now + CRS_RESPAWN_DELAY);
  }

  private reinforce(now: number, protesters: () => Vec2[]): void {
    if (this.respawnAt.length === 0) return;
    const due = this.respawnAt.filter((t) => now >= t).length;
    if (due === 0) return;
    this.respawnAt = this.respawnAt.filter((t) => now < t);
    const people = protesters();
    for (let i = 0; i < due && this.bots.length < this.reinforceTo; i++) {
      const p = pickSpawn(this.level.crsSpawns, people, CRS_SPAWN_CLEARANCE);
      if (p) this.spawn(p.x, p.z);
    }
  }

  /** Copy the synced fields, only where they changed, so a still bot costs nothing in the patch. */
  private mirror(bot: CrsBot, view: Crs): void {
    if (view.x !== bot.body.x) view.x = bot.body.x;
    if (view.z !== bot.body.z) view.z = bot.body.z;
    if (Math.abs(view.rotation - bot.rotation) > ROTATION_EPSILON) view.rotation = bot.rotation;
    if (view.hp !== bot.hp) view.hp = bot.hp;
    if (view.status !== bot.status) view.status = bot.status;
    const down = isDown(bot.body);
    if (view.down !== down) view.down = down;
  }
}
