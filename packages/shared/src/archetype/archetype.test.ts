import { describe, expect, test } from "bun:test";
import { MAX_HP } from "../health/index.js";
import { Phase } from "../round/index.js";
import {
  ARCHETYPE_IDS,
  ARCHETYPES,
  AURA_RADIUS,
  Archetype,
  DEFAULT_ARCHETYPE,
  archetypeOf,
  archetypeStats,
  bestHealer,
  canPickArchetype,
  filmFactor,
  healRate,
  propDamageOf,
  spreadAim,
  stepHeal,
  type AuraSubject,
} from "./index.js";

const subject = (id: string, x: number, archetype: Archetype): AuraSubject => ({ id, x, z: 0, stats: archetypeStats(archetype) });

describe("the archetype table", () => {
  test("every id in the menu has an entry, and every entry is in the menu", () => {
    expect(ARCHETYPE_IDS.length).toBe(Object.keys(ARCHETYPES).length);
    for (const id of ARCHETYPE_IDS) expect(ARCHETYPES[id]).toBeDefined();
    expect(ARCHETYPE_IDS[0]).toBe(DEFAULT_ARCHETYPE);
  });

  test("the seven archetypes of the roster plus the neutral default", () => {
    expect(ARCHETYPE_IDS.length).toBe(8);
    const names = ARCHETYPE_IDS.map((id) => ARCHETYPES[id].name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("the default changes nothing", () => {
    const s = archetypeStats(DEFAULT_ARCHETYPE);
    expect(s).toEqual({
      speed: 1,
      maxHp: MAX_HP,
      grabTime: 1,
      rescueTime: 1,
      propDamage: 1,
      throwRange: 1,
      throwSpread: 0,
      dodgeCooldown: 1,
      targetWeight: 1,
      healAura: 0,
      filmAura: 1,
    });
  });

  test("stats derived for every archetype", () => {
    expect(archetypeStats(Archetype.Bobo)).toMatchObject({ dodgeCooldown: 0.7, throwRange: 0.75, throwSpread: 0.18, filmAura: 1.25 });
    expect(archetypeStats(Archetype.Cite)).toMatchObject({ speed: 1.12, throwRange: 1.25, maxHp: 80 });
    expect(archetypeStats(Archetype.GiletJaune)).toMatchObject({ speed: 0.85, maxHp: 130, grabTime: 1.25 });
    expect(archetypeStats(Archetype.BlackBloc)).toMatchObject({ propDamage: 2, targetWeight: 1.4 });
    expect(archetypeStats(Archetype.Cgt)).toMatchObject({ speed: 0.85, healAura: 2 });
    expect(archetypeStats(Archetype.Etudiant)).toMatchObject({ rescueTime: 0.6, maxHp: 75 });
    expect(archetypeStats(Archetype.Retraite)).toMatchObject({ speed: 0.75, grabTime: 1.75 });
  });

  test("every archetype has a strength and a weakness, and stays in sane bounds", () => {
    for (const id of ARCHETYPE_IDS) {
      const a = ARCHETYPES[id];
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(0);
      const s = a.stats;
      // Always faster than a plain CRS (4.2 m/s against 6 m/s base): a slow archetype can still get away.
      expect(s.speed * 6).toBeGreaterThan(4.2);
      expect(s.speed).toBeLessThanOrEqual(1.3);
      expect(Number.isInteger(s.maxHp)).toBe(true);
      expect(s.maxHp).toBeGreaterThanOrEqual(70);
      expect(s.maxHp).toBeLessThanOrEqual(255);
      for (const f of [s.grabTime, s.rescueTime, s.throwRange, s.dodgeCooldown, s.targetWeight, s.filmAura]) {
        expect(f).toBeGreaterThan(0.5);
        expect(f).toBeLessThanOrEqual(2);
      }
    }
  });

  test("a slow archetype is still faster than a CRS", () => {
    expect(archetypeStats(Archetype.Retraite).speed * 6).toBeGreaterThan(4.2);
  });
});

describe("archetypeOf", () => {
  test("a known id is kept", () => {
    for (const id of ARCHETYPE_IDS) expect(archetypeOf(id)).toBe(id);
  });

  test("an unknown id falls back to the default", () => {
    for (const bad of [8, 99, -1, 1.5, Number.NaN, "3", null, undefined, {}, [3], true]) {
      expect(archetypeOf(bad)).toBe(DEFAULT_ARCHETYPE);
      expect(archetypeStats(bad)).toBe(ARCHETYPES[DEFAULT_ARCHETYPE].stats);
    }
  });

  test("duplicates: two players with the same id get the very same stats", () => {
    expect(archetypeStats(Archetype.GiletJaune)).toBe(archetypeStats(Archetype.GiletJaune));
  });
});

describe("canPickArchetype", () => {
  test("only in the lobby; locked during the march and on the end screen", () => {
    expect(canPickArchetype(Phase.Waiting)).toBe(true);
    expect(canPickArchetype(Phase.Marching)).toBe(false);
    expect(canPickArchetype(Phase.Ended)).toBe(false);
  });
});

describe("propDamageOf", () => {
  test("scales and rounds, never below 1", () => {
    expect(propDamageOf(1, 1)).toBe(1);
    expect(propDamageOf(1, 2)).toBe(2);
    expect(propDamageOf(3, 2)).toBe(6);
    expect(propDamageOf(1, 0.2)).toBe(1);
  });
});

describe("spreadAim", () => {
  test("no spread throws straight", () => {
    const dir = { x: 0, z: 1 };
    expect(spreadAim(dir, 0, 0.99)).toBe(dir);
  });

  test("the middle of the random range throws straight", () => {
    const d = spreadAim({ x: 0, z: 1 }, 0.3, 0.5);
    expect(d.x).toBeCloseTo(0);
    expect(d.z).toBeCloseTo(1);
  });

  test("never further off than the spread, and still a unit vector", () => {
    for (const r of [0, 0.1, 0.37, 0.8, 0.999]) {
      const d = spreadAim({ x: 0.6, z: 0.8 }, 0.18, r);
      expect(Math.hypot(d.x, d.z)).toBeCloseTo(1);
      const angle = Math.acos(Math.min(1, d.x * 0.6 + d.z * 0.8));
      expect(angle).toBeLessThanOrEqual(0.18 + 1e-9);
    }
  });
});

describe("heal aura", () => {
  const target = subject("t", 0, Archetype.Lambda);

  test("a CGT within the radius heals at its rate", () => {
    expect(healRate(target, [subject("c", AURA_RADIUS - 0.1, Archetype.Cgt)])).toBe(2);
  });

  test("out of reach, or not a healer: nothing", () => {
    expect(healRate(target, [subject("c", AURA_RADIUS + 0.1, Archetype.Cgt)])).toBe(0);
    expect(healRate(target, [subject("b", 1, Archetype.BlackBloc)])).toBe(0);
  });

  test("two CGT side by side do not stack: the best single rate", () => {
    const two = [subject("c1", 1, Archetype.Cgt), subject("c2", -1, Archetype.Cgt)];
    expect(healRate(target, two)).toBe(healRate(target, [two[0] as AuraSubject]));
  });

  test("a CGT does not heal itself, but heals another CGT", () => {
    const me = subject("c1", 0, Archetype.Cgt);
    expect(healRate(me, [me])).toBe(0);
    expect(healRate(me, [me, subject("c2", 1, Archetype.Cgt)])).toBe(2);
  });

  test("the credit for a heal (#41) goes to the nearest CGT in reach, never to the target itself", () => {
    expect(bestHealer(target, [subject("far", 3, Archetype.Cgt), subject("near", -1, Archetype.Cgt)])).toBe("near");
    expect(bestHealer(target, [subject("out", AURA_RADIUS + 0.1, Archetype.Cgt)])).toBeNull();
    const me = subject("c1", 0, Archetype.Cgt);
    expect(bestHealer(me, [me])).toBeNull();
    expect(bestHealer(target, [subject("b", 1, Archetype.BlackBloc)])).toBeNull();
  });

  test("whole HP per tick, the fraction carried over", () => {
    let carry = 0;
    let healed = 0;
    // 2 HP/s for one second at 20 Hz.
    for (let i = 0; i < 20; i++) {
      const r = stepHeal(carry, 2, 1 / 20);
      carry = r.carry;
      healed += r.heal;
    }
    expect(healed).toBe(2);
    expect(stepHeal(0.7, 0, 0.05)).toEqual({ heal: 0, carry: 0 });
  });
});

describe("filming aura", () => {
  test("a bobo nearby makes the drag longer; out of reach, no change", () => {
    const at = { x: 0, z: 0 };
    expect(filmFactor(at, [subject("b", 2, Archetype.Bobo)])).toBe(1.25);
    expect(filmFactor(at, [subject("b", AURA_RADIUS + 1, Archetype.Bobo)])).toBe(1);
    expect(filmFactor(at, [subject("x", 1, Archetype.GiletJaune)])).toBe(1);
  });

  test("the bobo films its own arrest too", () => {
    expect(filmFactor({ x: 3, z: 0 }, [subject("b", 3, Archetype.Bobo)])).toBe(1.25);
  });

  test("two bobos do not stack", () => {
    expect(filmFactor({ x: 0, z: 0 }, [subject("b1", 1, Archetype.Bobo), subject("b2", -1, Archetype.Bobo)])).toBe(1.25);
  });
});
