import type { MapSchema } from "@colyseus/schema";
import {
  DOUANE,
  DOUANE_ID,
  DOUANE_JET,
  DOUANE_SKINS,
  DouanePhase,
  JetPushes,
  JetSoak,
  aimJet,
  cameoArrives,
  douaneEntry,
  douaneExit,
  douaneGoal,
  freshCameoSchedule,
  freshSprayClock,
  hasLineOfSight,
  inJet,
  jetContact,
  jetPush,
  pickDouaneLine,
  pickDouaneTarget,
  resolveCircle,
  steerTo,
  stepSprayClock,
  truckBays,
  type CameoSchedule,
  type CollisionWorld,
  type DouaneLineKind,
  type Level,
  type NavAgent,
  type NavContext,
  type Obstacles,
  type PropFire,
  type SprayClock,
  type Vec2,
  type WaterJet,
} from "@manif/shared";
import { CameoStage } from "../cameo/index.js";
import { DouaneView } from "./schema.js";

/** A body his water may reach this tick: a protester (not arrested) or a police bot (not out). */
export interface SoakBody extends Vec2 {
  readonly id: string;
  /** Body radius, for the cone test. */
  readonly r: number;
  /** A police bot (pushed through the squad), else a protester. */
  readonly bot: boolean;
  readonly onFire: boolean;
  /** Worth aiming at: on their feet and free (a protester), or active (a CRS). */
  readonly target: boolean;
}

/** What the room does for him. Ids may have just left: unknown ids are no-ops. */
export interface DouaneHost {
  /** Who is on the street now. Only asked while he is there. */
  bodies(): readonly SoakBody[];
  /** The burning props now. */
  fires(): Iterable<PropFire>;
  /** The jet pushes body `id` along (dirX, dirZ) with `strength` m/s, never flooring it. */
  push(body: SoakBody, dirX: number, dirZ: number, strength: number): void;
  /** Water put out prop `id`'s fire. */
  extinguish(id: string): boolean;
  /** Water on a burning body: flames out (and splats and stinks off a bot). */
  putOutBody(body: SoakBody): void;
}

/** What the event needs of the room each tick. */
export interface DouaneTick {
  now: number;
  dt: number;
  /** Seconds of march so far and left (`Round.elapsed`, `Round.timeLeft`): the clock of the arrival roll (#132). */
  elapsed: number;
  timeLeft: number;
  /** The cortège's front, 0..1. */
  front: number;
  /** The back of the cortège, where he comes in when no side street fits. */
  rear: Vec2;
  nav: NavContext["nav"];
  world: CollisionWorld;
}

interface Visit {
  phase: DouanePhase;
  until: number;
  agent: NavAgent & { input: Vec2; body: Vec2 };
  goal: Vec2;
  goalAt: number;
  targetId: string | null;
  /** The last line he said (index into DOUANE_LINES); shown only while the stage gives him the bubble. */
  line: number;
  gun: SprayClock;
  /** Facing, radians (0 faces +Z). */
  rotation: number;
  skin: number;
}

/**
 * La Douane (#120), server-side: the roll each minute of march (#132), his
 * arrival, his walk towards whoever is closest (protester or CRS), the water
 * gun in bursts, his lines (in turn with the other cameos, `CameoStage`), and
 * his walk home. Mirrors what clients draw into `state.douane`.
 *
 * He is nobody's target: never in `state.players`, never shown to the CRS,
 * not a body in anyone's collision world. So no baton, grab, punch, throw
 * or LBD ball can reach him, and he counts for no score and no round end.
 */
export class DouaneEvent {
  /** This round's arrival roll (#132), null between rounds. */
  private schedule: CameoSchedule | null = null;
  private visit: Visit | null = null;
  private duration: number = DOUANE.duration;
  /** Room time of the last call that moved the event on, for the synced line. */
  private now = 0;
  private readonly doors: Vec2[];
  private readonly soak = new JetSoak();
  private readonly pushes = new JetPushes();
  private jet: WaterJet = { x: 0, z: 0, dirX: 0, dirZ: 1 };

  constructor(
    private readonly level: Level,
    private readonly views: MapSchema<DouaneView>,
    /** What blocks the water (the static walls and obstacles). */
    private readonly obstacles: Obstacles,
    private readonly random: () => number = Math.random,
    private readonly log: (message: string) => void = () => {},
    /** The speaking turn shared with the other cameos (#132). */
    private readonly stage: CameoStage = new CameoStage(random),
  ) {
    this.doors = truckBays(level, DOUANE.radius).map((b) => b.door);
    this.stage.watch(() => this.sync());
  }

  /** A new round: nobody on the street, and his rolls start (one a minute of march, #132). */
  startRound(): void {
    this.clear();
    this.schedule = freshCameoSchedule();
  }

  /** Nobody on the street and no visit planned. */
  clear(): void {
    this.schedule = null;
    this.visit = null;
    this.stage.hush(DOUANE_ID, this.now);
    this.duration = DOUANE.duration;
    this.soak.clear();
    this.pushes.clear();
    this.views.clear();
  }

  /** Whether he is on the street. */
  get here(): boolean {
    return this.visit !== null;
  }

  /** His position while on the street, else null. */
  get position(): Vec2 | null {
    return this.visit?.agent.body ?? null;
  }

  /** DEBUG (#120): arrive now at `at` (or his usual way in), soaking for `seconds`. Ignored while he is already here. */
  force(tick: Pick<DouaneTick, "now" | "front" | "rear">, at?: Vec2, seconds?: number): boolean {
    if (this.visit) return false;
    this.now = tick.now;
    // A forced visit is this round's visit.
    if (this.schedule) this.schedule.came = true;
    this.duration = seconds ?? DOUANE.duration;
    this.arrive(tick.now, at ?? douaneEntry(this.level, this.doors, tick.front, tick.rear));
    return true;
  }

  /** One tick: the arrival when due, then his walk, the water and the end of each phase. */
  step(tick: DouaneTick, host: DouaneHost): void {
    this.now = tick.now;
    if (!this.visit) {
      if (!this.schedule || !cameoArrives(this.schedule, tick.elapsed, tick.timeLeft, DOUANE.duration, DOUANE.chance, this.random)) return;
      this.duration = DOUANE.duration;
      this.arrive(tick.now, douaneEntry(this.level, this.doors, tick.front, tick.rear));
    }
    const v = this.visit;
    if (!v) return;
    const { now } = tick;
    const b = v.agent.body;
    if (v.phase === DouanePhase.Soaking && now >= v.until) {
      v.phase = DouanePhase.Leaving;
      v.until = now + DOUANE.leaveTimeout;
      v.goal = douaneExit(this.doors, b, tick.rear);
      v.gun.on = false;
      v.targetId = null;
      v.agent.path = null;
      this.say(v, "leave", now, true);
      this.log("douane: leaving");
    } else if (v.phase === DouanePhase.Leaving && now >= v.until) {
      this.visit = null;
      this.views.clear();
      this.stage.hush(DOUANE_ID, now);
      this.soak.clear();
      this.pushes.clear();
      return;
    }

    let target: SoakBody | null = null;
    if (v.phase === DouanePhase.Soaking) {
      const bodies = host.bodies();
      if (now >= v.goalAt) {
        const picked = pickDouaneTarget(b, targets(bodies), v.targetId);
        v.targetId = picked?.id ?? null;
        v.goalAt = now + DOUANE.regoalInterval;
      }
      target = bodies.find((x) => x.id === v.targetId && x.target) ?? null;
      if (!target) v.targetId = null;
      v.goal = target ? douaneGoal(b, target) : { x: b.x, z: b.z };
      const d = target ? Math.hypot(target.x - b.x, target.z - b.z) : Infinity;
      const ready = target !== null && d - target.r <= DOUANE.sprayFrom && hasLineOfSight(this.obstacles, b, target);
      stepSprayClock(v.gun, now, ready);
      if (target && d > 1e-6) v.rotation = Math.atan2(target.x - b.x, target.z - b.z);
      if (v.gun.on) {
        // He shouts while he fires, when the stage gives him a turn (#132).
        this.say(v, "spray", now, false);
        this.jet = aimJet(b, target ?? b, v.rotation);
        this.spray(this.jet, bodies, now, tick.dt, host);
      }
    }

    // Walk: towards his target's stand-off point, or home.
    const near = v.phase === DouanePhase.Leaving ? 0.4 : 0.3;
    if (Math.hypot(v.goal.x - b.x, v.goal.z - b.z) <= near) {
      v.agent.input.x = 0;
      v.agent.input.z = 0;
      v.agent.path = null;
      if (v.phase === DouanePhase.Leaving) v.until = Math.min(v.until, now + 0.5);
    } else steerTo(v.agent, v.goal.x, v.goal.z, { nav: tick.nav, now, bots: [] });
    // He stands still to fire (he is a kid with a big gun).
    const speed = v.gun.on ? 0 : DOUANE.speed;
    const step = speed * tick.dt;
    const p = resolveCircle(tick.world, b.x + v.agent.input.x * step, b.z + v.agent.input.z * step, DOUANE.radius);
    b.x = p.x;
    b.z = p.z;
    if (!target && (v.agent.input.x !== 0 || v.agent.input.z !== 0) && speed > 0) v.rotation = Math.atan2(v.agent.input.x, v.agent.input.z);
    this.sync();
  }

  /**
   * The water for one tick, as the pompiers' hose (#17) does it: soaks the
   * fires it reaches, puts out burning bodies, and pushes everyone in it
   * along the jet, once per pushInterval each. Never through walls; never
   * hard enough to floor anyone; no damage.
   */
  private spray(jet: WaterJet, bodies: readonly SoakBody[], now: number, dt: number, host: DouaneHost): void {
    const h = DOUANE_JET;
    for (const f of host.fires()) {
      const at = jetContact(jet, h, f.shape);
      if (!at || !hasLineOfSight(this.obstacles, jet, at)) continue;
      if (!this.soak.pour(f.id, h.soakRate * dt)) continue;
      if (host.extinguish(f.id)) this.log(`douane: put out ${f.id}`);
    }
    for (const body of bodies) {
      if (!inJet(jet, h, body.x, body.z, body.r) || !hasLineOfSight(this.obstacles, jet, body)) continue;
      if (body.onFire || body.bot) host.putOutBody(body);
      if (!this.pushes.tryPush(body.id, now, h.pushInterval)) continue;
      const d = jetPush(jet, body.x, body.z);
      host.push(body, d.x, d.z, h.knockback);
    }
  }

  private arrive(now: number, at: Vec2): void {
    const body = { x: at.x, z: at.z };
    this.visit = {
      phase: DouanePhase.Soaking,
      until: now + this.duration,
      agent: {
        id: DOUANE_ID,
        body,
        stats: { radius: DOUANE.radius, repathInterval: 1 },
        path: null,
        pathIndex: 0,
        pathGoal: { x: body.x, z: body.z },
        repathAt: 0,
        input: { x: 0, z: 0 },
      },
      goal: { x: body.x, z: body.z },
      goalAt: now,
      targetId: null,
      line: -1,
      gun: freshSprayClock(now),
      rotation: 0,
      skin: Math.min(DOUANE_SKINS - 1, Math.floor(this.random() * DOUANE_SKINS)),
    };
    this.say(this.visit, "arrive", now, true);
    this.log(`douane: arrives at x=${at.x.toFixed(1)} z=${at.z.toFixed(1)} for ${this.duration} s`);
    this.sync();
  }

  /** A line of `kind`, if the stage gives him the bubble (`key`: a moment that always speaks, #132). */
  private say(v: Visit, kind: DouaneLineKind, now: number, key: boolean): void {
    if (!this.stage.say(DOUANE_ID, now, key)) return;
    v.line = pickDouaneLine(kind, v.line, this.random);
    this.stage.hold(DOUANE_ID, now, v.line);
  }

  /** Mirror him into `state.douane` (only what changed is sent). */
  private sync(): void {
    const v = this.visit;
    if (!v) return;
    let view = this.views.get(DOUANE_ID);
    if (!view) {
      view = new DouaneView();
      view.skin = v.skin;
      this.views.set(DOUANE_ID, view);
    }
    const b = v.agent.body;
    view.x = b.x;
    view.z = b.z;
    if (Math.abs(v.rotation - view.rotation) > 0.01) view.rotation = v.rotation;
    if (view.phase !== v.phase) view.phase = v.phase;
    // #132: -1 (no bubble) between his bursts, or while another cameo has the bubble.
    const line = this.stage.showing(DOUANE_ID, this.now) ? v.line : -1;
    if (view.line !== line) view.line = line;
    if (view.spraying !== v.gun.on) view.spraying = v.gun.on;
  }
}

function* targets(bodies: readonly SoakBody[]): Generator<SoakBody> {
  for (const b of bodies) if (b.target) yield b;
}
