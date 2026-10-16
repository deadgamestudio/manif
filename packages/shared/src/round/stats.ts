/**
 * End-of-round numbers (#12): counted per player on the server, sent once
 * with ServerMessage.RoundEnd, never stored in Schema. The joke awards are
 * picked from them on the client.
 */
import type { RoundResult } from "./constants.js";

/** What one protester did during the round. */
export interface RoundPlayerStats {
  arrests: number;
  rescues: number;
  knockdowns: number;
  propsBroken: number;
  crsOut: number;
  /** Props this player set on fire by hand (#16; spreading does not count). */
  firesLit: number;
  /** Teammates this player picked up and threw (#11). */
  teammatesThrown: number;
  /** CRS this player splatted with a tomato or made stinky with a dog poo (#15). */
  splats: number;
  /** Times this player slipped on a dog poo (#15). */
  slips: number;
  /** Times this player was pushed by a pompier's hose (#17). */
  hosed: number;
  /** HP this player's heal aura gave back to teammates (#14, the CGT; #41 scores it). */
  hpHealed: number;
  /** Times this player helped take Alexandre Bénanas's helmet off (#123): landed at least one of the hits. */
  benanasUnmasked: number;
}

export function emptyStats(): RoundPlayerStats {
  return { arrests: 0, rescues: 0, knockdowns: 0, propsBroken: 0, crsOut: 0, firesLit: 0, teammatesThrown: 0, splats: 0, slips: 0, hosed: 0, hpHealed: 0, benanasUnmasked: 0 };
}

/**
 * One protester's row, shared by the end screen and the live board (#63) so
 * they can't drift apart. `archetype` (#14): what they marched as this round,
 * an `Archetype`. `score` (#41): the round's points so far (see `score/`).
 * `total` (#41, `round:end` only): the player's lasting total once this round
 * is banked; absent when it wasn't (a bot, a debug round, no storage).
 */
export type RoundPlayerRow = RoundPlayerStats & {
  id: string;
  name: string;
  archetype?: number;
  score: number;
  total?: number;
  /** A bot protester (#59): shown marked as one, never given an award, never banked. */
  bot?: boolean;
};

/** Payload of `ServerMessage.RoundEnd`. */
export interface RoundEndEvent {
  result: RoundResult;
  /** How long the march lasted, in whole seconds. */
  seconds: number;
  players: RoundPlayerRow[];
  /**
   * Whether the round's points went into the lasting totals (#41): `saved`;
   * `debug` when a dev-only debug action touched the round; `off` when the
   * server has no working score storage (round-only scoring).
   */
  bank: "saved" | "debug" | "off";
}

/**
 * Payload of `ServerMessage.RoundBoard` (#63): the round's counts so far, one
 * row per protester in join order. Sent during the march only, at most once a
 * second and only when something changed (plus once to a mid-round joiner).
 */
export interface RoundBoardEvent {
  players: RoundPlayerRow[];
}

export interface RoundAward {
  /** The joke title. */
  title: string;
  /** Who gets it: the player's session id (two players can share a name, #61), and the name they marched under. */
  id: string;
  name: string;
  /** The number behind it, for the caption. */
  value: number;
  /** What the number counts, already in words. */
  unit: string;
}

const AWARDS: readonly { stat: keyof RoundPlayerStats; title: string; unit: string }[] = [
  { stat: "knockdowns", title: "Pilier de bitume", unit: "fois par terre" },
  { stat: "arrests", title: "Abonné du panier à salade", unit: "fois embarqué" },
  { stat: "rescues", title: "Ange gardien du cortège", unit: "camarades libérés" },
  { stat: "propsBroken", title: "Ennemi du mobilier urbain", unit: "trucs cassés" },
  { stat: "crsOut", title: "Terreur des CRS", unit: "CRS au tapis" },
  { stat: "firesLit", title: "Pyromane du dimanche", unit: "feux allumés" },
  { stat: "teammatesThrown", title: "Catapulte humaine", unit: "camarades lancés" },
  { stat: "splats", title: "Primeur de combat", unit: "CRS repeints ou parfumés" },
  { stat: "slips", title: "Pied dans la crotte", unit: "glissades" },
  { stat: "hosed", title: "Douche gratuite", unit: "coups de lance des pompiers" },
  { stat: "hpHealed", title: "Cantine syndicale", unit: "PV rendus aux camarades" },
];

/**
 * One award per stat, to the player with the highest non-zero count. A tie
 * goes to the first in the list (the server sends them in join order). Bots
 * (#59) never get one: the awards are for the humans.
 */
export function roundAwards(players: RoundEndEvent["players"]): RoundAward[] {
  const out: RoundAward[] = [];
  for (const a of AWARDS) {
    let best: RoundEndEvent["players"][number] | null = null;
    for (const p of players) if (!p.bot && p[a.stat] > 0 && (!best || p[a.stat] > best[a.stat])) best = p;
    if (best) out.push({ title: a.title, id: best.id, name: best.name, value: best[a.stat], unit: a.unit });
  }
  return out;
}
