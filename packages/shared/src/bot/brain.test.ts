import { describe, expect, test } from "bun:test";
import { ARCHETYPE_IDS, archetypeStats } from "../archetype/index.js";
import { CRS_STATS, CrsKind, MELEE_CRS_DAMAGE, NavGrid, pickTarget, type ProtesterView } from "../crs/index.js";
import { PlayerStatus } from "../health/index.js";
import { STREET_LEVEL as L, levelWorld, progressAt } from "../level/index.js";
import { DEFAULT_NAMES, MAX_PLAYERS, nameKey } from "../lobby/index.js";
import { MELEE_COOLDOWN } from "../melee/index.js";
import { createBody, stepBody } from "../physics/index.js";
import { PLAYER_RADIUS, PLAYER_SPEED } from "../player/index.js";
import { TICK_DT } from "../net/index.js";
import {
  BOT,
  BOT_MELEE_COOLDOWN,
  BOT_MELEE_CRS_DAMAGE,
  botsToFill,
  chooseBotPlan,
  createBotMind,
  hurdleAhead,
  marchGoal,
  pickBotArchetype,
  pickBotName,
  thinkBot,
  type BotMind,
  type BotSeenCrs,
  type BotSeenProtester,
  type BotWorld,
} from "./index.js";

const WORLD = levelWorld(L);
const NAV = new NavGrid(WORLD, CRS_STATS[CrsKind.Crs].radius);

/** A point on the street's middle line at progress t, `side` metres to the side. */
function at(t: number, side = 0) {
  const { from, to } = L.progress;
  return { x: from.x + (to.x - from.x) * t + side, z: from.z + (to.z - from.z) * t };
}

const always = () => 0;
const never = () => 0.999;

function world(mind: BotMind, over: Partial<BotWorld> = {}, self: Partial<BotWorld["self"]> = {}): BotWorld {
  return {
    level: L,
    nav: { nav: NAV, now: over.now ?? 0, bots: [] },
    now: 0,
    random: always,
    self: { x: mind.body.x, z: mind.body.z, canAct: true, carrying: false, gassed: false, ...self },
    protesters: [],
    crs: [],
    items: [],
    gas: [],
    hurdles: [],
    ...over,
  };
}

function mindAt(t: number, random: () => number = () => 0.5): BotMind {
  const p = at(t);
  return createBotMind("bot:1", createBody(p.x, p.z), 0, random);
}

const human = (id: string, t: number, status: number = PlayerStatus.Free, side = 0): BotSeenProtester => ({ id, ...at(t, side), status, bot: false });
const fellow = (id: string, t: number, status: number = PlayerStatus.Free, side = 0): BotSeenProtester => ({ id, ...at(t, side), status, bot: true });
const crs = (id: string, t: number, side = 0, grabbing: string | null = null, down = false): BotSeenCrs => ({ id, ...at(t, side), radius: 0.45, down, grabbing });

describe("who the bots are", () => {
  test("fill up to 8 with the toggle on, none with it off", () => {
    expect(botsToFill(2, true)).toBe(6);
    expect(botsToFill(1, true)).toBe(MAX_PLAYERS - 1);
    expect(botsToFill(8, true)).toBe(0);
    expect(botsToFill(9, true)).toBe(0);
    expect(botsToFill(2, false)).toBe(0);
  });

  test("names never double a name already used (case and spaces aside), and stay unique for a full cortège", () => {
    const used = ["gérard du 93 ", "Dédé Merguez"];
    let seed = 0;
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < MAX_PLAYERS; i++) used.push(pickBotName(used, rand));
    const keys = used.map(nameKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("every default name taken: a numbered one, still unique", () => {
    const used = [...DEFAULT_NAMES];
    const a = pickBotName(used);
    expect(used.map(nameKey)).not.toContain(nameKey(a));
    expect(a).toMatch(/ 2$/);
    used.push(a);
    expect(used.map(nameKey)).not.toContain(nameKey(pickBotName(used)));
  });

  test("a random archetype from the roster", () => {
    expect(ARCHETYPE_IDS).toContain(pickBotArchetype(always));
    expect(ARCHETYPE_IDS).toContain(pickBotArchetype(never));
  });
});

describe("what catches a bot's eye", () => {
  test("a grabbed human nearby, when the dice say yes; nothing when they say no", () => {
    const m = mindAt(0.3);
    const w = { protesters: [human("h", 0.3, PlayerStatus.Grabbed, 2)] };
    expect(chooseBotPlan(m, world(m, { ...w, random: always }))).toEqual({ kind: "rescue", id: "h" });
    expect(chooseBotPlan(mindAt(0.3), world(m, { ...w, random: never }))).toEqual({ kind: "march" });
  });

  test("a grabbed human comes before a closer grabbed bot", () => {
    const m = mindAt(0.3);
    const protesters = [fellow("b", 0.3, PlayerStatus.Grabbed, 1), human("h", 0.3, PlayerStatus.Grabbed, -1.8)];
    expect(chooseBotPlan(m, world(m, { protesters }))).toEqual({ kind: "rescue", id: "h" });
  });

  test("a CRS dragging someone nearby is worth a swing; a lone CRS far from everyone is not", () => {
    const m = mindAt(0.3);
    expect(chooseBotPlan(m, world(m, { crs: [crs("c", 0.3, 4, "x")] }))).toEqual({ kind: "fight", id: "c" });
    const m2 = mindAt(0.3);
    expect(chooseBotPlan(m2, world(m2, { crs: [crs("c", 0.3, 6)] }))).toEqual({ kind: "march" });
  });

  test("a chance once refused holds for a while: no re-rolling it every think", () => {
    const m = mindAt(0.3);
    const c = [crs("c", 0.3, 4, "x")];
    expect(chooseBotPlan(m, world(m, { crs: c, random: never }))).toEqual({ kind: "march" });
    expect(chooseBotPlan(m, world(m, { crs: c, random: always, now: 1 }))).toEqual({ kind: "march" });
    expect(chooseBotPlan(m, world(m, { crs: c, random: always, now: BOT.rollMemory + 0.1 }))).toEqual({ kind: "fight", id: "c" });
  });

  test("something in hand goes at the nearest standing CRS in reach", () => {
    const m = mindAt(0.3);
    const crsList = [crs("far", 0.3, 9.5), crs("near", 0.32), crs("floor", 0.3, 1, null, true)];
    expect(chooseBotPlan(m, world(m, { crs: crsList }, { carrying: true }))).toEqual({ kind: "throw", id: "near" });
  });

  test("calm street (#98): no throw at a CRS standing around, only at one dragging someone", () => {
    const m = mindAt(0.3);
    expect(chooseBotPlan(m, world(m, { crs: [crs("near", 0.32)], calm: true }, { carrying: true }))).toEqual({ kind: "march" });
    const crsList = [crs("near", 0.32), crs("dragging", 0.3, 5, "x")];
    expect(chooseBotPlan(m, world(m, { crs: crsList, calm: true }, { carrying: true }))).toEqual({ kind: "throw", id: "dragging" });
  });

  test("calm street (#98): no swing at a CRS right on a teammate or on itself, but still at one dragging someone", () => {
    const m = mindAt(0.3);
    const protesters = [human("h", 0.3, PlayerStatus.Free, 2)];
    expect(chooseBotPlan(m, world(m, { protesters, crs: [crs("on", 0.3, 1)], calm: true }))).toEqual({ kind: "march" });
    // The same CRS is worth a swing once the street is hot.
    const hot = mindAt(0.3);
    expect(chooseBotPlan(hot, world(hot, { protesters, crs: [crs("on", 0.3, 1)] }))).toEqual({ kind: "fight", id: "on" });
    const m2 = mindAt(0.3);
    expect(chooseBotPlan(m2, world(m2, { crs: [crs("c", 0.3, 4, "x")], calm: true }))).toEqual({ kind: "fight", id: "c" });
  });

  test("in gas: out, away from the cloud's centre", () => {
    const m = mindAt(0.3);
    const p = at(0.3);
    const plan = chooseBotPlan(m, world(m, { gas: [{ x: p.x - 1, z: p.z, r: 3 }] }, { gassed: true }));
    expect(plan.kind).toBe("flee");
    if (plan.kind === "flee") expect(plan.x).toBeGreaterThan(p.x);
  });
});

describe("thinking", () => {
  test("waits its reaction delay before anything new", () => {
    const m = mindAt(0.3);
    const crsList = [crs("c", 0.3, 3, "x")];
    thinkBot(m, world(m, { crs: crsList, now: 0 }));
    expect(m.plan.kind).toBe("march");
    expect(m.pending).toEqual({ kind: "fight", id: "c" });
    thinkBot(m, world(m, { crs: crsList, now: BOT.reactionMin - 0.05 }));
    expect(m.plan.kind).toBe("march");
    thinkBot(m, world(m, { crs: crsList, now: BOT.reactionMin }));
    expect(m.plan).toEqual({ kind: "fight", id: "c" });
  });

  test("in reach of the CRS it fights, it faces it and swings", () => {
    const m = mindAt(0.3);
    const target = crs("c", 0.3, 1.2);
    m.plan = { kind: "fight", id: "c" };
    const intent = thinkBot(m, world(m, { crs: [target], now: 5 }));
    expect(intent.attack).toBe(true);
    expect(intent.face).toEqual({ x: target.x, z: target.z });
    expect(intent.move).toEqual({ x: 0, z: 0 });
  });

  test("with a short-range item in hand (#121: a Vélib) it walks into its reach before it throws", () => {
    const m = mindAt(0.3);
    const target = crs("c", 0.345);
    m.plan = { kind: "throw", id: "c" };
    // About 8 m: in reach of a pavé, not of a Vélib.
    expect(thinkBot(m, world(m, { crs: [target], now: 5 }, { carrying: true })).throwAt).toEqual({ x: target.x, z: target.z });
    m.plan = { kind: "throw", id: "c" };
    const far = thinkBot(m, world(m, { crs: [target], now: 6 }, { carrying: true, reach: 6 }));
    expect(far.throwAt).toBeNull();
    expect(Math.hypot(far.move.x, far.move.z)).toBeCloseTo(1, 5);
    const near = crs("c", 0.32);
    m.plan = { kind: "throw", id: "c" };
    expect(thinkBot(m, world(m, { crs: [near], now: 7 }, { carrying: true, reach: 6 })).throwAt).toEqual({ x: near.x, z: near.z });
  });

  test("holds interact the whole way to a grabbed teammate it goes for", () => {
    const m = mindAt(0.3);
    m.plan = { kind: "rescue", id: "h" };
    const intent = thinkBot(m, world(m, { protesters: [human("h", 0.32, PlayerStatus.Grabbed)], now: 5 }));
    expect(intent.rescueHold).toBe(true);
    expect(Math.hypot(intent.move.x, intent.move.z)).toBeCloseTo(1, 5);
  });

  test("a bot that can't act does nothing and lets go of interact", () => {
    const m = mindAt(0.3);
    m.plan = { kind: "rescue", id: "h" };
    const intent = thinkBot(m, world(m, { protesters: [human("h", 0.32, PlayerStatus.Grabbed)] }, { canAct: false }));
    expect(intent).toEqual({ move: { x: 0, z: 0 }, face: null, attack: false, throwAt: null, pickUp: false, rescueHold: false, dodge: false, jump: false });
    expect(m.plan.kind as string).toBe("march");
  });

  test("thinks a few times a second, not every tick", () => {
    const m = mindAt(0.3);
    thinkBot(m, world(m, { now: 2 }));
    expect(m.thinkAt).toBeCloseTo(2 + BOT.thinkInterval, 9);
    expect(BOT.thinkInterval).toBeGreaterThan(TICK_DT * 3);
  });

  test("its spot in the cortège follows the leading free human, not the bots", () => {
    const m = mindAt(0.1);
    const goal = marchGoal(m, world(m, { protesters: [human("h", 0.5), human("slow", 0.2), fellow("b", 0.9), human("g", 0.8, PlayerStatus.Grabbed)] }));
    expect(progressAt(L, goal.x, goal.z)).toBeCloseTo(0.5 + m.lead, 5);
  });

  test("drifts part of the way towards Moluchan's ring when he is near (#85), not onto him", () => {
    const m = mindAt(0.4);
    const w = world(m, { protesters: [human("h", 0.4)] });
    const plain = marchGoal(m, w);
    const him = at(0.38, 2);
    const drawn = marchGoal(m, { ...w, moluchan: him });
    const before = Math.hypot(plain.x - him.x, plain.z - him.z);
    const after = Math.hypot(drawn.x - him.x, drawn.z - him.z);
    expect(after).toBeCloseTo(before * (1 - BOT.moluchanPull), 5);
    expect(after).toBeGreaterThan(0);
    // Too far away: no pull at all.
    expect(marchGoal(m, { ...w, moluchan: at(0.9) })).toEqual(plain);
    expect(marchGoal(m, { ...w, moluchan: null })).toEqual(plain);
  });

  test("hops a hurdle right in its way, not one beside it or behind", () => {
    const self = { x: 0, z: 0 };
    const move = { x: 0, z: 1 };
    expect(hurdleAhead(self, move, [{ x: 0, z: 1.5, r: 0.5 }])).toBeDefined();
    expect(hurdleAhead(self, move, [{ x: 2, z: 1.5, r: 0.5 }])).toBeUndefined();
    expect(hurdleAhead(self, move, [{ x: 0, z: -1.5, r: 0.5 }])).toBeUndefined();
    expect(hurdleAhead(self, move, [{ x: 0, z: 4, r: 0.5 }])).toBeUndefined();
  });

  test("marches down the real street with a human ahead, around what is in the way", () => {
    const start = at(0.02);
    const body = createBody(start.x, start.z);
    const m = createBotMind("bot:1", body, 0, () => 0.5);
    const speed = PLAYER_SPEED * BOT.speed;
    let now = 0;
    let move = { x: 0, z: 0 };
    for (let tick = 0; tick < 30 * 40; tick++) {
      now += TICK_DT;
      if (now >= m.thinkAt) {
        const w = world(m, { now, nav: { nav: NAV, now, bots: [] }, protesters: [human("h", 0.4)] });
        w.self.x = body.x;
        w.self.z = body.z;
        move = thinkBot(m, w).move;
      }
      stepBody(WORLD, body, move, speed, PLAYER_RADIUS, TICK_DT);
    }
    expect(progressAt(L, body.x, body.z)).toBeGreaterThan(0.4 + BOT.leadMin - 0.03);
  });
});

describe("weaker than a player, and than a CRS", () => {
  test("a bot's swing does less damage per second than a player's of the same archetype", () => {
    // The archetype changes neither (melee on CRS isn't an archetype stat): the bot's factors decide alone.
    expect(BOT_MELEE_CRS_DAMAGE / BOT_MELEE_COOLDOWN).toBeLessThan(MELEE_CRS_DAMAGE / MELEE_COOLDOWN);
    expect(BOT_MELEE_CRS_DAMAGE / BOT_MELEE_COOLDOWN).toBeLessThan((MELEE_CRS_DAMAGE / MELEE_COOLDOWN) * 0.5);
  });

  test("its weaknesses stack on the archetype: slower than a player of the same archetype", () => {
    for (const a of ARCHETYPE_IDS) expect(archetypeStats(a).speed * BOT.speed).toBeLessThan(archetypeStats(a).speed);
  });

  test("one on one, a CRS beats a bot of any archetype, swing for swing", () => {
    const c = CRS_STATS[CrsKind.Crs];
    for (const a of ARCHETYPE_IDS) {
      // Both swinging as fast as they may from t = 0 (the bot even skips its reaction delay).
      let botHp = archetypeStats(a).maxHp;
      let crsHp = c.maxHp;
      let nextBot = 0;
      let nextCrs = 0;
      let t = 0;
      while (botHp > 0 && crsHp > 0) {
        if (t >= nextBot) {
          crsHp -= BOT_MELEE_CRS_DAMAGE;
          nextBot += BOT_MELEE_COOLDOWN;
        }
        if (crsHp > 0 && t >= nextCrs) {
          botHp -= c.batonDamage;
          nextCrs += c.batonCooldown;
        }
        t += TICK_DT;
      }
      expect({ archetype: a, crsWins: botHp <= 0 && crsHp > 0 }).toEqual({ archetype: a, crsWins: true });
    }
  });

  test("the CRS chase a human before a bot at a similar distance; a bot much closer still draws them", () => {
    const weight = (bot: boolean) => archetypeStats(0).targetWeight * (bot ? BOT.targetWeight : 1);
    const view = (id: string, x: number, bot: boolean): ProtesterView => ({ id, x, z: 0, status: PlayerStatus.Free, down: false, priority: weight(bot) });
    const from = { x: 0, z: 0 };
    expect(pickTarget(from, [view("bot:1", 5, true), view("h", 6, false)], 30, null, 0)).toBe("h");
    expect(pickTarget(from, [view("bot:1", 2, true), view("h", 8, false)], 30, null, 0)).toBe("bot:1");
  });
});
