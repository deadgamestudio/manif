// #98: a cortège of bots, with one human who does nothing, among the opening
// CRS force. While the street is calm the bots must not provoke (no swing, no
// throw), or every round with bots would turn hot within seconds. The same
// scene with a hot street is the control: there the brawl starts at once.
import { describe, expect, test } from "bun:test";
import {
  CRS_STATS,
  CrsKind,
  CrsStatus,
  NavGrid,
  addOffence,
  createCrsBot,
  createMood,
  heatUp,
  stepCrs,
  stepMood,
  type CrsBot,
  type CrsContext,
  type CrsHost,
  type ProtesterView,
} from "../crs/index.js";
import { PlayerStatus } from "../health/index.js";
import { STREET_LEVEL as L, levelWorld, progressAt } from "../level/index.js";
import { TICK_DT } from "../net/index.js";
import { createBody, isDown, stepBody, type Body, type Vec2 } from "../physics/index.js";
import { PLAYER_RADIUS, PLAYER_SPEED } from "../player/index.js";
import { PICKUP_RANGE } from "../throwable/index.js";
import { BOT, botThinkDue, createBotMind, thinkBot, type BotIntent, type BotMind, type BotWorld } from "./index.js";

const WORLD = levelWorld(L);
const CRS_NAV = new NavGrid(WORLD, CRS_STATS[CrsKind.Crs].radius);

/** A point on the street's middle line at progress t, `side` metres to the side. */
function at(t: number, side = 0): Vec2 {
  const { from, to } = L.progress;
  return { x: from.x + (to.x - from.x) * t + side, z: from.z + (to.z - from.z) * t };
}

interface Walker {
  view: ProtesterView;
  body: Body;
  mind: BotMind | null;
  carrying: boolean;
  intent: BotIntent | null;
}

function simulate(hot: boolean, seconds: number) {
  let seed = 7;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const mood = createMood();
  if (hot) heatUp(mood);
  const walkers: Walker[] = [];
  const add = (id: string, p: Vec2, bot: boolean) => {
    const body = createBody(p.x, p.z);
    walkers.push({ view: { id, x: p.x, z: p.z, status: PlayerStatus.Free, down: false }, body, mind: bot ? createBotMind(id, body, 0, rand) : null, carrying: false, intent: null });
  };
  // The one human stands at the start and does nothing: the front stays put, far from HOT_PROGRESS.
  add("human", at(0.05), false);
  for (let i = 0; i < 7; i++) add(`bot:${i}`, at(0.04 + 0.005 * i, (i % 3) - 1), true);
  // Pavés lying among them, so they pick some up and carry them.
  const items: Vec2[] = [at(0.05, 2), at(0.06, -2), at(0.07, 0), at(0.045, 3)];
  // The opening force, some of it right in the cortège.
  const crs: CrsBot[] = [at(0.06, 1.5), at(0.07, -1.5), at(0.08, 0), at(0.1, 4), at(0.1, -4), at(0.05, -3.5)].map((p, i) =>
    createCrsBot(`crs-${i}`, CrsKind.Crs, p.x, p.z),
  );

  let offences = 0;
  let batonHits = 0;
  let grabs = 0;
  const views = () => walkers.map((w) => w.view);
  const host: CrsHost = {
    protesters: views,
    protester: (id) => walkers.find((w) => w.view.id === id)?.view,
    canBeHurt: () => true,
    batonHit: () => {
      batonHits++;
    },
    grab: () => {
      grabs++;
      return false;
    },
    arrest: () => {},
    release: () => {},
    drag: () => {},
    shove: () => {},
  };
  const ctx: CrsContext = { world: WORLD, nav: CRS_NAV, vans: [], bots: crs, now: 0, dt: TICK_DT };

  for (let now = TICK_DT; now <= seconds; now += TICK_DT) {
    ctx.now = now;
    const front = progressAt(L, walkers[0]!.body.x, walkers[0]!.body.z);
    stepMood(mood, TICK_DT, front);
    ctx.calm = mood.hot ? null : { level: L, front };
    const seenCrs = crs
      .filter((c) => c.status !== CrsStatus.Out)
      .map((c) => ({ id: c.id, x: c.body.x, z: c.body.z, radius: c.stats.radius, down: isDown(c.body), grabbing: c.grabbedId }));
    const seenProtesters = walkers.map((w) => ({ id: w.view.id, x: w.body.x, z: w.body.z, status: w.view.status, bot: w.mind !== null }));
    for (const w of walkers) {
      const mind = w.mind;
      if (mind && botThinkDue(mind, now)) {
        const world: BotWorld = {
          level: L,
          nav: { nav: CRS_NAV, now, bots: [] },
          now,
          // Every chance passes: the most provocative bots there can be.
          random: () => 0,
          self: { x: w.body.x, z: w.body.z, canAct: true, carrying: w.carrying, gassed: false },
          protesters: seenProtesters,
          crs: seenCrs,
          items,
          gas: [],
          hurdles: [],
          calm: !mood.hot,
        };
        const intent = thinkBot(mind, world);
        w.intent = intent;
        // Any swing or throw counts as trouble here, whatever it would have hit.
        if (intent.attack) {
          offences++;
          addOffence(mood, "crsHit");
        }
        if (intent.throwAt && w.carrying) {
          offences++;
          w.carrying = false;
          addOffence(mood, "throw");
        }
        if (intent.pickUp && !w.carrying) {
          const i = items.findIndex((it) => Math.hypot(it.x - w.body.x, it.z - w.body.z) <= PICKUP_RANGE);
          if (i >= 0) {
            items.splice(i, 1);
            w.carrying = true;
          }
        }
      }
      stepBody(WORLD, w.body, w.intent?.move ?? { x: 0, z: 0 }, PLAYER_SPEED * BOT.speed, PLAYER_RADIUS, TICK_DT);
      w.view.x = w.body.x;
      w.view.z = w.body.z;
      w.view.down = isDown(w.body);
    }
    for (const c of crs) stepCrs(c, ctx, host);
  }
  return { mood, offences, batonHits, grabs, carried: walkers.some((w) => w.carrying) };
}

describe("a calm round with bots only (#98)", () => {
  test("bots don't provoke: no swing, no throw, no tension, and the CRS leave everyone alone", () => {
    const r = simulate(false, 45);
    expect(r.offences).toBe(0);
    expect(r.batonHits).toBe(0);
    expect(r.grabs).toBe(0);
    expect(r.mood).toEqual({ tension: 0, hot: false });
    // They did pick up pavés: holding one is no trouble while calm.
    expect(r.carried).toBe(true);
  });

  test("the same scene once hot: the brawl starts", () => {
    const r = simulate(true, 15);
    expect(r.batonHits).toBeGreaterThan(0);
    expect(r.offences).toBeGreaterThan(0);
  });
});
