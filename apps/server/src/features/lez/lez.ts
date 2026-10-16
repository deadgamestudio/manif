import type { MapSchema } from "@colyseus/schema";
import {
  LEZ,
  LEZ_ID,
  LeZPhase,
  benanasEntry,
  cameoArrives,
  douaneExit,
  freshCameoSchedule,
  freshHelmet,
  hitHelmet,
  leZAuraOn,
  leZPost,
  leZProfilingOn,
  leZRally,
  pickLeZLine,
  resolveCircle,
  steerTo,
  truckBays,
  type CameoSchedule,
  type CollisionWorld,
  type CrsRally,
  type Helmet,
  type LeZLineKind,
  type Level,
  type MeleeTarget,
  type NavAgent,
  type NavContext,
  type Vec2,
} from "@manif/shared";
import { CameoStage } from "../cameo/index.js";
import { LeZView } from "./schema.js";

/** What the room does for him. */
export interface LeZHost {
  /** He was chased off: `ids` landed hits and share the bonus. */
  chasedOff(ids: readonly string[]): void;
}

/** What the event needs of the room each tick. */
export interface LeZTick {
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
  /** Where the CRS on their feet stand (none out): he stands behind those near the front. */
  crs: readonly Vec2[];
}

interface Visit {
  phase: LeZPhase;
  until: number;
  agent: NavAgent & { input: Vec2; body: Vec2 };
  goal: Vec2;
  goalAt: number;
  hits: Helmet;
  /** Chased off: standing there with his line until then, then running (null once running). */
  fleeAt: number | null;
  /** A shove from a hit he took, m/s, fading. */
  kick: Vec2;
  /** The last line he said (index into LEZ_LINES); shown only while the stage gives him the bubble. */
  line: number;
  /** He holds forth again no sooner (LEZ.talkEvery after his last line). */
  talkAt: number;
  hurts: number;
  /** Facing, radians (0 faces +Z). */
  rotation: number;
}

/** A hit fades out over about this long. */
const KICK_DAMP = 6;

/**
 * Le Z (#133), server-side: the roll each minute of march (#132), his arrival
 * from a side street behind the CRS, his spot behind them near the front,
 * his ring that fires up the CRS around him (`rally`), the profiling while he
 * is here (`profiling`), his lines in turn with the other cameos, and being
 * chased off by the protesters' hits. Mirrors what clients draw into `state.lez`.
 *
 * He is no CRS: not in the squad, not a CRS target, never in `state.players`.
 * He fights nobody and nobody in blue hits him.
 */
export class LeZEvent {
  /** This round's arrival roll (#132), null between rounds. */
  private schedule: CameoSchedule | null = null;
  private visit: Visit | null = null;
  private duration: number = LEZ.duration;
  /** Room time of the last call that moved the event on, for the synced line. */
  private now = 0;
  private readonly doors: Vec2[];
  /** Down the street (the CRS side), a unit vector. */
  private readonly ahead: Vec2;
  /** His ring as the CRS read it, reused. */
  private readonly ring: CrsRally = leZRally({ x: 0, z: 0 });

  constructor(
    private readonly level: Level,
    private readonly views: MapSchema<LeZView>,
    private readonly random: () => number = Math.random,
    private readonly log: (message: string) => void = () => {},
    /** The speaking turn shared with the other cameos (#132). */
    private readonly stage: CameoStage = new CameoStage(random),
  ) {
    this.doors = truckBays(level, LEZ.radius).map((b) => b.door);
    this.stage.watch(() => this.sync());
    const { from, to } = level.progress;
    const len = Math.hypot(to.x - from.x, to.z - from.z) || 1;
    this.ahead = { x: (to.x - from.x) / len, z: (to.z - from.z) / len };
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
    this.stage.hush(LEZ_ID, this.now);
    this.duration = LEZ.duration;
    this.views.clear();
  }

  /** Whether he is on the street. */
  get here(): boolean {
    return this.visit !== null;
  }

  /** His phase while on the street, else null. */
  get phase(): LeZPhase | null {
    return this.visit?.phase ?? null;
  }

  /** His position while on the street, else null. */
  get position(): Vec2 | null {
    return this.visit?.agent.body ?? null;
  }

  /** His ring for the CRS (`CrsSquad.setRally`) while he holds forth, else null. */
  get rally(): CrsRally | null {
    const v = this.visit;
    if (!v || !leZAuraOn(v.phase)) return null;
    return leZRally(v.agent.body, this.ring);
  }

  /** Whether the CRS profile right now (see `leZProfiling`): while he holds forth or walks off, not once chased. */
  get profiling(): boolean {
    return leZProfilingOn(this.phase);
  }

  /** What a swing or a throw can hit (#4, #8): him until he's chased off, else nothing. */
  target(): MeleeTarget | null {
    const v = this.visit;
    if (!v || v.phase === LeZPhase.Chased) return null;
    return { id: LEZ_ID, shape: { type: "circle", x: v.agent.body.x, z: v.agent.body.z, r: LEZ.radius } };
  }

  /** DEBUG (#133): arrive now at `at` (or his usual way in), holding forth for `seconds`. Ignored while he is already here. */
  force(tick: Pick<LeZTick, "now" | "front" | "rear">, at?: Vec2, seconds?: number): boolean {
    if (this.visit) return false;
    this.now = tick.now;
    // A forced visit is this round's visit.
    if (this.schedule) this.schedule.came = true;
    this.duration = seconds ?? LEZ.duration;
    this.arrive(tick.now, at ?? benanasEntry(this.level, this.doors, tick.front, tick.rear));
    return true;
  }

  /** DEBUG (#133): chased off now, nobody credited. False when he isn't here or already is. */
  forceChase(now: number): boolean {
    const v = this.visit;
    if (!v || v.phase === LeZPhase.Chased) return false;
    this.now = now;
    v.hits.hp = 0;
    this.chase(v, now);
    this.sync();
    return true;
  }

  /**
   * A protester `by` hits him (a swing or anything thrown, one hit each; a
   * `tomato` has its own line), from (fromX, fromZ). He staggers; the last
   * hit chases him off and every protester who landed one shares the bonus
   * (`host.chasedOff`). Returns true when the hit counted.
   */
  hurt(by: string, fromX: number, fromZ: number, now: number, host: LeZHost, tomato = false): boolean {
    const v = this.visit;
    if (!v || v.phase === LeZPhase.Chased) return false;
    this.now = now;
    const b = v.agent.body;
    const off = hitHelmet(v.hits, by);
    v.hurts = (v.hurts + 1) % 256;
    const dx = b.x - fromX;
    const dz = b.z - fromZ;
    const d = Math.hypot(dx, dz);
    if (d > 1e-6) {
      v.kick.x = (dx / d) * LEZ.hurtImpulse;
      v.kick.z = (dz / d) * LEZ.hurtImpulse;
    }
    if (off) {
      this.chase(v, now);
      host.chasedOff([...v.hits.hitters]);
    } else this.say(v, tomato ? "tomato" : "hit", now, false);
    this.sync();
    return true;
  }

  /** One tick: the arrival when due, then his walk to his spot, his lines, and the end of each phase. */
  step(tick: LeZTick): void {
    this.now = tick.now;
    if (!this.visit) {
      if (!this.schedule || !cameoArrives(this.schedule, tick.elapsed, tick.timeLeft, LEZ.duration, LEZ.chance, this.random)) return;
      this.duration = LEZ.duration;
      this.arrive(tick.now, benanasEntry(this.level, this.doors, tick.front, tick.rear));
    }
    const v = this.visit;
    if (!v) return;
    const { now } = tick;
    const b = v.agent.body;

    if (v.phase === LeZPhase.Holding && now >= v.until) {
      v.phase = LeZPhase.Leaving;
      v.until = now + LEZ.leaveTimeout;
      v.goal = douaneExit(this.doors, b, tick.rear);
      v.agent.path = null;
      this.say(v, "leave", now, true);
      this.log("lez: leaving");
    } else if (v.phase === LeZPhase.Chased && v.fleeAt !== null && now >= v.fleeAt) {
      // The linger is over: off to his studio.
      v.fleeAt = null;
      v.goal = douaneExit(this.doors, b, tick.rear);
      v.agent.path = null;
    } else if (v.phase !== LeZPhase.Holding && now >= v.until) {
      this.visit = null;
      this.views.clear();
      this.stage.hush(LEZ_ID, now);
      this.log("lez: gone");
      return;
    }

    let speed: number = LEZ.speed;
    if (v.phase === LeZPhase.Holding) {
      if (now >= v.goalAt) {
        const post = leZPost(this.level, tick.crs, tick.front);
        const p = resolveCircle(tick.world, post.x, post.z, LEZ.radius);
        v.goal = { x: p.x, z: p.z };
        v.goalAt = now + LEZ.regoalInterval;
      }
      // He holds forth now and then, when the stage gives him the turn.
      if (now >= v.talkAt) this.say(v, "talk", now, false);
    } else if (v.phase === LeZPhase.Chased) speed = v.fleeAt !== null ? 0 : LEZ.fleeSpeed;

    const near = v.phase === LeZPhase.Holding ? LEZ.arriveRadius : 0.4;
    const arrived = Math.hypot(v.goal.x - b.x, v.goal.z - b.z) <= near;
    if (arrived) {
      v.agent.input.x = 0;
      v.agent.input.z = 0;
      v.agent.path = null;
      if (v.phase !== LeZPhase.Holding && v.fleeAt === null) v.until = Math.min(v.until, now + 0.5);
    } else steerTo(v.agent, v.goal.x, v.goal.z, { nav: tick.nav, now, bots: [] });
    const step = speed * tick.dt;
    const k = Math.exp(-KICK_DAMP * tick.dt);
    const p = resolveCircle(tick.world, b.x + v.agent.input.x * step + v.kick.x * tick.dt, b.z + v.agent.input.z * step + v.kick.z * tick.dt, LEZ.radius);
    v.kick.x *= k;
    v.kick.z *= k;
    b.x = p.x;
    b.z = p.z;
    if (v.phase === LeZPhase.Holding && arrived) {
      // Standing behind the CRS: he faces the cortège, finger raised.
      v.rotation = Math.atan2(-this.ahead.x, -this.ahead.z);
    } else if ((v.agent.input.x !== 0 || v.agent.input.z !== 0) && speed > 0) v.rotation = Math.atan2(v.agent.input.x, v.agent.input.z);
    this.sync();
  }

  private chase(v: Visit, now: number): void {
    v.phase = LeZPhase.Chased;
    v.fleeAt = now + LEZ.chasedLinger;
    v.goal = { x: v.agent.body.x, z: v.agent.body.z };
    v.until = now + LEZ.chasedLinger + LEZ.leaveTimeout;
    v.agent.path = null;
    v.agent.input.x = 0;
    v.agent.input.z = 0;
    this.say(v, "chased", now, true);
    this.log(`lez: chased off by ${[...v.hits.hitters].join(", ") || "nobody"}`);
  }

  private arrive(now: number, at: Vec2): void {
    const body = { x: at.x, z: at.z };
    this.visit = {
      phase: LeZPhase.Holding,
      until: now + this.duration,
      agent: {
        id: LEZ_ID,
        body,
        stats: { radius: LEZ.radius, repathInterval: 1 },
        path: null,
        pathIndex: 0,
        pathGoal: { x: body.x, z: body.z },
        repathAt: 0,
        input: { x: 0, z: 0 },
      },
      goal: { x: body.x, z: body.z },
      goalAt: now,
      hits: freshHelmet(LEZ.hp),
      fleeAt: null,
      kick: { x: 0, z: 0 },
      line: -1,
      talkAt: now,
      hurts: 0,
      rotation: Math.atan2(-this.ahead.x, -this.ahead.z),
    };
    this.say(this.visit, "arrive", now, true);
    this.log(`lez: arrives at x=${at.x.toFixed(1)} z=${at.z.toFixed(1)} for ${this.duration} s`);
    this.sync();
  }

  /** A line of `kind`, if the stage gives him the bubble (`key`: a moment that always speaks, #132). */
  private say(v: Visit, kind: LeZLineKind, now: number, key: boolean): void {
    if (!this.stage.say(LEZ_ID, now, key)) return;
    v.line = pickLeZLine(kind, v.line, this.random);
    v.talkAt = now + LEZ.talkEvery;
  }

  /** Mirror him into `state.lez` (only what changed is sent). */
  private sync(): void {
    const v = this.visit;
    if (!v) return;
    let view = this.views.get(LEZ_ID);
    if (!view) {
      view = new LeZView();
      this.views.set(LEZ_ID, view);
    }
    const b = v.agent.body;
    view.x = b.x;
    view.z = b.z;
    if (Math.abs(v.rotation - view.rotation) > 0.01) view.rotation = v.rotation;
    if (view.phase !== v.phase) view.phase = v.phase;
    // #132: -1 (no bubble) between his bursts, or while another cameo has the bubble.
    const line = this.stage.showing(LEZ_ID, this.now) ? v.line : -1;
    if (view.line !== line) view.line = line;
    if (view.hurts !== v.hurts) view.hurts = v.hurts;
  }
}
