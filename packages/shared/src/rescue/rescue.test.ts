import { describe, expect, test } from "bun:test";
import { PlayerStatus, createHealth, grab, rescue, tickHealth, type Health } from "../health/index.js";
import { RESCUE_RANGE, RESCUE_TIME } from "./constants.js";
import {
  canRescue,
  createRescuer,
  pickRescueTarget,
  rescueProgress,
  stepRescuer,
  stepRescues,
  type RescueSubject,
  type Rescuer,
} from "./rescue.js";

const DT = 1 / 30;
const S = PlayerStatus;
/** Ticks needed to finish a rescue, the first tick of holding included. */
const RESCUE_TICKS = Math.round(RESCUE_TIME / DT);

interface Person {
  id: string;
  x: number;
  z: number;
  status: number;
  /** Free and not knocked down. */
  canAct: boolean;
}

/** A tiny fake room: people by id, a rescuer per person, and the release. */
function world(people: Person[]) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const rescuers = new Map<string, Rescuer>(people.map((p) => [p.id, createRescuer()]));
  const freed: [string, string][] = [];
  return {
    byId,
    rescuers,
    freed,
    get(id: string) {
      return byId.get(id)!;
    },
    rescuer(id: string) {
      return rescuers.get(id)!;
    },
    tick() {
      const done = stepRescues(
        rescuers,
        (id) => byId.get(id),
        () => byId.values(),
        (id) => byId.get(id)?.canAct ?? false,
        DT,
        (target) => {
          const p = byId.get(target);
          if (!p || p.status !== S.Grabbed) return false;
          p.status = S.Free;
          return true;
        },
      );
      freed.push(...done);
      return done;
    },
    ticks(n: number) {
      for (let i = 0; i < n; i++) this.tick();
    },
  };
}

const person = (id: string, x: number, z: number, status: number = S.Free, canAct = status === S.Free): Person => ({ id, x, z, status, canAct });

describe("target choice", () => {
  test("picks the nearest grabbed teammate in range", () => {
    const me: RescueSubject = { id: "a", x: 0, z: 0, status: S.Free };
    const subjects = [
      { id: "far", x: 1.5, z: 0, status: S.Grabbed },
      { id: "near", x: 0, z: 1, status: S.Grabbed },
      { id: "free", x: 0.5, z: 0, status: S.Free },
      { id: "out", x: RESCUE_RANGE + 0.1, z: 0, status: S.Grabbed },
    ];
    expect(pickRescueTarget(me, subjects)).toBe("near");
  });

  test("two grabbed teammates at the same distance: the smaller id, whatever the order", () => {
    const me: RescueSubject = { id: "a", x: 0, z: 0, status: S.Free };
    const left = { id: "c", x: -1, z: 0, status: S.Grabbed };
    const right = { id: "b", x: 1, z: 0, status: S.Grabbed };
    expect(pickRescueTarget(me, [left, right])).toBe("b");
    expect(pickRescueTarget(me, [right, left])).toBe("b");
  });

  test("ignores KO, arrested and free protesters, and anyone out of range", () => {
    const me: RescueSubject = { id: "a", x: 0, z: 0, status: S.Free };
    expect(
      pickRescueTarget(me, [
        { id: "k", x: 0.5, z: 0, status: S.Ko },
        { id: "r", x: 0.5, z: 0, status: S.Arrested },
        { id: "f", x: 0.5, z: 0, status: S.Free },
        { id: "o", x: 0, z: RESCUE_RANGE + 0.01, status: S.Grabbed },
      ]),
    ).toBeNull();
    expect(canRescue(me, { id: "edge", x: RESCUE_RANGE, z: 0, status: S.Grabbed })).toBe(true);
  });

  test("a protester cannot rescue themself", () => {
    const me: RescueSubject = { id: "a", x: 0, z: 0, status: S.Grabbed };
    expect(canRescue(me, me)).toBe(false);
    expect(pickRescueTarget(me, [me])).toBeNull();
    // Holding interact while grabbed does nothing either.
    const w = world([person("a", 0, 0, S.Grabbed)]);
    w.rescuer("a").holding = true;
    w.ticks(RESCUE_TICKS * 2);
    expect(w.get("a").status).toBe(S.Grabbed);
    expect(w.freed).toEqual([]);
  });

  test("sticks to its target while it stays valid, even if another comes closer", () => {
    const w = world([person("a", 0, 0), person("g1", 1.5, 0, S.Grabbed), person("g2", 3, 0, S.Grabbed)]);
    w.rescuer("a").holding = true;
    w.tick();
    expect(w.rescuer("a").targetId).toBe("g1");
    w.get("g2").x = 0.5;
    w.tick();
    expect(w.rescuer("a").targetId).toBe("g1");
    expect(w.rescuer("a").progress).toBeCloseTo(2 * DT);
  });
});

describe("progress over time", () => {
  test("holding next to a grabbed teammate for RESCUE_TIME frees them, not a tick earlier", () => {
    const w = world([person("a", 0, 0), person("b", 1, 0, S.Grabbed)]);
    w.rescuer("a").holding = true;
    w.ticks(RESCUE_TICKS - 1);
    expect(w.get("b").status).toBe(S.Grabbed);
    expect(w.rescuer("a").progress).toBeCloseTo(RESCUE_TIME - DT);
    expect(rescueProgress(w.rescuers.values(), "b")).toBeCloseTo((RESCUE_TICKS - 1) / RESCUE_TICKS);
    expect(w.tick()).toEqual([["b", "a"]]);
    expect(w.get("b").status).toBe(S.Free);
    // Done: the rescue ends and nothing is shown any more.
    expect(w.rescuer("a").targetId).toBeNull();
    expect(rescueProgress(w.rescuers.values(), "b")).toBe(0);
  });

  test("not holding does nothing", () => {
    const w = world([person("a", 0, 0), person("b", 1, 0, S.Grabbed)]);
    w.ticks(RESCUE_TICKS * 3);
    expect(w.get("b").status).toBe(S.Grabbed);
  });

  test("holding with nobody grabbed nearby does nothing, then starts when someone is", () => {
    const w = world([person("a", 0, 0), person("b", 5, 0, S.Grabbed)]);
    w.rescuer("a").holding = true;
    w.ticks(RESCUE_TICKS * 2);
    expect(w.rescuer("a").targetId).toBeNull();
    expect(w.get("b").status).toBe(S.Grabbed);
    w.get("a").x = 4;
    w.ticks(RESCUE_TICKS);
    expect(w.get("b").status).toBe(S.Free);
  });
});

describe("interrupts", () => {
  test("releasing interact early frees nobody and drops the progress", () => {
    const w = world([person("a", 0, 0), person("b", 1, 0, S.Grabbed)]);
    const r = w.rescuer("a");
    r.holding = true;
    w.ticks(RESCUE_TICKS - 2);
    r.holding = false;
    w.tick();
    expect(r.progress).toBe(0);
    expect(r.targetId).toBeNull();
    w.ticks(RESCUE_TICKS * 2);
    expect(w.get("b").status).toBe(S.Grabbed);
    // Pressing again starts from zero.
    r.holding = true;
    w.ticks(RESCUE_TICKS - 1);
    expect(w.get("b").status).toBe(S.Grabbed);
    w.tick();
    expect(w.get("b").status).toBe(S.Free);
  });

  test("walking out of range (or being dragged away) frees nobody and drops the progress", () => {
    const w = world([person("a", 0, 0), person("b", 1, 0, S.Grabbed)]);
    const r = w.rescuer("a");
    r.holding = true;
    w.ticks(RESCUE_TICKS - 2);
    w.get("b").x = RESCUE_RANGE + 0.5;
    w.tick();
    expect(r.progress).toBe(0);
    expect(w.get("b").status).toBe(S.Grabbed);
    // Back in range while still holding: a fresh start, the full time again.
    w.get("b").x = 1;
    w.ticks(RESCUE_TICKS - 1);
    expect(w.get("b").status).toBe(S.Grabbed);
    w.tick();
    expect(w.get("b").status).toBe(S.Free);
  });

  test("a rescuer grabbed mid-rescue loses their progress", () => {
    const w = world([person("a", 0, 0), person("b", 1, 0, S.Grabbed)]);
    const r = w.rescuer("a");
    r.holding = true;
    w.ticks(RESCUE_TICKS - 2);
    const a = w.get("a");
    a.status = S.Grabbed;
    a.canAct = false;
    w.tick();
    expect(r.progress).toBe(0);
    expect(r.targetId).toBeNull();
    expect(w.get("b").status).toBe(S.Grabbed);
  });

  test("a rescuer KO'd or knocked down mid-rescue loses their progress", () => {
    for (const hit of [{ status: S.Ko }, { status: S.Free }]) {
      const w = world([person("a", 0, 0), person("b", 1, 0, S.Grabbed)]);
      const r = w.rescuer("a");
      r.holding = true;
      w.ticks(RESCUE_TICKS - 2);
      // KO, or free but on the floor from a baton: either way no control.
      w.get("a").status = hit.status;
      w.get("a").canAct = false;
      w.tick();
      expect(r.progress).toBe(0);
      // Back up a moment later and still holding: starts over from zero.
      w.get("a").status = S.Free;
      w.get("a").canAct = true;
      w.ticks(RESCUE_TICKS - 1);
      expect(w.get("b").status).toBe(S.Grabbed);
      w.tick();
      expect(w.get("b").status).toBe(S.Free);
    }
  });

  test("the grabbed teammate disconnecting mid-rescue simply ends it", () => {
    const w = world([person("a", 0, 0), person("b", 1, 0, S.Grabbed)]);
    const r = w.rescuer("a");
    r.holding = true;
    w.ticks(RESCUE_TICKS - 2);
    w.byId.delete("b");
    expect(() => w.ticks(RESCUE_TICKS)).not.toThrow();
    expect(r.targetId).toBeNull();
    expect(r.progress).toBe(0);
    expect(w.freed).toEqual([]);
  });

  test("the teammate arrested (or freed some other way) mid-rescue ends it", () => {
    const w = world([person("a", 0, 0), person("b", 1, 0, S.Grabbed)]);
    const r = w.rescuer("a");
    r.holding = true;
    w.ticks(5);
    w.get("b").status = S.Arrested;
    w.tick();
    expect(r.targetId).toBeNull();
    expect(w.freed).toEqual([]);
  });

  test("the rescuer disconnecting is a no-op", () => {
    const r = createRescuer();
    r.holding = true;
    r.targetId = "b";
    r.progress = 0.5;
    expect(stepRescuer(r, undefined, false, () => undefined, () => [], DT)).toBeNull();
    expect(r.progress).toBe(0);
  });
});

describe("several rescuers", () => {
  test("do not stack: one teammate is freed after RESCUE_TIME, once", () => {
    const w = world([person("a", 0, 0), person("c", 2, 0), person("b", 1, 0, S.Grabbed)]);
    w.rescuer("a").holding = true;
    w.rescuer("c").holding = true;
    w.ticks(RESCUE_TICKS - 1);
    expect(w.get("b").status).toBe(S.Grabbed);
    expect(rescueProgress(w.rescuers.values(), "b")).toBeCloseTo((RESCUE_TICKS - 1) / RESCUE_TICKS);
    w.tick();
    expect(w.get("b").status).toBe(S.Free);
    // Released once, credited to the first in order; the other rescue just ended.
    expect(w.freed).toEqual([["b", "a"]]);
    expect(w.rescuer("c").targetId).toBeNull();
    expect(w.rescuer("c").progress).toBe(0);
  });

  test("the one who started first finishes first", () => {
    const w = world([person("a", 0, 0), person("c", 2, 0), person("b", 1, 0, S.Grabbed)]);
    w.rescuer("c").holding = true;
    w.ticks(10);
    w.rescuer("a").holding = true;
    w.ticks(RESCUE_TICKS - 10);
    expect(w.freed).toEqual([["b", "c"]]);
  });

  test("two grabbed teammates, two rescuers: each frees their nearest", () => {
    const w = world([person("a", 0, 0), person("c", 10, 0), person("g1", 1, 0, S.Grabbed), person("g2", 11, 0, S.Grabbed)]);
    w.rescuer("a").holding = true;
    w.rescuer("c").holding = true;
    w.ticks(RESCUE_TICKS);
    expect(w.freed).toEqual([
      ["g1", "a"],
      ["g2", "c"],
    ]);
  });
});

describe("same tick as the arrest", () => {
  // The room's rule: rescues run before the health timers in each tick.
  const GRAB_TIME = 3;

  /** A grabbed health, and the tick on which its drag ends (the arrest tick). */
  function setup() {
    const health = grab(createHealth(), 0, GRAB_TIME);
    let arrestTick = -1;
    for (let i = 1; arrestTick < 0; i++) if (tickHealth(health, i * DT).event === "arrested") arrestTick = i;
    return { health, arrestTick };
  }

  /** Run ticks 1..arrestTick with the rescue finishing exactly on the arrest tick, in the given order. */
  function race(rescuesFirst: boolean) {
    const { health: start, arrestTick } = setup();
    let health: Health = start;
    const w = world([person("a", 0, 0), person("b", 1, 0, S.Grabbed)]);
    const startHolding = arrestTick - RESCUE_TICKS + 1;
    let rescuedOn = -1;
    for (let i = 1; i <= arrestTick; i++) {
      const now = i * DT;
      if (i === startHolding) w.rescuer("a").holding = true;
      // Keep the fake room's status in step with the health.
      w.get("b").status = health.status;
      const rescues = () => {
        if (w.tick().length > 0) {
          rescuedOn = i;
          health = rescue(health, now);
        }
      };
      const timers = () => {
        health = tickHealth(health, now).health;
        w.get("b").status = health.status;
      };
      if (rescuesFirst) {
        rescues();
        timers();
      } else {
        timers();
        rescues();
      }
    }
    return { health, rescuedOn, arrestTick };
  }

  test("a rescue finishing on the arrest tick wins when rescues run first (the room's order)", () => {
    const { health, rescuedOn, arrestTick } = race(true);
    expect(rescuedOn).toBe(arrestTick);
    expect(health.status).toBe(S.Free);
  });

  test("the other order would arrest them: why the room runs rescues first", () => {
    const { health, rescuedOn } = race(false);
    expect(rescuedOn).toBe(-1);
    expect(health.status).toBe(S.Arrested);
  });

  test("a rescue one tick after the arrest is too late", () => {
    const { health: start, arrestTick } = setup();
    const arrested = tickHealth(start, arrestTick * DT).health;
    expect(arrested.status).toBe(S.Arrested);
    expect(rescue(arrested, (arrestTick + 1) * DT)).toBe(arrested);
  });
});
