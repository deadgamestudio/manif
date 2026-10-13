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
}

export function emptyStats(): RoundPlayerStats {
  return { arrests: 0, rescues: 0, knockdowns: 0, propsBroken: 0, crsOut: 0, firesLit: 0 };
}

/** Payload of `ServerMessage.RoundEnd`. */
export interface RoundEndEvent {
  result: RoundResult;
  /** How long the march lasted, in whole seconds. */
  seconds: number;
  players: (RoundPlayerStats & { id: string; name: string })[];
}

export interface RoundAward {
  /** The joke title. */
  title: string;
  /** Who gets it. */
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
];

/**
 * One award per stat, to the player with the highest non-zero count. A tie
 * goes to the first in the list (the server sends them in join order).
 */
export function roundAwards(players: RoundEndEvent["players"]): RoundAward[] {
  const out: RoundAward[] = [];
  for (const a of AWARDS) {
    let best: RoundEndEvent["players"][number] | null = null;
    for (const p of players) if (p[a.stat] > 0 && (!best || p[a.stat] > best[a.stat])) best = p;
    if (best) out.push({ title: a.title, name: best.name, value: best[a.stat], unit: a.unit });
  }
  return out;
}
