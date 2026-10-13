import { describe, expect, test } from "bun:test";
import { PlayerStatus } from "../health/index.js";
import { STREET_LEVEL } from "../level/index.js";
import { TICK_DT } from "../net/index.js";
import { propCollisionWorld } from "../prop/index.js";
import {
  applyImpulse,
  circleOverlaps,
  createBody,
  isDodging,
  startDodge,
  stepBody,
  type Body,
  type CollisionWorld,
} from "../physics/index.js";
import { PLAYER_RADIUS, PLAYER_SPEED } from "../player/index.js";
import { createCrsBot, stepCrs, type CrsBot, type CrsContext, type CrsHost } from "./brain.js";
import {
  CRS_STATS,
  CrsKind,
  CrsStatus,
  LINE_BREAK_DAMAGE,
  LINE_FLANK_TIME,
  LINE_SHIELD_RADIUS,
  LINE_SHOVE_INTERVAL,
  LINE_SHOVES_TO_FLOOR,
  LINE_SIZE,
  LINE_SLOT_TOLERANCE,
  LINE_SPACING,
  LINE_SPEED,
  LINE_STRAGGLER_TIME,
} from "./constants.js";
import {
  advanced,
  aheadOf,
  breakLine,
  checkBreak,
  createShieldLine,
  lineBehaviour,
  lineSlots,
  recordLineHit,
  resolveShieldContacts,
  stepLine,
  type ShieldContact,
  type ShieldLine,
} from "./line.js";
import { NavGrid } from "./nav.js";
import type { ProtesterView } from "./targeting.js";

const R = CRS_STATS[CrsKind.Crs].radius;
const UP = { x: 0, z: 1 };
const OPEN: CollisionWorld = { bounds: { minX: -12, maxX: 12, minZ: -40, maxZ: 40 }, boxes: [], circles: [] };
const STREET = propCollisionWorld(STREET_LEVEL, () => false);

interface Person {
  view: ProtesterView;
  body: Body;
}

/** The room, reduced to what a line needs: protesters with bodies, and the shoves it hands out. */
class FakeHost implements CrsHost {
  readonly people = new Map<string, Person>();
  readonly shoves: { by: string; id: string; floor: boolean }[] = [];

  add(id: string, x: number, z: number): Person {
    const p = { view: { id, x, z, status: PlayerStatus.Free, down: false } as ProtesterView, body: createBody(x, z) };
    this.people.set(id, p);
    return p;
  }
  sync() {
    for (const p of this.people.values()) {
      p.view.x = p.body.x;
      p.view.z = p.body.z;
    }
  }
  protesters() {
    return Array.from(this.people.values(), (p) => p.view);
  }
  protester(id: string) {
    return this.people.get(id)?.view;
  }
  canBeHurt() {
    return true;
  }
  batonHit() {}
  grab() {
    return false;
  }
  release() {}
  drag() {}
  shove(by: string, id: string, dirX: number, dirZ: number, strength: number, floor: boolean) {
    this.shoves.push({ by, id, floor });
    const p = this.people.get(id);
    if (p) applyImpulse(p.body, dirX, dirZ, strength, floor ? "always" : "never");
  }
}

/** A formed line of bots standing on their slots at (x, z), facing +Z. */
function makeLine(world: CollisionWorld, x: number, z: number, size = LINE_SIZE): { line: ShieldLine; bots: CrsBot[] } {
  const slots = lineSlots(world, { x, z }, UP, size);
  const bots = slots.map((s, i) => createCrsBot(`crs-${i}`, CrsKind.Crs, s.x, s.z));
  return { line: createShieldLine("line-1", bots, { x, z }, UP), bots };
}

function contacts(line: ShieldLine): ShieldContact[] {
  return line.members.map((m) => ({ body: m.body, bodyRadius: R, radius: LINE_SHIELD_RADIUS, facing: line.facing }));
}

/** The world plus the raised shields, as protesters step against it in the room. */
function crowd(world: CollisionWorld, line: ShieldLine): CollisionWorld {
  return { ...world, circles: [...world.circles, ...line.members.map((m) => ({ x: m.body.x, z: m.body.z, r: LINE_SHIELD_RADIUS }))] };
}

/** Run `seconds` of the room's order: protesters (moved by `walk`), the line, the bots, then the contact pass. */
function run(
  world: CollisionWorld,
  line: ShieldLine,
  bots: CrsBot[],
  host: FakeHost,
  seconds: number,
  walk: (p: Person, t: number) => { x: number; z: number } = () => ({ x: 0, z: 0 }),
  each?: (t: number) => void,
  start = 0,
) {
  const nav = new NavGrid(world, R);
  const ctx: CrsContext = { world, nav, vans: [], bots, now: start, dt: TICK_DT };
  const behaviour = lineBehaviour(line);
  const end = start + seconds;
  for (ctx.now = start; ctx.now < end; ctx.now += TICK_DT) {
    const w = crowd(world, line);
    for (const p of host.people.values()) stepBody(w, p.body, walk(p, ctx.now), PLAYER_SPEED, PLAYER_RADIUS, TICK_DT);
    host.sync();
    stepLine(line, ctx, host);
    for (const bot of bots) stepCrs(bot, ctx, host, behaviour);
    for (const p of host.people.values()) resolveShieldContacts(world, p.body, PLAYER_RADIUS, contacts(line));
    host.sync();
    each?.(ctx.now);
  }
  return ctx;
}

describe("lineSlots", () => {
  test("a wide street gets every slot, evenly spaced and centred", () => {
    const slots = lineSlots(OPEN, { x: 0, z: 0 }, UP, 8);
    expect(slots.length).toBe(8);
    for (let i = 1; i < slots.length; i++) {
      expect(Math.hypot(slots[i]!.x - slots[i - 1]!.x, slots[i]!.z - slots[i - 1]!.z)).toBeCloseTo(LINE_SPACING, 6);
      expect(slots[i]!.z).toBeCloseTo(0, 6);
    }
    const mid = slots.reduce((a, s) => a + s.x, 0) / slots.length;
    expect(mid).toBeCloseTo(0, 6);
  });

  test("a narrow street drops the slots that do not fit, never placing one in a wall", () => {
    const narrow: CollisionWorld = {
      bounds: OPEN.bounds,
      boxes: [
        { x: -8, z: 0, halfX: 5, halfZ: 10 },
        { x: 8, z: 0, halfX: 5, halfZ: 10 },
      ],
      circles: [],
    };
    // 6 units of street between the two buildings.
    const slots = lineSlots(narrow, { x: 0, z: 0 }, UP, 8);
    expect(slots.length).toBe(4);
    for (const s of slots) expect(circleOverlaps(narrow, s.x, s.z, R)).toBe(false);
  });

  test("a line centred near a wall shifts off it instead of losing slots", () => {
    const slots = lineSlots(OPEN, { x: 10, z: 0 }, UP, 8);
    expect(slots.length).toBe(8);
    for (const s of slots) expect(circleOverlaps(OPEN, s.x, s.z, R)).toBe(false);
  });

  test("on the real street, no slot is ever inside a building, a prop or an obstacle", () => {
    for (let z = -88; z <= 84; z += 0.5) {
      for (const s of lineSlots(STREET, { x: 0, z }, UP, LINE_SIZE)) {
        expect({ z, overlap: circleOverlaps(STREET, s.x, s.z, R) }).toEqual({ z, overlap: false });
      }
    }
  });

  test("the level's line spawns are clear, ahead of the start, and fit a whole line", () => {
    const s = STREET_LEVEL.start;
    expect(STREET_LEVEL.lineSpawns.length).toBeGreaterThan(0);
    for (const p of STREET_LEVEL.lineSpawns) {
      expect(circleOverlaps(STREET, p.x, p.z, R)).toBe(false);
      expect(p.z < s.minZ).toBe(true);
      expect(lineSlots(STREET, p, UP, LINE_SIZE).length).toBe(LINE_SIZE);
    }
  });

  test("gaps between neighbours are narrower than a protester, bodies and shields alike", () => {
    expect(LINE_SPACING - 2 * R).toBeLessThan(2 * PLAYER_RADIUS);
    expect(LINE_SPACING - 2 * LINE_SHIELD_RADIUS).toBeLessThan(2 * PLAYER_RADIUS);
  });
});

describe("breaking a line", () => {
  test("enough damage in a short window breaks it", () => {
    const { line } = makeLine(OPEN, 0, 0);
    for (let i = 0; i < LINE_BREAK_DAMAGE - 1; i++) recordLineHit(line, 1, i * 0.3);
    expect(checkBreak(line, [], 2.4)).toBeNull();
    recordLineHit(line, 1, 2.7);
    expect(checkBreak(line, [], 2.7)).toBe("damage");
  });

  test("scattered light hits never break it", () => {
    const { line } = makeLine(OPEN, 0, 0);
    // One hit every 0.5 s for a minute: 6 per 3 s window, under the threshold.
    for (let t = 0; t < 60; t += 0.5) {
      recordLineHit(line, 1, t);
      expect(checkBreak(line, [], t)).toBeNull();
    }
  });

  test("two members stunned or floored at once break it, one does not", () => {
    const { line, bots } = makeLine(OPEN, 0, 0);
    bots[0]!.status = CrsStatus.Stunned;
    expect(checkBreak(line, [], 0)).toBeNull();
    bots[3]!.body.downTime = 1;
    expect(checkBreak(line, [], 0)).toBe("downed");
  });

  test("protesters behind it for long enough break it; stepping back in front resets the clock", () => {
    const { line } = makeLine(OPEN, 0, 0);
    const a: ProtesterView = { id: "a", x: 0, z: -3, status: PlayerStatus.Free, down: false };
    const b: ProtesterView = { id: "b", x: 2, z: -4, status: PlayerStatus.Free, down: false };
    const front: ProtesterView = { id: "c", x: 0, z: 5, status: PlayerStatus.Free, down: false };
    expect(checkBreak(line, [a, b, front], 0)).toBeNull();
    expect(checkBreak(line, [a, b, front], LINE_FLANK_TIME - 0.1)).toBeNull();
    // b steps back in front: one behind out of three free is not enough.
    b.z = 4;
    expect(checkBreak(line, [a, b, front], LINE_FLANK_TIME + 0.5)).toBeNull();
    b.z = -4;
    expect(checkBreak(line, [a, b, front], LINE_FLANK_TIME + 1)).toBeNull();
    expect(checkBreak(line, [a, b, front], LINE_FLANK_TIME * 2 + 1)).toBe("flanked");
  });

  test("a lone protester can flank it; grabbed ones do not count", () => {
    const { line } = makeLine(OPEN, 0, 0);
    const a: ProtesterView = { id: "a", x: 0, z: -3, status: PlayerStatus.Free, down: false };
    const grabbed: ProtesterView = { id: "g", x: 0, z: -3, status: PlayerStatus.Grabbed, down: false };
    expect(checkBreak(line, [a, grabbed], 0)).toBeNull();
    expect(checkBreak(line, [a, grabbed], LINE_FLANK_TIME)).toBe("flanked");
    const { line: other } = makeLine(OPEN, 0, 0);
    expect(checkBreak(other, [grabbed], 0)).toBeNull();
    expect(checkBreak(other, [grabbed], 10)).toBeNull();
  });

  test("broken, members chase like any bot", () => {
    const host = new FakeHost();
    host.add("p", 0, 6);
    const { line, bots } = makeLine(OPEN, 0, 0);
    run(OPEN, line, bots, host, 0.2);
    expect(bots.every((b) => b.targetId === null)).toBe(true);
    breakLine(line, "damage");
    const ctx = run(OPEN, line, bots, host, 0.2);
    expect(line.formed).toBe(false);
    expect(bots.some((b) => b.targetId === "p")).toBe(true);
    expect(ctx.now).toBeGreaterThan(0);
  });
});

describe("advancing", () => {
  test("it advances slowly towards protesters in range, and holds with nobody around", () => {
    const host = new FakeHost();
    const { line, bots } = makeLine(OPEN, 0, 0);
    run(OPEN, line, bots, host, 3);
    expect(advanced(line)).toBeCloseTo(0, 6);
    host.add("p", 0, 25);
    run(OPEN, line, bots, host, 5);
    expect(advanced(line)).toBeGreaterThan(LINE_SPEED * 5 * 0.8);
    expect(advanced(line)).toBeLessThanOrEqual(LINE_SPEED * 5.1);
    // Members kept up.
    for (const b of bots) expect(b.body.z).toBeGreaterThan(line.centre.z - 0.5);
  });

  test("it stops after its maximum advance", () => {
    const host = new FakeHost();
    host.add("p", 0, 30);
    const { line, bots } = makeLine(OPEN, 0, 0);
    line.maxAdvance = 2;
    run(OPEN, line, bots, host, 5);
    expect(advanced(line)).toBeCloseTo(2, 6);
  });

  test("one member held back does not stop the whole line forever", () => {
    const host = new FakeHost();
    host.add("p", 0, 25);
    const { line, bots } = makeLine(OPEN, 0, 0);
    const stuck = bots[3]!;
    const hold = () => {
      stuck.body.z = 0;
    };
    run(OPEN, line, bots, host, LINE_STRAGGLER_TIME - 0.5, undefined, hold);
    const early = advanced(line);
    // It can only get as far as the held member's slot tolerance.
    expect(early).toBeLessThan(LINE_SLOT_TOLERANCE + 0.1);
    run(OPEN, line, bots, host, 4, undefined, hold, LINE_STRAGGLER_TIME - 0.5);
    expect(advanced(line)).toBeGreaterThan(early + 2);
  });

  test("on the real street, it forms, advances and keeps every member out of the walls", () => {
    const host = new FakeHost();
    host.add("p", 0, 80);
    const spawn = STREET_LEVEL.lineSpawns[0]!;
    const { line, bots } = makeLine(STREET, spawn.x, spawn.z);
    run(STREET, line, bots, host, 12, undefined, () => {
      for (const b of bots) expect(circleOverlaps(STREET, b.body.x, b.body.z, R, 1e-3)).toBe(false);
    });
    expect(advanced(line)).toBeGreaterThan(8);
    expect(line.formed).toBe(true);
  });
});

describe("blocking and shoving", () => {
  test("protesters walking at the line, between two members or anywhere along it, never get through", () => {
    for (const x of [0, 0.75, 1.5, 2.25, -3, 4.5]) {
      const host = new FakeHost();
      const p = host.add("p", x, 6);
      const { line, bots } = makeLine(OPEN, 0, 0);
      line.maxAdvance = 0;
      run(OPEN, line, bots, host, 6, () => ({ x: 0, z: -1 }), () => {
        expect({ x, ahead: aheadOf(line, p.body) > 0 }).toEqual({ x, ahead: true });
      });
    }
  });

  test("a dodge or a flying body into a gap does not squeeze through", () => {
    for (const how of ["dodge", "impulse"] as const) {
      const host = new FakeHost();
      const p = host.add("p", 0.75, 3);
      const { line, bots } = makeLine(OPEN, 0, 0);
      line.maxAdvance = 0;
      run(OPEN, line, bots, host, 4, (person) => {
        if (how === "dodge" && !isDodging(person.body)) startDodge(person.body, 0, -1);
        if (how === "impulse" && person.body.vz > -1) applyImpulse(person.body, 0, -1, 30, "never");
        return { x: 0, z: -1 };
      }, () => {
        expect({ how, ahead: aheadOf(line, p.body) > 0 }).toEqual({ how, ahead: true });
      });
    }
  });

  test("touching the line gets you shoved back, every couple of seconds, and too many in a row floor you", () => {
    const host = new FakeHost();
    const p = host.add("p", 0, 2);
    const { line, bots } = makeLine(OPEN, 0, 0);
    line.maxAdvance = 0;
    run(OPEN, line, bots, host, 0.3, () => ({ x: 0, z: -1 }));
    expect(host.shoves.length).toBe(1);
    expect(host.shoves[0]!.floor).toBe(false);
    expect(p.body.vz).toBeGreaterThan(0);
    // Keep leaning on it.
    run(OPEN, line, bots, host, LINE_SHOVE_INTERVAL * LINE_SHOVES_TO_FLOOR, () => ({ x: 0, z: -1 }), undefined, 0.3);
    const mine = host.shoves.filter((s) => s.id === "p");
    expect(mine.length).toBeGreaterThanOrEqual(LINE_SHOVES_TO_FLOOR);
    expect(mine.length).toBeLessThanOrEqual(LINE_SHOVES_TO_FLOOR + 1);
    expect(mine[LINE_SHOVES_TO_FLOOR - 1]!.floor).toBe(true);
    expect(mine.slice(0, LINE_SHOVES_TO_FLOOR - 1).every((s) => !s.floor)).toBe(true);
  });

  test("pinned between a shield and a wall: the protester stays out of the wall and the member gives way", () => {
    const wall: CollisionWorld = { bounds: OPEN.bounds, boxes: [{ x: 0, z: 11, halfX: 10, halfZ: 1 }], circles: [] };
    const p = createBody(0, 9.6);
    const member = { x: 0, z: 9.0 };
    const contact: ShieldContact = { body: member, bodyRadius: R, radius: LINE_SHIELD_RADIUS, facing: UP };
    expect(resolveShieldContacts(wall, p, PLAYER_RADIUS, [contact])).toBe(true);
    expect(circleOverlaps(wall, p.x, p.z, PLAYER_RADIUS)).toBe(false);
    expect(Math.hypot(p.x - member.x, p.z - member.z)).toBeGreaterThanOrEqual(PLAYER_RADIUS + LINE_SHIELD_RADIUS - 1e-6);
    expect(member.z).toBeLessThan(9.0);
  });

  test("an advancing line pins a protester against a wall: never through it, and the line stops", () => {
    const wall: CollisionWorld = { bounds: OPEN.bounds, boxes: [{ x: 0, z: 9, halfX: 12, halfZ: 1 }], circles: [] };
    const host = new FakeHost();
    const p = host.add("p", 0.3, 7.5);
    const { line, bots } = makeLine(wall, 0, 0);
    run(wall, line, bots, host, 15, () => ({ x: 0, z: 0 }), () => {
      expect(circleOverlaps(wall, p.body.x, p.body.z, PLAYER_RADIUS, 1e-6)).toBe(false);
      for (const b of bots) expect(circleOverlaps(wall, b.body.x, b.body.z, R, 1e-6)).toBe(false);
    });
    // The protester was not pushed through anything and the line did not walk over them.
    expect(p.body.z).toBeGreaterThan(line.centre.z - 0.01);
    for (const b of bots) expect(Math.hypot(p.body.x - b.body.x, p.body.z - b.body.z)).toBeGreaterThan(PLAYER_RADIUS + LINE_SHIELD_RADIUS - 0.05);
  });
});
