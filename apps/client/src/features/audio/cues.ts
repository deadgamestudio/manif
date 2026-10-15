/**
 * What to play (#57), decided from what the client already receives: the
 * five server messages and the synced state. No message exists just for
 * audio; a state change is found by comparing two snapshots of the street
 * (`WorldView`), the previous one and the current one.
 *
 * The first snapshot after joining (or reconnecting, or a phase change such
 * as a new round) is only a baseline: whatever is already there (fires,
 * gas, items, broken props) makes no sound.
 */
import { CrsKind, CrsMount, CrsStatus, MoluchanPhase, Phase, PlayerStatus, RoundResult, ThrowableKind, type PropKind } from "@manif/shared";
import type { SoundName } from "./sounds.ts";
import type { Point } from "./spatial.ts";

export interface PlayerView extends Point {
  status: number;
  airborne: boolean;
  dodging: boolean;
  carrying: number;
  gassed: boolean;
  onFire: boolean;
}

export interface CrsView extends Point {
  kind: number;
  status: number;
  mount: number;
  revealed: boolean;
  onFire: boolean;
  spraying: boolean;
  /** Winding up a grab (#70). */
  windup: boolean;
  /** A CRS LBD aiming (#73): the session id under its laser, "" otherwise. */
  aim: string;
}

export interface ItemView extends Point {
  kind: number;
}

/** The street as the audio sees it, at one moment. Plain data, built from the synced state. */
export interface WorldView {
  phase: number;
  timeLeft: number;
  players: ReadonlyMap<string, PlayerView>;
  crs: ReadonlyMap<string, CrsView>;
  /** Ids of the broken props. */
  broken: ReadonlySet<string>;
  projectiles: ReadonlyMap<string, ItemView>;
  /** Canisters in flight, at the CRS that threw them. */
  canisters: ReadonlyMap<string, Point>;
  gas: ReadonlyMap<string, Point>;
  fires: ReadonlyMap<string, Point>;
  /** Jeun-Lac Moluchan (#85) and his `MoluchanPhase`, or null when he isn't on the street. */
  moluchan: (Point & { phase: number }) | null;
}

/** A sound to play: where (none: centred, full volume), and an extra gain. */
export interface Cue {
  sound: SoundName;
  at?: Point;
  gain?: number;
}

/** The level's props, for where a break or a hit is and what it sounds like. */
export type PropTable = ReadonlyMap<string, { kind: PropKind; x: number; z: number }>;

/** The last ten seconds of the march tick (#12). */
export const COUNTDOWN_FROM = 10;

const BREAK_SOUND: Record<PropKind, SoundName> = {
  bin: "bin",
  bus_shelter: "glass",
  car: "car",
  market_stall: "wood",
  // The shops dealt each round (#68): glass fronts, and the bank's metal shutters.
  boulangerie: "glass",
  cafe: "glass",
  sneakers: "glass",
  banque: "metal",
  kebab: "glass",
  toilettage: "glass",
  // #117: more glass fronts; the tabac's grille clangs before its glass goes.
  burger: "glass",
  poulet: "glass",
  sport: "glass",
  telephone: "glass",
  pharmacie: "glass",
  superette: "glass",
  tabac: "glass",
};

/** A hit that doesn't break the prop: a thud in the right material. */
const HIT_SOUND: Record<PropKind, SoundName> = {
  bin: "bin",
  bus_shelter: "shield",
  car: "metal",
  market_stall: "wood",
  boulangerie: "shield",
  cafe: "shield",
  sneakers: "shield",
  banque: "metal",
  kebab: "shield",
  toilettage: "shield",
  burger: "shield",
  poulet: "shield",
  sport: "shield",
  telephone: "shield",
  pharmacie: "shield",
  superette: "shield",
  tabac: "metal",
};

/** A thrown item landing (#8, #15): the pavé thuds, the tomato and the poo splat, the trottinette clangs. */
function impactSound(kind: number): SoundName {
  if (kind === ThrowableKind.Tomate || kind === ThrowableKind.Crotte) return "splat";
  if (kind === ThrowableKind.Trottinette) return "metal";
  return "pave";
}

const pick = <T>(options: readonly [T, ...T[]], random: () => number): T =>
  options[Math.min(options.length - 1, Math.floor(random() * options.length))] ?? options[0];

const at = (p: Point): Point => ({ x: p.x, z: p.z });

/**
 * The cues for one change of the street, from `prev` to `next`. `prev` null
 * (just joined, reconnected): a baseline, no cues. A phase change plays only
 * the phase's own cue (the march starting); everything that appeared with it
 * (a fresh street, new CRS, items back in place) is the new baseline.
 */
export function diffCues(prev: WorldView | null, next: WorldView, localId: string | null, props: PropTable): Cue[] {
  if (!prev) return [];
  if (prev.phase !== next.phase) {
    return next.phase === Phase.Marching ? [{ sound: "whistle-long" }, { sound: "cheer", gain: 0.7 }] : [];
  }
  if (next.phase !== Phase.Marching) return [];
  const cues: Cue[] = [];

  if (next.timeLeft > 0 && next.timeLeft <= COUNTDOWN_FROM && next.timeLeft < prev.timeLeft) cues.push({ sound: "tick" });

  for (const [id, p] of next.players) {
    const was = prev.players.get(id);
    if (!was) continue;
    if (was.status === PlayerStatus.Free && p.status === PlayerStatus.Grabbed) cues.push({ sound: "cuffs", at: at(p) });
    if (was.status !== PlayerStatus.Arrested && p.status === PlayerStatus.Arrested) cues.push({ sound: "van-door", at: at(p) });
    if (was.status === PlayerStatus.Grabbed && p.status === PlayerStatus.Free) cues.push({ sound: "rescue", at: at(p) });
    if (!was.airborne && p.airborne) cues.push({ sound: "hop", at: at(p) });
    if (!was.dodging && p.dodging) cues.push({ sound: "throw", at: at(p), gain: 0.7 });
    if (was.carrying === ThrowableKind.None && p.carrying !== ThrowableKind.None) cues.push({ sound: "pickup", at: at(p) });
    if (!was.onFire && p.onFire) cues.push({ sound: "ignite", at: at(p), gain: 0.6 });
    if (id === localId && !was.gassed && p.gassed) cues.push({ sound: "cough" });
  }

  for (const [id, c] of next.crs) {
    const was = prev.crs.get(id);
    if (!was) {
      // A BRAV-M duo riding in (#13).
      if (c.mount === CrsMount.Duo) cues.push({ sound: "moped", at: at(c) });
      continue;
    }
    // A BAC pulling on its armband (#13): the cortège whistles.
    if (!was.revealed && c.revealed) cues.push({ sound: "whistle", at: at(c) });
    // A grab winding up (#70): a sharp whistle with the "!", the cue to dodge or hop.
    if (!was.windup && c.windup) cues.push({ sound: "whistle", at: at(c), gain: 0.8 });
    // A CRS LBD starting to aim (#73): a rising "charging" beep at it, or right in your ears when you are the one under the laser.
    if (was.aim === "" && c.aim !== "") cues.push(c.aim === localId ? { sound: "charge" } : { sound: "charge", at: at(c), gain: 0.7 });
    if (was.mount !== CrsMount.Wreck && c.mount === CrsMount.Wreck) cues.push({ sound: "car", at: at(c), gain: 0.8 });
    if (!was.onFire && c.onFire) cues.push({ sound: "ignite", at: at(c), gain: 0.6 });
  }

  // Things on the ground and in the air: props, throws, gas, fires.
  for (const id of next.broken) {
    if (prev.broken.has(id)) continue;
    const prop = props.get(id);
    if (prop) cues.push({ sound: BREAK_SOUND[prop.kind], at: at(prop) });
  }
  for (const [id, p] of next.projectiles) if (!prev.projectiles.has(id)) cues.push({ sound: "throw", at: at(p) });
  for (const [id, p] of prev.projectiles) if (!next.projectiles.has(id)) cues.push({ sound: impactSound(p.kind), at: at(p) });
  for (const [id, c] of next.canisters) if (!prev.canisters.has(id)) cues.push({ sound: "launch", at: at(c) });
  for (const [id, g] of next.gas) if (!prev.gas.has(id)) cues.push({ sound: "hiss", at: at(g) });
  for (const [id, f] of next.fires) if (!prev.fires.has(id)) cues.push({ sound: "ignite", at: at(f) });

  // Jeun-Lac Moluchan (#85): his entrance is for the whole cortège (the HUD says so too), not placed;
  // the cuffs when a CRS gets him, where he is.
  const m = next.moluchan;
  if (m && !prev.moluchan) cues.push({ sound: "moluchan" }, { sound: "cheer", gain: 0.5 });
  if (m && prev.moluchan && prev.moluchan.phase !== MoluchanPhase.Grabbed && m.phase === MoluchanPhase.Grabbed) {
    cues.push({ sound: "cuffs", at: at(m) });
  }
  return cues;
}

/** One of the five server messages (and our own swing), as the audio receives it. */
export type NetCueEvent =
  | { type: "swing"; id: string }
  | { type: "hit"; kind: "prop" | "crs"; target: string; x: number; z: number; broke: boolean }
  | { type: "shove"; ids: readonly string[] }
  | { type: "impulse"; id: string }
  | { type: "lbdShot"; x: number; z: number }
  | { type: "lbdImpact"; x: number; z: number; hit: boolean }
  | { type: "roundEnd"; result: number };

/** What the message cues remember between messages: when each CRS last swung its baton. */
export interface MessageMemory {
  crsSwings: Map<string, { at: number; x: number; z: number }>;
}

/** A baton swing followed this soon by a push on a protester right by it is a baton hit. */
const BATON_WINDOW_MS = 200;
const BATON_REACH = 3;

/**
 * The cues for one server message. `world` is the latest snapshot, for where
 * bodies are. Only while marching; the round end plays its sting whatever.
 */
export function messageCues(
  event: NetCueEvent,
  world: WorldView | null,
  props: PropTable,
  now: number,
  memory: MessageMemory,
  random: () => number = Math.random,
): Cue[] {
  if (event.type === "roundEnd") {
    return event.result === RoundResult.Won
      ? [{ sound: "fanfare" }, { sound: "cheer" }]
      : [{ sound: "sad-trombone" }];
  }
  if (!world || world.phase !== Phase.Marching) return [];
  switch (event.type) {
    case "swing": {
      const crs = world.crs.get(event.id);
      if (crs) {
        // Pompiers (#17) never swing; a CRS throwing gas also "swings", which is fine.
        if (crs.kind !== CrsKind.Pompier) memory.crsSwings.set(event.id, { at: now, x: crs.x, z: crs.z });
        return [{ sound: "swing", at: at(crs), gain: 0.8 }];
      }
      const player = world.players.get(event.id);
      return player ? [{ sound: "swing", at: at(player) }] : [];
    }
    case "hit": {
      if (event.kind === "crs") return [{ sound: pick(["punch-1", "punch-2"], random), at: { x: event.x, z: event.z } }];
      // A break is played from the synced `broken` flag (diffCues), not twice.
      if (event.broke) return [];
      const prop = props.get(event.target);
      return prop ? [{ sound: HIT_SOUND[prop.kind], at: { x: event.x, z: event.z }, gain: 0.6 }] : [];
    }
    case "shove": {
      const cues: Cue[] = [];
      for (const id of event.ids) {
        const crs = world.crs.get(id);
        if (crs) cues.push({ sound: "shield", at: at(crs) });
      }
      return cues;
    }
    case "impulse": {
      // Protesters get pushed by many things (shoves, hoses, slips, bonks): only
      // a push right after a baton swing next to them is a baton hit.
      const player = world.players.get(event.id);
      if (!player) return [];
      for (const [id, swing] of memory.crsSwings) {
        if (now - swing.at > BATON_WINDOW_MS) {
          memory.crsSwings.delete(id);
          continue;
        }
        if (Math.hypot(swing.x - player.x, swing.z - player.z) <= BATON_REACH) {
          memory.crsSwings.delete(id);
          return [{ sound: pick(["baton-1", "baton-2"], random), at: at(player) }];
        }
      }
      return [];
    }
    // The CRS LBD (#73): the launcher's pop, then a cartoon boing where the ball lands (a softer one off a wall or a CRS).
    case "lbdShot":
      return [{ sound: "launch", at: { x: event.x, z: event.z } }];
    case "lbdImpact":
      return [{ sound: "boing", at: { x: event.x, z: event.z }, gain: event.hit ? 1 : 0.45 }];
  }
}

/** Police that make the crowd tense: on the street, up, and not passing for a protester. */
function isThreat(c: CrsView): boolean {
  return c.kind !== CrsKind.Pompier && c.status !== CrsStatus.Out && c.revealed;
}

/** How full and how tense the crowd bed sounds around the local player, 0..1 each. */
export interface AmbienceLevels {
  crowd: number;
  tension: number;
}

const CROWD_RADIUS = 10;
const TENSION_RADIUS = 12;

/**
 * The march's crowd bed (#57): always there while marching (the cortège is
 * bigger than the players), louder with protesters close around you, and a
 * tense layer (boos, whistles) rising with police close by.
 */
export function ambienceLevels(world: WorldView, localId: string | null): AmbienceLevels {
  const me = localId ? world.players.get(localId) : undefined;
  if (!me) return { crowd: 0.5, tension: 0 };
  let near = 0;
  for (const [id, p] of world.players) {
    if (id === localId || p.status !== PlayerStatus.Free) continue;
    if (Math.hypot(p.x - me.x, p.z - me.z) <= CROWD_RADIUS) near++;
  }
  let police = 0;
  for (const c of world.crs.values()) {
    if (isThreat(c) && Math.hypot(c.x - me.x, c.z - me.z) <= TENSION_RADIUS) police++;
  }
  return { crowd: 0.5 + 0.5 * Math.min(1, near / 4), tension: Math.min(1, police / 5) };
}
