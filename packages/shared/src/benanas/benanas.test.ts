import { describe, expect, test } from "bun:test";
import { cameoRoundChance } from "../cameo/index.js";
import { ROUND_DURATION } from "../round/index.js";
import { STREET_LEVEL as L, progressAt } from "../level/index.js";
import { KNOCKDOWN_THRESHOLD } from "../physics/index.js";
import { truckBays } from "../pompier/index.js";
import { PLAYER_SPEED } from "../player/index.js";
import {
  BENANAS,
  BENANAS_LINES,
  backOffGoal,
  benanasEntry,
  benanasLineText,
  countNear,
  crowdedOut,
  freshHelmet,
  hitHelmet,
  inPunchReach,
  pickBenanasLine,
  pickBenanasTarget,
  type BenanasSeen,
} from "./index.js";

const seen = (id: string, x: number, z: number, target = true): BenanasSeen => ({ id, x, z, target });

describe("when he comes (#132)", () => {
  test("10% a minute of march, once a round: about 52% of full rounds", () => {
    expect(BENANAS.chance).toBeCloseTo(0.1, 5);
    expect(cameoRoundChance(BENANAS.chance, ROUND_DURATION, BENANAS.duration)).toBeCloseTo(0.52, 2);
  });
});

describe("whom he picks on", () => {
  test("the lone protester over the closer one in a group", () => {
    const group = [seen("a", 3, 0), seen("b", 4, 0), seen("c", 3, 1), seen("d", 4, 1)];
    const lone = seen("lone", -12, 0);
    expect(pickBenanasTarget({ x: 0, z: 0 }, [...group, lone])?.id).toBe("lone");
  });

  test("nobody lone enough, nobody in sight, or only the spared: no target", () => {
    const group = [seen("a", 3, 0), seen("b", 4, 0), seen("c", 3, 1)];
    expect(pickBenanasTarget({ x: 0, z: 0 }, group)).toBeNull();
    expect(pickBenanasTarget({ x: 0, z: 0 }, [seen("far", BENANAS.sight + 1, 0)])).toBeNull();
    expect(pickBenanasTarget({ x: 0, z: 0 }, [seen("x", 2, 0)], (id) => id === "x")).toBeNull();
  });

  test("never someone down, held or flying, though they still count as company", () => {
    const down = seen("down", 2, 0, false);
    expect(pickBenanasTarget({ x: 0, z: 0 }, [down])).toBeNull();
    // A pair (one other within loneRadius) is still fair game; a trio is not.
    const pair = [seen("p1", 5, 0), seen("p2", 6, 0)];
    expect(pickBenanasTarget({ x: 0, z: 0 }, pair)?.id).toBe("p1");
    expect(pickBenanasTarget({ x: 0, z: 0 }, [...pair, seen("p3", 5, 1, false)])).toBeNull();
  });

  test("after a hit he switches: the one just hit is spared and the next lone one is picked", () => {
    const people = [seen("first", 2, 0), seen("second", -10, 0)];
    expect(pickBenanasTarget({ x: 0, z: 0 }, people)?.id).toBe("first");
    expect(pickBenanasTarget({ x: 0, z: 0 }, people, (id) => id === "first")?.id).toBe("second");
  });

  test("countNear leaves out the one asked about", () => {
    const people = [seen("a", 0, 0), seen("b", 1, 0), seen("c", 10, 0)];
    expect(countNear({ x: 0, z: 0 }, people, 2, "a")).toBe(1);
    expect(countNear({ x: 0, z: 0 }, people, 2)).toBe(2);
  });
});

describe("backing off", () => {
  test("three protesters close in: crowded out; two: not", () => {
    const two = [seen("a", 1, 0), seen("b", -1, 0)];
    expect(crowdedOut({ x: 0, z: 0 }, two)).toBe(false);
    expect(crowdedOut({ x: 0, z: 0 }, [...two, seen("c", 0, 1.5)])).toBe(true);
    // Far ones don't count.
    expect(crowdedOut({ x: 0, z: 0 }, [...two, seen("c", 0, BENANAS.crowdRadius + 0.5)])).toBe(false);
  });

  test("away from the middle of the crowd, by the distance asked", () => {
    const crowd = [seen("a", 2, 1), seen("b", 2, -1), seen("c", 3, 0)];
    const g = backOffGoal({ x: 0, z: 0 }, crowd, 5, { x: 0, z: 1 });
    expect(g.x).toBeCloseTo(-5, 5);
    expect(g.z).toBeCloseTo(0, 5);
  });

  test("nobody around, or the crowd right on him: along the fallback", () => {
    expect(backOffGoal({ x: 0, z: 0 }, [], 4, { x: 0, z: 1 })).toEqual({ x: 0, z: 4 });
    const around = [seen("a", 1, 0), seen("b", -1, 0)];
    expect(backOffGoal({ x: 0, z: 0 }, around, 4, { x: 1, z: 0 })).toEqual({ x: 4, z: 0 });
  });
});

describe("his punch", () => {
  test("in reach only when the bodies' edges are close", () => {
    const touching = BENANAS.radius + 0.4 + BENANAS.hitReach;
    expect(inPunchReach({ x: 0, z: 0 }, { x: touching - 0.01, z: 0 }, 0.4)).toBe(true);
    expect(inPunchReach({ x: 0, z: 0 }, { x: touching + 0.05, z: 0 }, 0.4)).toBe(false);
  });

  test("floors, hurts less than a baton, and he can be outrun", () => {
    expect(BENANAS.hitImpulse).toBeGreaterThanOrEqual(KNOCKDOWN_THRESHOLD);
    expect(BENANAS.hitDamage).toBeLessThan(20);
    expect(BENANAS.speed).toBeLessThan(PLAYER_SPEED);
    expect(BENANAS.fleeSpeed).toBeGreaterThan(PLAYER_SPEED);
    expect(BENANAS.hurtImpulse).toBeLessThan(KNOCKDOWN_THRESHOLD);
  });
});

describe("unmasking", () => {
  test("the helmet comes off on the hp-th hit, once, and remembers every hitter", () => {
    const h = freshHelmet();
    expect(BENANAS.hp).toBe(4);
    expect(hitHelmet(h, "a")).toBe(false);
    expect(hitHelmet(h, "b")).toBe(false);
    expect(hitHelmet(h, "a")).toBe(false);
    expect(hitHelmet(h, "c")).toBe(true);
    expect([...h.hitters].sort()).toEqual(["a", "b", "c"]);
    // Off already: nothing more, nobody new credited.
    expect(hitHelmet(h, "d")).toBe(false);
    expect(h.hitters.has("d")).toBe(false);
  });
});

describe("his way in", () => {
  const doors = truckBays(L, BENANAS.radius).map((b) => b.door);
  const rear = { x: 0, z: 0 };

  test("a side street ahead of the front (behind the CRS line), in his window", () => {
    const front = 0.4;
    const e = benanasEntry(L, doors, front, rear);
    const t = progressAt(L, e.x, e.z);
    const any = doors.some((d) => {
      const dt = progressAt(L, d.x, d.z) - front;
      return dt >= BENANAS.entryAheadMin && dt <= BENANAS.entryAheadMax;
    });
    if (any) {
      expect(t).toBeGreaterThanOrEqual(front + BENANAS.entryAheadMin - 1e-6);
      expect(t).toBeLessThanOrEqual(front + BENANAS.entryAheadMax + 1e-6);
    }
  });

  test("no doors: the rear", () => {
    expect(benanasEntry(L, [], 0.5, { x: 3, z: 4 })).toEqual({ x: 3, z: 4 });
  });
});

describe("his lines", () => {
  test("made up, the issue's ones among them, a kind each moment", () => {
    const texts = BENANAS_LINES.map((l) => l.text);
    for (const t of ["Je suis là en observateur !", "Chargé de mission, circulez !", "C'est un malentendu !", "J'ai un badge, enfin presque", "C'était pas moi !"]) expect(texts).toContain(t);
    for (const kind of ["arrive", "hit", "backOff", "unmasked", "leave"] as const) expect(pickBenanasLine(kind, -1, () => 0)).toBeGreaterThanOrEqual(0);
  });

  test("a new line avoids the previous one when it can; out of range is empty", () => {
    const first = pickBenanasLine("hit", -1, () => 0);
    expect(pickBenanasLine("hit", first, () => 0)).not.toBe(first);
    const leave = pickBenanasLine("leave", -1, () => 0);
    expect(pickBenanasLine("leave", leave, () => 0)).toBe(leave);
    expect(benanasLineText(-1)).toBe("");
    expect(benanasLineText(999)).toBe("");
  });
});
