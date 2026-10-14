/**
 * Runs the sound layer (#57): watches the connection, the synced street and
 * the server's messages, and turns them into one-shots and loops.
 *
 * Module state, started once from main.tsx (not React: StrictMode double
 * effects can't start it twice). It looks at the street ten times a second;
 * the server's own updates come 20 times a second at most, and nothing here
 * needs to be frame-exact.
 */
import { CrsKind, Phase, STREET_LEVEL, type ShopLot, type StreetStateShape } from "@manif/shared";
import { net, type NetEvent } from "../../shared/net/index.ts";
import { ambienceLevels, diffCues, messageCues, type Cue, type CrsView, type ItemView, type MessageMemory, type NetCueEvent, type PlayerView, type PropTable, type WorldView } from "./cues.ts";
import { audio, type LoopWish } from "./engine.ts";
import { FILE_SOUNDS, isFileSound } from "./sounds.ts";
import { pitch, place, type Point } from "./spatial.ts";

const TICK_MS = 100;
/** How many fires and hoses may crackle and hiss at once: the nearest. */
const MAX_FIRE_LOOPS = 3;
const MAX_HOSE_LOOPS = 2;
/** After a round ends, the sting plays, then the music comes in. */
const MUSIC_AFTER_END_MS = 2500;

/** The level's own props. */
const LEVEL_PROPS = new Map(STREET_LEVEL.propSlots.map((p) => [p.id, { kind: p.kind, x: p.x, z: p.z }]));
/** ...plus the round's shops (#83), which sound like their kind; rebuilt only when a new layout arrives. */
let propsFor: readonly ShopLot[] | null = null;
let propTable: PropTable = LEVEL_PROPS;
function props(): PropTable {
  const shops = net.getShops();
  if (shops !== propsFor) {
    propsFor = shops;
    const table = new Map(LEVEL_PROPS);
    for (const s of shops) table.set(s.id, { kind: s.kind, x: s.side * s.face, z: s.z });
    propTable = table;
  }
  return propTable;
}

let started = false;
/** The last street snapshot, or null for "next one is a baseline". */
let prev: WorldView | null = null;
/** Which room and session `prev` belongs to: a new one (rejoin, reconnect) starts from a baseline. */
let prevKey = "";
let endedAt = 0;
let nextCough = 0;
let nextWhistle = 0;
let nextMegaphone = 0;
const memory: MessageMemory = { crsSwings: new Map() };

function buildView(state: StreetStateShape): WorldView {
  const players = new Map<string, PlayerView>();
  state.players.forEach((p, id) => {
    players.set(id, { x: p.x, z: p.z, status: p.status, airborne: p.airborne, dodging: p.dodging, carrying: p.carrying, gassed: p.gassed, onFire: p.onFire });
  });
  const crs = new Map<string, CrsView>();
  state.crs?.forEach((c, id) => {
    crs.set(id, { x: c.x, z: c.z, kind: c.kind, status: c.status, mount: c.mount, revealed: c.revealed, onFire: c.onFire, spraying: c.spraying, windup: c.windup === true });
  });
  const broken = new Set<string>();
  state.props?.forEach((p, id) => {
    if (p.broken) broken.add(id);
  });
  const projectiles = new Map<string, ItemView>();
  state.projectiles?.forEach((p, id) => projectiles.set(id, { x: p.x, z: p.z, kind: p.kind }));
  const canisters = new Map<string, Point>();
  state.canisters?.forEach((c, id) => canisters.set(id, { x: c.fromX, z: c.fromZ }));
  const gas = new Map<string, Point>();
  state.gas?.forEach((g, id) => gas.set(id, { x: g.x, z: g.z }));
  const fires = new Map<string, Point>();
  state.fires?.forEach((f, id) => fires.set(id, { x: f.x, z: f.z }));
  return { phase: state.phase, timeLeft: state.timeLeft, players, crs, broken, projectiles, canisters, gas, fires };
}

function listenerOf(view: WorldView | null, localId: string | null): Point | null {
  const me = view && localId ? view.players.get(localId) : undefined;
  return me ? { x: me.x, z: me.z } : null;
}

function playCue(cue: Cue, listener: Point | null) {
  const { gain, pan } = place(listener, cue.at);
  const jitter = isFileSound(cue.sound) ? FILE_SOUNDS[cue.sound].jitter : 0;
  audio.play(cue.sound, gain * (cue.gain ?? 1), pan, pitch(jitter, Math.random()));
}

/** The nearest `max` of `points` within earshot, as loops keyed `prefix:id`. */
function nearestLoops(out: Map<string, LoopWish>, prefix: string, sound: LoopWish["sound"], points: Iterable<[string, Point]>, listener: Point | null, max: number) {
  const near: { id: string; gain: number; pan: number }[] = [];
  for (const [id, p] of points) {
    const { gain, pan } = place(listener, p);
    if (gain > 0) near.push({ id, gain, pan });
  }
  near.sort((a, b) => b.gain - a.gain);
  for (const n of near.slice(0, max)) out.set(`${prefix}:${n.id}`, { sound, gain: n.gain, pan: n.pan });
}

function* sprayingPompiers(view: WorldView): Iterable<[string, Point]> {
  for (const [id, c] of view.crs) if (c.kind === CrsKind.Pompier && c.spraying) yield [id, c];
}

/** The loops for this moment of the round: the crowd bed, fires and hoses while marching; music in the lobby and after the end sting. */
function loopsFor(view: WorldView, localId: string | null, now: number): Map<string, LoopWish> {
  const wishes = new Map<string, LoopWish>();
  if (view.phase === Phase.Waiting || (view.phase === Phase.Ended && now - endedAt >= MUSIC_AFTER_END_MS)) {
    wishes.set("music", { sound: "lobby-music", gain: 1 });
  }
  if (view.phase !== Phase.Marching) return wishes;
  const listener = listenerOf(view, localId);
  const levels = ambienceLevels(view, localId);
  wishes.set("crowd", { sound: "crowd-loop", gain: levels.crowd });
  wishes.set("drums", { sound: "drums-loop", gain: 0.6 + 0.4 * levels.crowd });
  if (levels.tension > 0) wishes.set("tension", { sound: "boo-loop", gain: levels.tension });
  nearestLoops(wishes, "fire", "fire-loop", view.fires, listener, MAX_FIRE_LOOPS);
  nearestLoops(wishes, "hose", "hose-loop", sprayingPompiers(view), listener, MAX_HOSE_LOOPS);
  return wishes;
}

/** Sounds on a timer while marching: the local player's cough in the gas, and the crowd's whistles and megaphones. */
function timedSounds(view: WorldView, localId: string | null, now: number) {
  if (view.phase !== Phase.Marching) return;
  const me = localId ? view.players.get(localId) : undefined;
  if (me?.gassed) {
    if (now >= nextCough) {
      if (nextCough !== 0) audio.play("cough", 1, 0, pitch(0.1, Math.random()));
      nextCough = now + 1600 + Math.random() * 1200;
    }
  } else nextCough = 0;
  if (now >= nextWhistle) {
    if (nextWhistle !== 0) audio.play("crowd-whistle", 0.25 + Math.random() * 0.35, Math.random() * 1.4 - 0.7, pitch(0.08, Math.random()));
    nextWhistle = now + 4000 + Math.random() * 8000;
  }
  if (now >= nextMegaphone) {
    if (nextMegaphone !== 0) audio.play("megaphone", 0.5 + Math.random() * 0.4, Math.random() * 1.2 - 0.6);
    nextMegaphone = now + 14000 + Math.random() * 16000;
  }
}

function tick() {
  const snap = net.getSnapshot();
  const state = snap.status === "connected" ? net.getState() : null;
  const localId = snap.sessionId;
  const key = `${snap.roomId}:${localId}`;
  // Not in a room, or the state isn't fully there yet (our own player comes
  // with the first full snapshot): silence, and the next view is a baseline.
  if (!state?.players || !localId || !state.players.get(localId)) {
    if (prev) audio.stopLoops();
    prev = null;
    return;
  }
  if (key !== prevKey) {
    prev = null;
    prevKey = key;
  }
  const now = performance.now();
  const view = buildView(state);
  if (prev && prev.phase !== view.phase && view.phase === Phase.Ended) endedAt = now;
  if (!prev && view.phase === Phase.Ended) endedAt = now - MUSIC_AFTER_END_MS;
  const listener = listenerOf(view, localId);
  for (const cue of diffCues(prev, view, localId, props())) playCue(cue, listener);
  prev = view;
  timedSounds(view, localId, now);
  audio.setLoops(loopsFor(view, localId, now));
}

function toCueEvent(event: NetEvent): NetCueEvent {
  switch (event.type) {
    case "swing":
      return event;
    case "shove":
      return event;
    case "hit":
      return { type: "hit", kind: event.event.kind, target: event.event.target, x: event.event.x, z: event.event.z, broke: event.event.broke };
    case "impulse":
      return { type: "impulse", id: event.event.id };
    case "roundEnd":
      return { type: "roundEnd", result: event.event.result };
  }
}

function onEvent(event: NetEvent) {
  const localId = net.getSnapshot().sessionId;
  // Our own swing may come before the next tick: the latest view is close enough for where we are.
  const cues = messageCues(toCueEvent(event), prev, props(), performance.now(), memory);
  const listener = listenerOf(prev, localId);
  for (const cue of cues) playCue(cue, listener);
}

/**
 * Start the sound layer, once, at page load. Nothing plays until `unlockAudio`
 * runs from a click; after that, any click or key press resumes the engine
 * (iOS can suspend it on its own).
 */
export function startAudio() {
  if (started) return;
  started = true;
  const resume = () => {
    // On the homepage only Créer / Rejoindre unlock (see unlockAudio). Once in
    // a room (an invite link joins without a click), any gesture does.
    if (net.getSnapshot().status === "connected") audio.unlock();
  };
  window.addEventListener("pointerdown", resume, true);
  window.addEventListener("keydown", resume, true);
  net.subscribe(() => {
    if (net.getSnapshot().status === "connected") audio.loadBed();
  });
  net.subscribeEvents(onEvent);
  window.setInterval(tick, TICK_MS);
}

/** Unlock the sound engine: call it from the click that creates or joins a manif. */
export function unlockAudio() {
  audio.unlock();
}
