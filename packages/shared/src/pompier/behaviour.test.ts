import { describe, expect, test } from "bun:test";
import { CrsKind, CrsStatus, NavGrid, createCrsBot, stepCrs, type CrsContext, type CrsHost } from "../crs/index.js";
import { PlayerStatus } from "../health/index.js";
import { TICK_DT } from "../net/index.js";
import type { CollisionWorld } from "../physics/index.js";
import { pompierBehaviour, type PompierOrder } from "./behaviour.js";

const WORLD: CollisionWorld = { bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, boxes: [], circles: [] };

function setup(order: PompierOrder) {
  const bot = createCrsBot("p", CrsKind.Pompier, 0, 0);
  const calls: string[] = [];
  const someone = { id: "alice", x: 0.9, z: 0, status: PlayerStatus.Free, down: false };
  const host: CrsHost = {
    protesters: () => [someone],
    protester: (id) => (id === someone.id ? someone : undefined),
    canBeHurt: () => true,
    batonHit: () => calls.push("baton"),
    batonMiss: () => calls.push("miss"),
    grab: () => {
      calls.push("grab");
      return true;
    },
    release: () => calls.push("release"),
    arrest: () => calls.push("arrest"),
    drag: () => calls.push("drag"),
    shove: () => calls.push("shove"),
    throwGas: () => {
      calls.push("gas");
      return true;
    },
  };
  const ctx: CrsContext = { world: WORLD, nav: new NavGrid(WORLD, 0.6), vans: [{ x: 0, z: -15 }], bots: [bot], now: 0, dt: TICK_DT };
  const behaviour = pompierBehaviour((id) => (id === "p" ? order : undefined));
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += TICK_DT) {
      ctx.now += TICK_DT;
      stepCrs(bot, ctx, host, behaviour);
    }
  };
  return { bot, calls, run };
}

describe("pompier behaviour", () => {
  test("never hits, grabs, gasses or drags anyone, even a protester touching it", () => {
    const { bot, calls, run } = setup({ goal: null, aim: null });
    run(5);
    expect(calls).toEqual([]);
    expect(bot.status).toBe(CrsStatus.Active);
    expect(bot.targetId).toBeNull();
  });

  test("walks to its goal, then stands", () => {
    const { bot, run } = setup({ goal: { x: 0, z: 8 }, aim: null });
    run(3);
    expect(Math.hypot(bot.body.x, bot.body.z - 8)).toBeLessThan(0.3);
    const at = { x: bot.body.x, z: bot.body.z };
    run(1);
    expect(Math.hypot(bot.body.x - at.x, bot.body.z - at.z)).toBeLessThan(0.05);
  });

  test("standing, it faces what it aims at", () => {
    const { bot, run } = setup({ goal: null, aim: { x: 5, z: 0 } });
    run(0.1);
    expect(bot.rotation).toBeCloseTo(Math.PI / 2);
  });
});
