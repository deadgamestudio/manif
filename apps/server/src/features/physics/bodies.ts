import {
  applyImpulse,
  createBody,
  endDodge,
  endJump,
  hasControl,
  isAirborne,
  isDodging,
  isDown,
  moveCircle,
  resolveShieldContacts,
  startDodge,
  startJump,
  stepBody,
  type Body,
  type BodyStepResult,
  type CollisionWorld,
  type ImpulseResult,
  type KnockdownMode,
  type MoveInput,
  type ShieldContact,
} from "@manif/shared";

/** The synced fields a body writes after each step. `Player` fits it (CRS bodies live in the crs feature, #5). */
export interface BodyView {
  x: number;
  z: number;
  rotation: number;
  down: boolean;
  /** In a dodge burst (#9). */
  dodging: boolean;
  /** In the air (#45). */
  airborne: boolean;
}

/**
 * Server-side physical bodies, keyed like the synced entity (session id for
 * players). Holds what is never synced (knockback velocity, down and immunity
 * timers) and runs the pure kinematics from @manif/shared. The room owns the
 * Schema and calls `step` from the fixed tick, then nothing else touches
 * position.
 */
export class Bodies {
  private readonly bodies = new Map<string, Body>();

  constructor(
    private readonly world: CollisionWorld,
    private readonly radius: number,
    private readonly walkSpeed: number,
  ) {}

  /** Create or reset a body at rest at (x, z) and mirror it into `view`. */
  place(id: string, view: BodyView, x: number, z: number): void {
    const body = createBody(x, z);
    this.bodies.set(id, body);
    view.x = x;
    view.z = z;
    view.down = false;
    view.dodging = false;
    view.airborne = false;
  }

  remove(id: string): void {
    this.bodies.delete(id);
  }

  get(id: string): Readonly<Body> | undefined {
    return this.bodies.get(id);
  }

  isDown(id: string): boolean {
    const body = this.bodies.get(id);
    return body ? isDown(body) : false;
  }

  /** In the air (#45): a baton swing misses, hoppable shapes are skipped. */
  isAirborne(id: string): boolean {
    const body = this.bodies.get(id);
    return body ? isAirborne(body) : false;
  }

  /** Whether the entity may move and act. Later actions (#4 attack, #8 throw, #9 dodge) check this. */
  hasControl(id: string): boolean {
    const body = this.bodies.get(id);
    return body ? hasControl(body) : false;
  }

  /**
   * Push a body: the entry point for every hit. Mirrors `down` into `view`.
   * Returns null for an unknown id. The room broadcasts the result (ServerMessage.Impulse).
   */
  impulse(
    id: string,
    view: BodyView,
    dirX: number,
    dirZ: number,
    strength: number,
    mode?: KnockdownMode,
  ): ImpulseResult | null {
    const body = this.bodies.get(id);
    if (!body) return null;
    const res = applyImpulse(body, dirX, dirZ, strength, mode);
    view.down = isDown(body);
    // Floored mid-hop (#45): the hop ends with the knock-down.
    const airborne = isAirborne(body);
    if (view.airborne !== airborne) view.airborne = airborne;
    return res;
  }

  /**
   * Start a dodge burst (#9) along (dirX, dirZ) and face it. Refused while down
   * or already dodging; the room checks health state and cooldown first.
   */
  dodge(id: string, view: BodyView, dirX: number, dirZ: number): boolean {
    const body = this.bodies.get(id);
    if (!body || !startDodge(body, dirX, dirZ)) return false;
    view.dodging = true;
    view.rotation = Math.atan2(body.dodgeX, body.dodgeZ);
    return true;
  }

  /**
   * Start a hop (#45). Refused while down, dodging or already in the air; the
   * room checks health state and cooldown first.
   */
  jump(id: string, view: BodyView): boolean {
    const body = this.bodies.get(id);
    if (!body || !startJump(body)) return false;
    view.airborne = true;
    return true;
  }

  /** Cut a hop short (grabbed, KO): it lands on its next step. A no-op on the ground. */
  endJump(id: string, view: BodyView): void {
    const body = this.bodies.get(id);
    if (body) endJump(body);
    if (view.airborne) view.airborne = false;
  }

  /** Stop a dodge at once (grabbed, KO). A no-op if not dodging. */
  endDodge(id: string, view: BodyView): void {
    const body = this.bodies.get(id);
    if (body) endDodge(body);
    if (view.dodging) view.dodging = false;
  }

  /**
   * Pull a body to (x, z), collided against the world, and drop its knockback:
   * a CRS dragging a grabbed protester (#5). Mirrors position into `view`.
   */
  drag(id: string, view: BodyView, x: number, z: number): void {
    const body = this.bodies.get(id);
    if (!body) return;
    const res = moveCircle(this.world, body, x - body.x, z - body.z, this.radius);
    body.x = res.x;
    body.z = res.z;
    body.vx = 0;
    body.vz = 0;
    endDodge(body);
    endJump(body);
    if (view.x !== body.x) view.x = body.x;
    if (view.z !== body.z) view.z = body.z;
    if (view.dodging) view.dodging = false;
    if (view.airborne) view.airborne = false;
  }

  /**
   * Push a body out of raised shields (#6) and back out of the world; a
   * member pinning it against a wall is pushed back instead (see
   * `resolveShieldContacts`). Mirrors position into `view`.
   */
  separate(id: string, view: BodyView, shields: readonly ShieldContact[]): void {
    const body = this.bodies.get(id);
    if (!body || shields.length === 0) return;
    if (!resolveShieldContacts(this.world, body, this.radius, shields)) return;
    if (view.x !== body.x) view.x = body.x;
    if (view.z !== body.z) view.z = body.z;
  }

  /**
   * One fixed tick for one body, then mirror position and `down` into `view`.
   * `world` replaces the room's world for this step: the room adds the raised
   * shields of CRS lines (#6) to it, so protesters bump into them.
   */
  step(id: string, view: BodyView, input: MoveInput, dt: number, world: CollisionWorld = this.world): BodyStepResult | null {
    const body = this.bodies.get(id);
    if (!body) return null;
    const res = stepBody(world, body, input, this.walkSpeed, this.radius, dt);
    // Assign only on change, so idle bodies cost nothing in the patch.
    if (view.x !== body.x) view.x = body.x;
    if (view.z !== body.z) view.z = body.z;
    const down = isDown(body);
    if (view.down !== down) view.down = down;
    const dodging = isDodging(body);
    if (view.dodging !== dodging) view.dodging = dodging;
    const airborne = isAirborne(body);
    if (view.airborne !== airborne) view.airborne = airborne;
    // Face the walking direction; a body that is down or dodging keeps its facing.
    if (!down && !dodging && (input.x !== 0 || input.z !== 0)) view.rotation = Math.atan2(input.x, input.z);
    return res;
  }
}
