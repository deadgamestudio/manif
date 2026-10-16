import type { MapSchema } from "@colyseus/schema";
import {
  MOLUCHAN,
  MOLUCHAN_ID,
  MoluchanPhase,
  PlayerStatus,
  GRAB_HP_THRESHOLD,
  combinedHealRate,
  cameoArrives,
  freshCameoSchedule,
  inMoluchanAura,
  moluchanEntry,
  moluchanExit,
  moluchanGoal,
  moluchanSpeedFactor,
  moluchanStruggleFactor,
  pickMoluchanLine,
  resolveCircle,
  steerTo,
  stepHeal,
  truckBays,
  type CameoSchedule,
  type CollisionWorld,
  type Level,
  type MoluchanLineKind,
  type MoluchanSeen,
  type NavAgent,
  type NavContext,
  type ProtesterView,
  type Vec2,
} from "@manif/shared";
import { CameoStage } from "../cameo/index.js";
import { MoluchanView } from "./schema.js";

/** What the event needs of the room each tick. */
export interface MoluchanTick {
  now: number;
  dt: number;
  /** Seconds of march so far and left (`Round.elapsed`, `Round.timeLeft`): the clock of the arrival roll (#132). */
  elapsed: number;
  timeLeft: number;
  /** The cortège's front, 0..1. */
  front: number;
  /** Every protester (free or not), for where he heads. */
  protesters: readonly MoluchanSeen[];
  /** The back of the cortège, where he comes in when no side street fits. */
  rear: Vec2;
  /** The CRS's navigation grid (he walks like a bot), and the collision world. */
  nav: NavContext["nav"];
  world: CollisionWorld;
}

/** He is on the street: where, what he is doing, and how he walks. */
interface Visit {
  phase: MoluchanPhase;
  /** Room time the current phase ends (rally over, leave timed out, the grabbed linger over). */
  until: number;
  agent: NavAgent & { input: Vec2; body: Vec2 };
  goal: Vec2;
  goalAt: number;
  /** The last line he said (index into MOLUCHAN_LINES); shown only while the stage gives him the bubble. */
  line: number;
}

/**
 * Jeun-Lac Moluchan (#85), server-side: the roll each minute of march (#132),
 * his arrival, his walk with the cortège, his lines (in turn with the other
 * cameos, `CameoStage`), the end (time's up, or a CRS grab), and the buffs of his ring.
 * Mirrors what clients draw into `state.moluchan`.
 *
 * He is not a player: the room shows him to the CRS only (`view`), so the
 * win, the wipe, the bot fill and the scores never see him.
 */
export class MoluchanEvent {
  /** This round's arrival roll (#132), null between rounds. */
  private schedule: CameoSchedule | null = null;
  private visit: Visit | null = null;
  /** Rallying time of a forced visit (debug), else MOLUCHAN.duration. */
  private duration: number = MOLUCHAN.duration;
  private readonly doors: Vec2[];
  private readonly crsView: ProtesterView = {
    id: MOLUCHAN_ID,
    x: 0,
    z: 0,
    status: PlayerStatus.Free,
    down: false,
    // Never hit by a baton (`canBeHurt` is false) and always weakened enough to grab: contact means a grab's wind-up.
    hp: GRAB_HP_THRESHOLD,
    priority: MOLUCHAN.targetWeight,
  };
  /** Room time of the last call that moved the event on, for the synced `left`. */
  private now = 0;
  /** The fraction of an HP each protester is owed by his ring. */
  private readonly carry = new Map<string, number>();

  constructor(
    private readonly level: Level,
    private readonly views: MapSchema<MoluchanView>,
    private readonly random: () => number = Math.random,
    private readonly log: (message: string) => void = () => {},
    /** The speaking turn shared with the other cameos (#132). */
    private readonly stage: CameoStage = new CameoStage(random),
  ) {
    this.doors = truckBays(level, MOLUCHAN.radius).map((b) => b.door);
    this.stage.watch(() => this.sync());
  }

  /** A new round: no one on the street, and his rolls start (one a minute of march, #132). */
  startRound(): void {
    this.clear();
    this.schedule = freshCameoSchedule();
  }

  /** Nobody on the street and no visit planned (end of a round, reset). */
  clear(): void {
    this.schedule = null;
    this.visit = null;
    this.stage.hush(MOLUCHAN_ID, this.now);
    this.duration = MOLUCHAN.duration;
    this.carry.clear();
    this.views.clear();
  }

  /** DEBUG (#85): arrive now at `at` (or his usual way in), rallying for `seconds`. Ignored while he is already here. */
  force(tick: Pick<MoluchanTick, "now" | "front" | "rear">, at?: Vec2, seconds?: number): boolean {
    if (this.visit) return false;
    this.now = tick.now;
    // A forced visit is this round's visit.
    if (this.schedule) this.schedule.came = true;
    this.duration = seconds ?? MOLUCHAN.duration;
    this.arrive(tick.now, at ?? moluchanEntry(this.level, this.doors, tick.front, tick.rear));
    return true;
  }

  /** The centre of his ring while it is on (rallying), else null. */
  get aura(): Vec2 | null {
    const v = this.visit;
    return v && v.phase === MoluchanPhase.Rallying ? v.agent.body : null;
  }

  /** Whether `p` is in his ring right now. */
  inAura(p: Vec2): boolean {
    return inMoluchanAura(this.aura, p);
  }

  /** The walking speed factor for a protester at `p` (1 outside the ring). */
  speedAt(p: Vec2): number {
    return moluchanSpeedFactor(this.inAura(p));
  }

  /** The struggle press gain (#70) for a protester at `p` (1 outside the ring). */
  struggleAt(p: Vec2): number {
    return moluchanStruggleFactor(this.inAura(p));
  }

  /**
   * His heal, once a tick: the whole HP each of `targets` (free protesters
   * below their max, the caller filters) gets from his ring. On top of the
   * CGT's (#14), through its own carry: the two add up (`combinedHealRate`).
   */
  heals(targets: Iterable<Vec2 & { id: string }>, dt: number): [string, number][] {
    const out: [string, number][] = [];
    const centre = this.aura;
    if (!centre) {
      this.carry.clear();
      return out;
    }
    for (const t of targets) {
      const res = stepHeal(this.carry.get(t.id) ?? 0, combinedHealRate(0, inMoluchanAura(centre, t)), dt);
      if (res.carry > 0) this.carry.set(t.id, res.carry);
      else this.carry.delete(t.id);
      if (res.heal > 0) out.push([t.id, res.heal]);
    }
    return out;
  }

  /** What the CRS see of him (a priority target), while he is rallying or leaving; undefined otherwise. */
  view(): ProtesterView | undefined {
    const v = this.visit;
    if (!v || v.phase === MoluchanPhase.Grabbed) return undefined;
    this.crsView.x = v.agent.body.x;
    this.crsView.z = v.agent.body.z;
    return this.crsView;
  }

  /** A CRS grab landed on him: the event ends early, with a last line. False if he can't be grabbed now. */
  grab(now: number): boolean {
    const v = this.visit;
    if (!v || v.phase === MoluchanPhase.Grabbed) return false;
    this.now = now;
    v.phase = MoluchanPhase.Grabbed;
    v.until = now + MOLUCHAN.grabbedLinger;
    this.say(v, "grabbed", now, true);
    this.carry.clear();
    this.log("moluchan: grabbed by the CRS, event over");
    this.sync();
    return true;
  }

  /** One tick: the arrival when due, then his walk, lines and the end of each phase. */
  step(tick: MoluchanTick): void {
    this.now = tick.now;
    if (!this.visit) {
      if (!this.schedule || !cameoArrives(this.schedule, tick.elapsed, tick.timeLeft, MOLUCHAN.duration, MOLUCHAN.chance, this.random)) return;
      this.duration = MOLUCHAN.duration;
      this.arrive(tick.now, moluchanEntry(this.level, this.doors, tick.front, tick.rear));
    }
    const v = this.visit;
    if (!v) return;
    const { now } = tick;
    if (v.phase === MoluchanPhase.Rallying && now >= v.until) {
      v.phase = MoluchanPhase.Leaving;
      v.until = now + MOLUCHAN.leaveTimeout;
      v.goal = moluchanExit(this.doors, v.agent.body, tick.rear);
      this.say(v, "leave", now, true);
      this.carry.clear();
      this.log("moluchan: leaving, untouched");
    } else if (v.phase !== MoluchanPhase.Rallying && now >= v.until) {
      this.visit = null;
      this.views.clear();
      this.stage.hush(MOLUCHAN_ID, now);
      return;
    }
    if (v.phase === MoluchanPhase.Rallying) {
      if (now >= v.goalAt) {
        v.goal = moluchanGoal(this.level, v.agent.body, tick.protesters, tick.front);
        v.goalAt = now + MOLUCHAN.regoalInterval;
      }
      // An ordinary line: only when the stage gives him a turn.
      this.say(v, "rally", now, false);
    }
    if (v.phase === MoluchanPhase.Grabbed) {
      v.agent.input.x = 0;
      v.agent.input.z = 0;
    } else {
      const near = v.phase === MoluchanPhase.Leaving ? 0.4 : MOLUCHAN.arriveRadius;
      const b = v.agent.body;
      if (Math.hypot(v.goal.x - b.x, v.goal.z - b.z) <= near) {
        v.agent.input.x = 0;
        v.agent.input.z = 0;
        v.agent.path = null;
        // At his side street: gone.
        if (v.phase === MoluchanPhase.Leaving) v.until = Math.min(v.until, now + 0.5);
      } else steerTo(v.agent, v.goal.x, v.goal.z, { nav: tick.nav, now, bots: [] });
      const step = MOLUCHAN.speed * tick.dt;
      const p = resolveCircle(tick.world, b.x + v.agent.input.x * step, b.z + v.agent.input.z * step, MOLUCHAN.radius);
      b.x = p.x;
      b.z = p.z;
    }
    this.sync();
  }

  private arrive(now: number, at: Vec2): void {
    const body = { x: at.x, z: at.z };
    this.visit = {
      phase: MoluchanPhase.Rallying,
      until: now + this.duration,
      agent: {
        id: MOLUCHAN_ID,
        body,
        stats: { radius: MOLUCHAN.radius, repathInterval: 1 },
        path: null,
        pathIndex: 0,
        pathGoal: { x: body.x, z: body.z },
        repathAt: 0,
        input: { x: 0, z: 0 },
      },
      goal: { x: body.x, z: body.z },
      goalAt: now,
      line: -1,
    };
    this.say(this.visit, "arrive", now, true);
    this.log(`moluchan: arrives at x=${at.x.toFixed(1)} z=${at.z.toFixed(1)} for ${this.duration} s`);
    this.sync();
  }

  /** A line of `kind`, if the stage gives him the bubble (`key`: a moment that always speaks, #132). */
  private say(v: Visit, kind: MoluchanLineKind, now: number, key: boolean): void {
    if (!this.stage.say(MOLUCHAN_ID, now, key)) return;
    v.line = pickMoluchanLine(kind, v.line, this.random);
    this.stage.hold(MOLUCHAN_ID, now, v.line);
  }

  /** Mirror him into `state.moluchan` (only what changed is sent). */
  private sync(): void {
    const v = this.visit;
    if (!v) return;
    let view = this.views.get(MOLUCHAN_ID);
    if (!view) {
      view = new MoluchanView();
      this.views.set(MOLUCHAN_ID, view);
    }
    const b = v.agent.body;
    view.x = b.x;
    view.z = b.z;
    const ix = v.agent.input.x;
    const iz = v.agent.input.z;
    if (ix !== 0 || iz !== 0) {
      const r = Math.atan2(ix, iz);
      if (Math.abs(r - view.rotation) > 0.01) view.rotation = r;
    }
    if (view.phase !== v.phase) view.phase = v.phase;
    // #132: -1 (no bubble) between his bursts, or while another cameo has the bubble.
    const line = this.stage.showing(MOLUCHAN_ID, this.now) ? v.line : -1;
    if (view.line !== line) view.line = line;
    const left = v.phase === MoluchanPhase.Rallying ? Math.max(0, Math.ceil(v.until - this.now)) : 0;
    if (view.left !== left) view.left = left;
  }
}
