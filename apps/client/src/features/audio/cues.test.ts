import { describe, expect, test } from "bun:test";
import { CrsKind, CrsMount, CrsStatus, Phase, PlayerStatus, RoundResult, SHOP_KINDS, ThrowableKind } from "@manif/shared";
import { ambienceLevels, diffCues, messageCues, type CrsView, type MessageMemory, type PlayerView, type PropTable, type WorldView } from "./cues.ts";

const props: PropTable = new Map([
  ["bin-1", { kind: "bin", x: 5, z: 5 }],
  ["window-1", { kind: "shop_window", x: 8, z: 2 }],
  ["car-1", { kind: "car", x: 2, z: 9 }],
]);

const player = (patch: Partial<PlayerView> = {}): PlayerView => ({
  x: 0,
  z: 0,
  status: PlayerStatus.Free,
  airborne: false,
  dodging: false,
  carrying: ThrowableKind.None,
  gassed: false,
  onFire: false,
  ...patch,
});

const crs = (patch: Partial<CrsView> = {}): CrsView => ({
  x: 3,
  z: 0,
  kind: CrsKind.Crs,
  status: CrsStatus.Active,
  mount: CrsMount.Foot,
  revealed: true,
  onFire: false,
  spraying: false,
  windup: false,
  ...patch,
});

function world(patch: Partial<WorldView> = {}): WorldView {
  return {
    phase: Phase.Marching,
    timeLeft: 300,
    players: new Map([["me", player()]]),
    crs: new Map(),
    broken: new Set(),
    projectiles: new Map(),
    canisters: new Map(),
    gas: new Map(),
    fires: new Map(),
    ...patch,
  };
}

const sounds = (cues: { sound: string }[]) => cues.map((c) => c.sound).sort();

describe("diffCues", () => {
  test("joining (or reconnecting) mid-round: whatever is already there makes no sound", () => {
    const busy = world({
      fires: new Map([["bin-1", { x: 5, z: 5 }]]),
      gas: new Map([["g1", { x: 1, z: 1 }]]),
      canisters: new Map([["c1", { x: 2, z: 2 }]]),
      projectiles: new Map([["p1", { x: 1, z: 1, kind: ThrowableKind.Pave }]]),
      broken: new Set(["window-1", "car-1"]),
      crs: new Map([["bike", crs({ mount: CrsMount.Duo })]]),
      players: new Map([["me", player({ gassed: true, status: PlayerStatus.Grabbed })]]),
    });
    expect(diffCues(null, busy, "me", props)).toEqual([]);
    // And the next tick, with nothing new, is silent too.
    expect(diffCues(busy, busy, "me", props)).toEqual([]);
  });

  test("a new round starts with the whistle and a cheer, and nothing for the fresh street", () => {
    const lobby = world({ phase: Phase.Waiting });
    const march = world({
      crs: new Map([["bike", crs({ mount: CrsMount.Duo })]]),
      projectiles: new Map(),
      fires: new Map([["bin-1", { x: 5, z: 5 }]]),
    });
    expect(sounds(diffCues(lobby, march, "me", props))).toEqual(["cheer", "whistle-long"]);
  });

  test("outside the march, state changes make no sound", () => {
    const before = world({ phase: Phase.Ended });
    const after = world({ phase: Phase.Ended, fires: new Map([["bin-1", { x: 5, z: 5 }]]) });
    expect(diffCues(before, after, "me", props)).toEqual([]);
  });

  test("things that happen while we watch", () => {
    const before = world({
      projectiles: new Map([["p1", { x: 4, z: 4, kind: ThrowableKind.Tomate }]]),
      canisters: new Map([["c1", { x: 9, z: 9 }]]),
    });
    const after = world({
      broken: new Set(["window-1", "bin-1"]),
      projectiles: new Map([["p2", { x: 1, z: 1, kind: ThrowableKind.Pave }]]),
      canisters: new Map([["c2", { x: 3, z: 3 }]]),
      gas: new Map([["c1", { x: 6, z: 6 }]]),
      fires: new Map([["car-1", { x: 2, z: 9 }]]),
    });
    const cues = diffCues(before, after, "me", props);
    expect(sounds(cues)).toEqual(["bin", "glass", "hiss", "ignite", "launch", "splat", "throw"]);
    // Placed where it happened: the tomato splats where it was last seen.
    expect(cues.find((c) => c.sound === "splat")?.at).toEqual({ x: 4, z: 4 });
    expect(cues.find((c) => c.sound === "glass")?.at).toEqual({ x: 8, z: 2 });
  });

  test("what happens to the players", () => {
    const before = world({
      players: new Map([
        ["me", player()],
        ["a", player({ x: 2 })],
        ["b", player({ status: PlayerStatus.Grabbed })],
        ["c", player({ status: PlayerStatus.Grabbed })],
      ]),
    });
    const after = world({
      players: new Map([
        ["me", player({ airborne: true, gassed: true })],
        ["a", player({ x: 2, status: PlayerStatus.Grabbed, dodging: false, carrying: ThrowableKind.None })],
        ["b", player({ status: PlayerStatus.Free, carrying: ThrowableKind.Pave })],
        ["c", player({ status: PlayerStatus.Arrested })],
      ]),
    });
    expect(sounds(diffCues(before, after, "me", props))).toEqual(["cough", "cuffs", "hop", "pickup", "rescue", "van-door"]);
  });

  test("someone else in the gas doesn't make us cough", () => {
    const before = world({ players: new Map([["me", player()], ["a", player()]]) });
    const after = world({ players: new Map([["me", player()], ["a", player({ gassed: true })]]) });
    expect(diffCues(before, after, "me", props)).toEqual([]);
  });

  test("police: a BRAV-M riding in, a BAC giving itself away, a bike crashing", () => {
    const before = world({ crs: new Map([["bac", crs({ kind: CrsKind.Bac, revealed: false })], ["bike", crs({ kind: CrsKind.BravM, mount: CrsMount.Duo })]]) });
    const after = world({
      crs: new Map([
        ["bac", crs({ kind: CrsKind.Bac, revealed: true })],
        ["bike", crs({ kind: CrsKind.BravM, mount: CrsMount.Wreck })],
        ["bike2", crs({ kind: CrsKind.BravM, mount: CrsMount.Duo })],
        ["plain", crs()],
      ]),
    });
    expect(sounds(diffCues(before, after, "me", props))).toEqual(["car", "moped", "whistle"]);
  });

  test("a CRS winding up a grab whistles once, where it stands (#70)", () => {
    const before = world({ crs: new Map([["c", crs()]]) });
    const during = world({ crs: new Map([["c", crs({ windup: true })]]) });
    expect(diffCues(before, during, "me", props)).toEqual([{ sound: "whistle", at: { x: 3, z: 0 }, gain: 0.8 }]);
    expect(diffCues(during, during, "me", props)).toEqual([]);
    expect(diffCues(during, before, "me", props)).toEqual([]);
  });

  test("the van door slams when a dragged protester is arrested at the van, the cuffs on the grab (#70)", () => {
    const free = world({ players: new Map([["a", player()]]) });
    const grabbed = world({ players: new Map([["a", player({ status: PlayerStatus.Grabbed })]]) });
    const arrested = world({ players: new Map([["a", player({ status: PlayerStatus.Arrested })]]) });
    expect(sounds(diffCues(free, grabbed, "me", props))).toEqual(["cuffs"]);
    expect(sounds(diffCues(grabbed, arrested, "me", props))).toEqual(["van-door"]);
    // Struggled free: the rescue blip, no door.
    expect(sounds(diffCues(grabbed, free, "me", props))).toEqual(["rescue"]);
  });

  test("the last ten seconds tick once a second", () => {
    expect(sounds(diffCues(world({ timeLeft: 11 }), world({ timeLeft: 10 }), "me", props))).toEqual(["tick"]);
    expect(diffCues(world({ timeLeft: 12 }), world({ timeLeft: 11 }), "me", props)).toEqual([]);
    expect(diffCues(world({ timeLeft: 1 }), world({ timeLeft: 0 }), "me", props)).toEqual([]);
  });

  test("every shop kind (#68) breaks with a sound: glass for the fronts, metal for the bank's shutters", () => {
    for (const kind of SHOP_KINDS) {
      const table: PropTable = new Map([["shop-1", { kind, x: 1, z: 1 }]]);
      const cues = diffCues(world(), world({ broken: new Set(["shop-1"]) }), "me", table);
      expect(sounds(cues)).toEqual([kind === "banque" ? "metal" : "glass"]);
    }
  });
});

describe("messageCues", () => {
  const fresh = (): MessageMemory => ({ crsSwings: new Map() });
  const view = world({
    players: new Map([["me", player()], ["far", player({ x: 30 })]]),
    crs: new Map([["c1", crs({ x: 1, z: 0 })], ["pomp", crs({ kind: CrsKind.Pompier })]]),
  });

  test("a CRS swing followed by a push on a protester next to it is a baton hit", () => {
    const memory = fresh();
    expect(sounds(messageCues({ type: "swing", id: "c1" }, view, props, 1000, memory))).toEqual(["swing"]);
    expect(sounds(messageCues({ type: "impulse", id: "me" }, view, props, 1050, memory, () => 0))).toEqual(["baton-1"]);
    // Only once per swing.
    expect(messageCues({ type: "impulse", id: "me" }, view, props, 1060, memory)).toEqual([]);
  });

  test("a push with no swing nearby (a hose, a shove, a slip) is not a baton hit", () => {
    const memory = fresh();
    expect(messageCues({ type: "impulse", id: "me" }, view, props, 1000, memory)).toEqual([]);
    messageCues({ type: "swing", id: "c1" }, view, props, 1000, memory);
    expect(messageCues({ type: "impulse", id: "far" }, view, props, 1010, memory)).toEqual([]);
    expect(messageCues({ type: "impulse", id: "me" }, view, props, 2000, memory)).toEqual([]);
  });

  test("hits: a punch on a CRS, a thud on a prop, nothing twice for a break", () => {
    const memory = fresh();
    expect(sounds(messageCues({ type: "hit", kind: "crs", target: "c1", x: 1, z: 0, broke: false }, view, props, 0, memory, () => 0.9))).toEqual(["punch-2"]);
    expect(sounds(messageCues({ type: "hit", kind: "prop", target: "car-1", x: 2, z: 9, broke: false }, view, props, 0, memory))).toEqual(["metal"]);
    expect(messageCues({ type: "hit", kind: "prop", target: "car-1", x: 2, z: 9, broke: true }, view, props, 0, memory)).toEqual([]);
  });

  test("a shield line's shove clangs at each shield", () => {
    expect(sounds(messageCues({ type: "shove", ids: ["c1", "gone"] }, view, props, 0, fresh()))).toEqual(["shield"]);
  });

  test("the round's end: a fanfare for a win, a sad trombone for a loss", () => {
    expect(sounds(messageCues({ type: "roundEnd", result: RoundResult.Won }, view, props, 0, fresh()))).toEqual(["cheer", "fanfare"]);
    expect(sounds(messageCues({ type: "roundEnd", result: RoundResult.LostTime }, null, props, 0, fresh()))).toEqual(["sad-trombone"]);
  });

  test("nothing but the round's end outside the march", () => {
    const lobby = world({ phase: Phase.Waiting });
    expect(messageCues({ type: "swing", id: "me" }, lobby, props, 0, fresh())).toEqual([]);
  });
});

describe("ambienceLevels", () => {
  test("a bed is always there; it fills with protesters close by and tenses with police close by", () => {
    const alone = ambienceLevels(world(), "me");
    expect(alone.crowd).toBeGreaterThan(0);
    expect(alone.tension).toBe(0);
    const crowded = ambienceLevels(
      world({
        players: new Map([["me", player()], ["a", player({ x: 1 })], ["b", player({ x: 2 })], ["c", player({ z: 2 })], ["d", player({ z: 3 })], ["far", player({ x: 50 })]]),
      }),
      "me",
    );
    expect(crowded.crowd).toBe(1);
    const tense = ambienceLevels(
      world({
        crs: new Map([
          ["1", crs()],
          ["2", crs({ z: 2 })],
          ["out", crs({ status: CrsStatus.Out })],
          ["bac", crs({ kind: CrsKind.Bac, revealed: false })],
          ["pomp", crs({ kind: CrsKind.Pompier })],
          ["far", crs({ x: 80 })],
        ]),
      }),
      "me",
    );
    expect(tense.tension).toBeCloseTo(2 / 5, 9);
  });
});
