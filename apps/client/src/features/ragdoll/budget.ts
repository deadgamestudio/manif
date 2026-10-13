/*
 * How many bodies may ragdoll at once (#26), protesters and CRS together.
 * A body takes a slot when it falls and gives it back when it is standing
 * again (or unmounts, is arrested, respawns). With no slot free, it uses
 * the plain tip-over instead.
 */

/**
 * Six: a ragdoll costs about 30 constraint solves x 4 passes x 60 steps a
 * second (tiny) but adds 10 meshes to draw, and a busy street already has 8
 * players, a dozen CRS and props. Six covers the usual pile-up (a charge or
 * a pavé flattening a few bodies) and keeps the worst case (a shield line
 * shoving the whole cortège while pavés floor its CRS) at 60 extra draw
 * calls, with the rest falling back to the cheap tip-over.
 */
export const MAX_ACTIVE_RAGDOLLS = 6;

export interface RagdollBudget {
  /** True if `owner` has (or just got) a slot. */
  acquire(owner: object): boolean;
  /** Gives back `owner`'s slot, if it has one. */
  release(owner: object): void;
  active(): number;
}

export function createRagdollBudget(max: number): RagdollBudget {
  const owners = new Set<object>();
  return {
    acquire(owner) {
      if (owners.has(owner)) return true;
      if (owners.size >= max) return false;
      owners.add(owner);
      return true;
    },
    release(owner) {
      owners.delete(owner);
    },
    active: () => owners.size,
  };
}

/** The one budget every avatar shares. */
export const ragdollSlots = createRagdollBudget(MAX_ACTIVE_RAGDOLLS);
