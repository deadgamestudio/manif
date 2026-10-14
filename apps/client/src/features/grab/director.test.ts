import { beforeEach, describe, expect, test } from "bun:test";
import { GrabDirector, type DirectorDeps, type PairAnimator } from "./director.ts";

interface Body {
  name: string;
}

class FakeAnimator implements PairAnimator {
  disposed = false;
  play() {
    return true;
  }
  playOnce() {
    return true;
  }
  setTimeScale() {}
  update() {}
  dispose() {
    this.disposed = true;
  }
}

let owners: Map<string, string>;
let crsBodies: Map<string, Body>;
let victimBodies: Map<string, Body>;
let animators: FakeAnimator[];
let clipsIn: boolean;
let director: GrabDirector<Body>;
let lying: Set<string>;
let dressed: Set<string>;

beforeEach(() => {
  owners = new Map();
  crsBodies = new Map([["c1", { name: "c1" }], ["c2", { name: "c2" }]]);
  victimBodies = new Map([["p1", { name: "p1" }], ["p2", { name: "p2" }]]);
  animators = [];
  clipsIn = true;
  lying = new Set();
  dressed = new Set();
  const deps: DirectorDeps<Body> = {
    crsBody: (id) => crsBodies.get(id) ?? null,
    victimBody: (id) => victimBodies.get(id) ?? null,
    setPoseOwner: (id, owner) => (owner === null ? owners.delete(id) : owners.set(id, owner)),
    animator: () => {
      if (!clipsIn) return null;
      const a = new FakeAnimator();
      animators.push(a);
      return a;
    },
    wasLying: (id) => lying.has(id),
    dress: (body, held) => (held ? dressed.add(body.name) : dressed.delete(body.name)),
  };
  director = new GrabDirector(deps);
});

const P1 = new Map([["p1", "c1"]]);
const NONE = new Map<string, string>();

describe("GrabDirector", () => {
  test("a match takes both poses", () => {
    director.sync(P1);
    expect(owners.get("p1")).toBe("grab:c1");
    expect(owners.get("c1")).toBe("grab:c1");
    expect(director.pairs.size).toBe(1);
  });

  test("released (the match goes): both poses given back at once, animators freed", () => {
    director.sync(P1);
    director.sync(NONE);
    expect(owners.size).toBe(0);
    expect(director.pairs.size).toBe(0);
    expect(animators.every((a) => a.disposed)).toBe(true);
    expect(dressed.size).toBe(0);
  });

  test("the bot gone (left the state, its model unmounted): poses given back", () => {
    director.sync(P1);
    crsBodies.delete("c1");
    director.sync(P1);
    expect(owners.size).toBe(0);
  });

  test("a body swapped (splatted CRS, archetype change): the pair restarts on the new body", () => {
    director.sync(P1);
    const first = director.pairs.get("p1");
    victimBodies.set("p1", { name: "p1-new" });
    director.sync(P1);
    expect(director.pairs.get("p1")).not.toBe(first);
    expect(director.pairs.get("p1")?.victimBody.name).toBe("p1-new");
    expect(owners.get("p1")).toBe("grab:c1");
  });

  test("handed to another bot: the old bot's pose is given back", () => {
    director.sync(P1);
    director.sync(new Map([["p1", "c2"]]));
    expect(owners.has("c1")).toBe(false);
    expect(owners.get("c2")).toBe("grab:c2");
    expect(owners.get("p1")).toBe("grab:c2");
  });

  test("unmount, disconnect or round over (clear): nothing stays owned", () => {
    director.sync(new Map([["p1", "c1"], ["p2", "c2"]]));
    expect(owners.size).toBe(4);
    director.clear();
    expect(owners.size).toBe(0);
    expect(director.pairs.size).toBe(0);
  });

  test("a placeholder on either side, or clips still loading: no pair, nobody owned", () => {
    victimBodies.delete("p1");
    director.sync(P1);
    expect(owners.size).toBe(0);
    victimBodies.set("p1", { name: "p1" });
    clipsIn = false;
    director.sync(P1);
    expect(owners.size).toBe(0);
    clipsIn = true;
    director.sync(P1);
    expect(owners.size).toBe(2);
  });

  test("the CRS is dressed for the pair, and undressed when it ends", () => {
    director.sync(P1);
    expect(dressed.has("c1")).toBe(true);
    director.sync(NONE);
    expect(dressed.size).toBe(0);
  });

  test("a protester grabbed lying down starts on the ground", () => {
    lying.add("p1");
    director.sync(P1);
    expect(director.pairs.get("p1")?.phase.phase).toBe("groundGrab");
    director.sync(new Map([["p1", "c1"], ["p2", "c2"]]));
    expect(director.pairs.get("p2")?.phase.phase).toBe("seize");
  });

  test("partners lists the live pairs for the matching tie-break", () => {
    director.sync(P1);
    expect(director.partners(new Map())).toEqual(P1);
  });
});
