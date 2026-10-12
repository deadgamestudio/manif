import {
  applyImpulse,
  createBody,
  hasControl,
  isDown,
  stepBody,
  type Body,
  type BodyStepResult,
  type CollisionWorld,
  type ImpulseResult,
  type KnockdownMode,
  type MoveInput,
} from "@manif/shared";

/** The synced fields a body writes after each step. `Player` (and CRS later, #5) fit it. */
export interface BodyView {
  x: number;
  z: number;
  rotation: number;
  down: boolean;
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
    return res;
  }

  /** One fixed tick for one body, then mirror position and `down` into `view`. */
  step(id: string, view: BodyView, input: MoveInput, dt: number): BodyStepResult | null {
    const body = this.bodies.get(id);
    if (!body) return null;
    const res = stepBody(this.world, body, input, this.walkSpeed, this.radius, dt);
    // Assign only on change, so idle bodies cost nothing in the patch.
    if (view.x !== body.x) view.x = body.x;
    if (view.z !== body.z) view.z = body.z;
    const down = isDown(body);
    if (view.down !== down) view.down = down;
    // Face the walking direction; a body that is down keeps its facing.
    if (!down && (input.x !== 0 || input.z !== 0)) view.rotation = Math.atan2(input.x, input.z);
    return res;
  }
}
