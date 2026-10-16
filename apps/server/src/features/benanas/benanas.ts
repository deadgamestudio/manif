import type { MapSchema } from "@colyseus/schema";
import {
  BENANAS,
  BENANAS_ID,
  BenanasPhase,
  backOffGoal,
  benanasDue,
  benanasEntry,
  crowdedOut,
  douaneExit,
  freshHelmet,
  hitHelmet,
  inPunchReach,
  pickBenanasLine,
  pickBenanasTarget,
  resolveCircle,
  rollBenanas,
  steerTo,
  truckBays,
  type BenanasLineKind,
  type BenanasSeen,
  type CollisionWorld,
  type Helmet,
  type Level,
  type MeleeTarget,
  type NavAgent,
  type NavContext,
  type Vec2,
} from "@manif/shared";
import { BenanasView } from "./schema.js";

/** A protester as the room shows him (#123). */
export interface BenanasBody extends BenanasSeen {
  /** Body radius, for his punch's reach. */
  readonly r: number;
}

/** What the room does for him. Ids may have just left: unknown ids are no-ops. */
export interface BenanasHost {
  /** The protesters on the street (not arrested). Only asked while he is there. */
  people(): readonly BenanasBody[];
  /** His punch lands on `id`, along (dirX, dirZ): HP off and a knockdown, through the room's usual hooks. False if it didn't take. */
  punch(id: string, dirX: number, dirZ: number): boolean;
  /** His helmet came off: `ids` landed hits and share the bonus. */
  unmasked(ids: readonly string[]): void;
}

/** What the event needs of the room each tick. */
export interface BenanasTick {
  now: number;
  dt: number;
  /** The cortège's front, 0..1. */
  front: number;
  /** The back of the cortège, where he comes in when no side street fits. */
  rear: Vec2;
  nav: NavContext["nav"];
  world: CollisionWorld;
}

interface Visit {
  phase: BenanasPhase;
  until: number;
  agent: NavAgent & { input: Vec2; body: Vec2 };
  goal: Vec2;
  goalAt: number;
  targetId: string | null;
  /** Backing off until then (a crowd closed in): no target. */
  backOffUntil: number;
  /** His next punch, no sooner. */
  hitAt: number;
  /** Protesters he hit lately, by id: when he leaves them alone until. */
  spared: Map<string, number>;
  helmet: Helmet;
  /** Unmasked: standing there with his line until then, then running (null once running). */
  fleeAt: number | null;
  /** A shove from a hit he took, m/s, fading. */
  kick: Vec2;
  lineAt: number;
  line: number;
  swings: number;
  hurts: number;
  /** Facing, radians (0 faces +Z). */
  rotation: number;
}

/** A hit fades out over about this long. */
const KICK_DAMP = 6;

/**
 * Alexandre Bénanas (#123), server-side: the roll at the start of a round,
 * his arrival from a side street ahead of the front (behind the CRS line),
 * his prowl after lone protesters, his punch (through the room's knockdown
 * path), backing off when a group closes in, and his helmet coming off
 * under the protesters' hits. Mirrors what clients draw into `state.benanas`.
 *
 * He is no CRS: not in the squad, not shown to the bots in blue (they don't
 * target him, help him or count him), never in `state.players`. He grabs
 * and arrests nobody.
 */
export class BenanasEvent {
  private plan: number | null = null;
  private visit: Visit | null = null;
  private duration: number = BENANAS.duration;
  private readonly doors: Vec2[];
  /** Down the street (the CRS side), a unit vector: where he backs off when nothing else tells him. */
  private readonly ahead: Vec2;

  constructor(
    private readonly level: Level,
    private readonly views: MapSchema<BenanasView>,
    private readonly random: () => number = Math.random,
    private readonly log: (message: string) => void = () => {},
  ) {
    this.doors = truckBays(level, BENANAS.radius).map((b) => b.door);
    const { from, to } = level.progress;
    const len = Math.hypot(to.x - from.x, to.z - from.z) || 1;
    this.ahead = { x: (to.x - from.x) / len, z: (to.z - from.z) / len };
  }

  /** A new round: nobody on the street, and the roll for this one. Returns the arrival point, or null. */
  startRound(): number | null {
    this.clear();
    this.plan = rollBenanas(this.random);
    if (this.plan !== null) this.log(`benanas: rolled, arrives at ${Math.round(this.plan * 100)}%`);
    return this.plan;
  }

  /** Nobody on the street and no visit planned. */
  clear(): void {
    this.plan = null;
    this.visit = null;
    this.duration = BENANAS.duration;
    this.views.clear();
  }

  /** Whether he is on the street. */
  get here(): boolean {
    return this.visit !== null;
  }

  /** His phase while on the street, else null. */
  get phase(): BenanasPhase | null {
    return this.visit?.phase ?? null;
  }

  /** His position while on the street, else null. */
  get position(): Vec2 | null {
    return this.visit?.agent.body ?? null;
  }

  /** What a swing or a throw can hit (#4, #8): him while his helmet is on, else nothing. */
  target(): MeleeTarget | null {
    const v = this.visit;
    if (!v || v.phase === BenanasPhase.Unmasked) return null;
    return { id: BENANAS_ID, shape: { type: "circle", x: v.agent.body.x, z: v.agent.body.z, r: BENANAS.radius } };
  }

  /** DEBUG (#123): arrive now at `at` (or his usual way in), prowling for `seconds`. Ignored while he is already here. */
  force(tick: Pick<BenanasTick, "now" | "front" | "rear">, at?: Vec2, seconds?: number): boolean {
    if (this.visit) return false;
    this.plan = null;
    this.duration = seconds ?? BENANAS.duration;
    this.arrive(tick.now, at ?? benanasEntry(this.level, this.doors, tick.front, tick.rear));
    return true;
  }

  /** DEBUG (#123): his helmet comes off now, nobody credited. False when he isn't here or it is off already. */
  forceUnmask(now: number): boolean {
    const v = this.visit;
    if (!v || v.phase === BenanasPhase.Unmasked) return false;
    v.helmet.hp = 0;
    this.unmask(v, now);
    this.sync();
    return true;
  }

  /**
   * A protester `by` hits him (a swing or anything thrown, one hit each),
   * from (fromX, fromZ). He staggers a little; the last hit takes his
   * helmet off and every protester who landed one shares the bonus
   * (`host.unmasked`). Returns true when the hit counted.
   */
  hurt(by: string, fromX: number, fromZ: number, now: number, host: BenanasHost): boolean {
    const v = this.visit;
    if (!v || v.phase === BenanasPhase.Unmasked) return false;
    const b = v.agent.body;
    const off = hitHelmet(v.helmet, by);
    v.hurts = (v.hurts + 1) % 256;
    const dx = b.x - fromX;
    const dz = b.z - fromZ;
    const d = Math.hypot(dx, dz);
    if (d > 1e-6) {
      v.kick.x = (dx / d) * BENANAS.hurtImpulse;
      v.kick.z = (dz / d) * BENANAS.hurtImpulse;
    }
    if (off) {
      this.unmask(v, now);
      host.unmasked([...v.helmet.hitters]);
    }
    this.sync();
    return true;
  }

  /** One tick: the arrival when due, then his prowl, punch, back-off, and the end of each phase. */
  step(tick: BenanasTick, host: BenanasHost): void {
    if (!this.visit) {
      if (!benanasDue(this.plan, tick.front)) return;
      this.plan = null;
      this.duration = BENANAS.duration;
      this.arrive(tick.now, benanasEntry(this.level, this.doors, tick.front, tick.rear));
    }
    const v = this.visit;
    if (!v) return;
    const { now } = tick;
    const b = v.agent.body;

    if (v.phase === BenanasPhase.Prowling && now >= v.until) {
      v.phase = BenanasPhase.Leaving;
      v.until = now + BENANAS.leaveTimeout;
      v.goal = douaneExit(this.doors, b, tick.rear);
      v.targetId = null;
      v.agent.path = null;
      this.say(v, "leave", now, true);
      this.log("benanas: leaving");
    } else if (v.phase === BenanasPhase.Unmasked && v.fleeAt !== null && now >= v.fleeAt) {
      // The linger is over: run for it.
      v.fleeAt = null;
      v.goal = douaneExit(this.doors, b, tick.rear);
      v.agent.path = null;
    } else if (v.phase !== BenanasPhase.Prowling && now >= v.until) {
      this.visit = null;
      this.views.clear();
      return;
    }

    for (const [id, until] of v.spared) if (now >= until) v.spared.delete(id);

    let speed: number = BENANAS.speed;
    let faceTarget: Vec2 | null = null;
    if (v.phase === BenanasPhase.Prowling) {
      const people = host.people();
      if (now < v.backOffUntil) {
        // Walking away from the crowd; the goal was set when it closed in.
      } else if (crowdedOut(b, people)) {
        v.backOffUntil = now + BENANAS.backOff;
        v.targetId = null;
        v.goal = backOffGoal(b, people, BENANAS.speed * BENANAS.backOff, this.ahead);
        v.agent.path = null;
        this.say(v, "backOff", now);
      } else {
        if (now >= v.goalAt) {
          const picked = pickBenanasTarget(b, people, (id) => v.spared.has(id));
          v.targetId = picked?.id ?? null;
          v.goalAt = now + BENANAS.regoalInterval;
        }
        const target = v.targetId === null ? null : (people.find((p) => p.id === v.targetId && p.target) ?? null);
        if (!target) v.targetId = null;
        v.goal = target ? { x: target.x, z: target.z } : { x: b.x, z: b.z };
        if (target) {
          faceTarget = target;
          if (inPunchReach(b, target, target.r)) {
            v.goal = { x: b.x, z: b.z };
            if (now >= v.hitAt) this.punch(v, target, now, host);
          }
        }
      }
    } else if (v.phase === BenanasPhase.Unmasked) {
      speed = v.fleeAt !== null ? 0 : BENANAS.fleeSpeed;
    }

    // Walk: to his target, away from a crowd, or off the street.
    const near = v.phase === BenanasPhase.Prowling ? 0.2 : 0.4;
    if (Math.hypot(v.goal.x - b.x, v.goal.z - b.z) <= near) {
      v.agent.input.x = 0;
      v.agent.input.z = 0;
      v.agent.path = null;
      if (v.phase !== BenanasPhase.Prowling && v.fleeAt === null) v.until = Math.min(v.until, now + 0.5);
    } else steerTo(v.agent, v.goal.x, v.goal.z, { nav: tick.nav, now, bots: [] });
    const step = speed * tick.dt;
    const k = Math.exp(-KICK_DAMP * tick.dt);
    const p = resolveCircle(tick.world, b.x + v.agent.input.x * step + v.kick.x * tick.dt, b.z + v.agent.input.z * step + v.kick.z * tick.dt, BENANAS.radius);
    v.kick.x *= k;
    v.kick.z *= k;
    b.x = p.x;
    b.z = p.z;
    if (faceTarget) {
      const dx = faceTarget.x - b.x;
      const dz = faceTarget.z - b.z;
      if (dx !== 0 || dz !== 0) v.rotation = Math.atan2(dx, dz);
    } else if ((v.agent.input.x !== 0 || v.agent.input.z !== 0) && speed > 0) v.rotation = Math.atan2(v.agent.input.x, v.agent.input.z);
    this.sync();
  }

  private punch(v: Visit, target: BenanasBody, now: number, host: BenanasHost): void {
    const b = v.agent.body;
    const dx = target.x - b.x;
    const dz = target.z - b.z;
    const d = Math.hypot(dx, dz);
    const dirX = d > 1e-6 ? dx / d : Math.sin(v.rotation);
    const dirZ = d > 1e-6 ? dz / d : Math.cos(v.rotation);
    v.hitAt = now + BENANAS.hitCooldown;
    v.swings = (v.swings + 1) % 256;
    // Hit or not (a hop dodges it), he moves on to someone else: never the same one twice in a row.
    v.spared.set(target.id, now + BENANAS.spare);
    v.targetId = null;
    v.goalAt = now + 0.4;
    if (host.punch(target.id, dirX, dirZ)) {
      this.say(v, "hit", now);
      this.log(`benanas: floored ${target.id}`);
    }
  }

  private unmask(v: Visit, now: number): void {
    v.phase = BenanasPhase.Unmasked;
    // He stands a moment with his line, then runs.
    v.targetId = null;
    v.fleeAt = now + BENANAS.unmaskedLinger;
    v.goal = { x: v.agent.body.x, z: v.agent.body.z };
    v.until = now + BENANAS.unmaskedLinger + BENANAS.leaveTimeout;
    v.agent.path = null;
    v.agent.input.x = 0;
    v.agent.input.z = 0;
    this.say(v, "unmasked", now, true);
    this.log(`benanas: unmasked by ${[...v.helmet.hitters].join(", ") || "nobody"}`);
  }

  private arrive(now: number, at: Vec2): void {
    const body = { x: at.x, z: at.z };
    this.visit = {
      phase: BenanasPhase.Prowling,
      until: now + this.duration,
      agent: {
        id: BENANAS_ID,
        body,
        stats: { radius: BENANAS.radius, repathInterval: 1 },
        path: null,
        pathIndex: 0,
        pathGoal: { x: body.x, z: body.z },
        repathAt: 0,
        input: { x: 0, z: 0 },
      },
      goal: { x: body.x, z: body.z },
      goalAt: now,
      targetId: null,
      backOffUntil: 0,
      hitAt: now + 1,
      spared: new Map(),
      helmet: freshHelmet(),
      fleeAt: null,
      kick: { x: 0, z: 0 },
      lineAt: now,
      line: -1,
      swings: 0,
      hurts: 0,
      rotation: Math.atan2(-this.ahead.x, -this.ahead.z),
    };
    this.say(this.visit, "arrive", now, true);
    this.log(`benanas: arrives at x=${at.x.toFixed(1)} z=${at.z.toFixed(1)} for ${this.duration} s`);
    this.sync();
  }

  /** A new line of `kind`, unless one went up less than BENANAS.lineInterval ago (`always`: the big moments). */
  private say(v: Visit, kind: BenanasLineKind, now: number, always = false): void {
    if (!always && now < v.lineAt) return;
    v.line = pickBenanasLine(kind, v.line, this.random);
    v.lineAt = now + BENANAS.lineInterval;
  }

  /** Mirror him into `state.benanas` (only what changed is sent). */
  private sync(): void {
    const v = this.visit;
    if (!v) return;
    let view = this.views.get(BENANAS_ID);
    if (!view) {
      view = new BenanasView();
      this.views.set(BENANAS_ID, view);
    }
    const b = v.agent.body;
    view.x = b.x;
    view.z = b.z;
    if (Math.abs(v.rotation - view.rotation) > 0.01) view.rotation = v.rotation;
    if (view.phase !== v.phase) view.phase = v.phase;
    if (view.line !== v.line) view.line = v.line;
    if (view.swings !== v.swings) view.swings = v.swings;
    if (view.hurts !== v.hurts) view.hurts = v.hurts;
  }
}
