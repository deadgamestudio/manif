/*
 * Which of Jordan's models (#28) a prop shows, and how it sits on its slot.
 * Pure logic, no three.js: PropView picks the URL, propVisuals lists them.
 */

/** What a prop looks like right now, from its synced state. */
export type PropLookState = "intact" | "broken" | "burning" | "charred";

/** The model of each state a kind has. A missing state falls back (see `propModelUrl`). */
export interface PropModelSet {
  intact: string;
  broken: string;
  burning?: string;
  charred?: string;
}

/** Burnt out wins over burning, which wins over broken. */
export function propLookState(s: { broken: boolean; charred: boolean; burning: boolean }): PropLookState {
  if (s.charred) return "charred";
  if (s.burning) return "burning";
  return s.broken ? "broken" : "intact";
}

/**
 * The model to draw. A kind without a burning model keeps its intact or broken
 * one while it burns (the fire is drawn on top); without a charred one, its
 * broken one, which PropView then tints charcoal.
 */
export function propModelUrl(set: PropModelSet, state: PropLookState, broken: boolean): string {
  switch (state) {
    case "charred":
      return set.charred ?? set.broken;
    case "burning":
      return set.burning ?? (broken ? set.broken : set.intact);
    case "broken":
      return set.broken;
    case "intact":
      return set.intact;
  }
}

/** How a model sits on its slot: a turn about Y, then one uniform scale. */
export interface PropFit {
  yaw: number;
  scale: number;
}

/**
 * Lays a model (`size`: width X, height Y, depth Z in its own frame, front
 * +Z) over a collision footprint (`footprint`: width along X, depth along Z,
 * in the slot's frame):
 * - turned a quarter when its long side runs the other way to the footprint's,
 *   front towards the middle of the street (x = 0), so a shelter or a stall
 *   against a facade opens onto the street;
 * - a long model already along the footprint faces down its right-hand lane,
 *   like the vans;
 * - shrunk to fit the footprint if it is bigger, never stretched up (a model
 *   smaller than its box stays its own size: what Jordan drew).
 */
export function propModelFit(size: readonly [number, number, number], footprint: readonly [number, number], slotX: number): PropFit {
  const [w, , d] = size;
  const [fw, fd] = footprint;
  const modelLongX = w > d * 1.1;
  const modelLongZ = d > w * 1.1;
  const boxLongX = fw > fd * 1.1;
  const boxLongZ = fd > fw * 1.1;
  const turn = (modelLongX && boxLongZ) || (modelLongZ && boxLongX);
  let yaw = 0;
  if (turn) yaw = slotX > 0 ? -Math.PI / 2 : Math.PI / 2;
  else if (modelLongZ && slotX > 0) yaw = Math.PI;
  const [mw, md] = turn ? [d, w] : [w, d];
  const ratio = (want: number, have: number) => (have > 1e-6 ? want / have : 1);
  const scale = Math.min(1, ratio(fw, mw), ratio(fd, md));
  return { yaw, scale };
}
