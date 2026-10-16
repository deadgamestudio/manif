import { describe, expect, test } from "bun:test";
import { Archetype, archetypeStats } from "../archetype/index.js";
import { BOT } from "../bot/index.js";
import { cameoRoundChance } from "../cameo/index.js";
import { inCrsRally, pickTarget, type ProtesterView } from "../crs/index.js";
import { PlayerStatus } from "../health/index.js";
import { STREET_LEVEL as L, progressAt } from "../level/index.js";
import { MOLUCHAN } from "../moluchan/index.js";
import { ROUND_DURATION } from "../round/index.js";
import { LEZ, LEZ_LINES, LeZPhase, leZAuraOn, leZLineText, leZPost, leZProfiling, leZProfilingOn, leZRally, pickLeZLine } from "./index.js";

describe("when he comes (#132)", () => {
  test("10% a minute of march, once a round, a 30 s visit", () => {
    expect(LEZ.chance).toBeCloseTo(0.1, 5);
    expect(LEZ.duration).toBe(30);
    expect(cameoRoundChance(LEZ.chance, ROUND_DURATION, LEZ.duration)).toBeCloseTo(0.57, 2);
  });
});

describe("his ring fires the CRS up (Moluchan's mirror)", () => {
  test("the same radius and the same kind of factors as Moluchan's", () => {
    expect(LEZ.auraRadius).toBe(MOLUCHAN.auraRadius);
    expect(LEZ.speedFactor).toBe(1.15);
    expect(LEZ.grabFactor).toBe(MOLUCHAN.struggleFactor);
  });

  test("a CRS inside (edge included) is in it, one outside is not", () => {
    const r = leZRally({ x: 10, z: 5 });
    expect(r).toEqual({ x: 10, z: 5, radius: 6, speedFactor: 1.15, grabFactor: 1.5 });
    expect(inCrsRally(r, { x: 10, z: 11 })).toBe(true);
    expect(inCrsRally(r, { x: 14, z: 9 })).toBe(true);
    expect(inCrsRally(r, { x: 10, z: 11.01 })).toBe(false);
    expect(inCrsRally(null, { x: 10, z: 5 })).toBe(false);
  });

  test("the ring writes into the object it is given (no allocation each tick)", () => {
    const out = { x: 0, z: 0, radius: 0, speedFactor: 1, grabFactor: 1 };
    expect(leZRally({ x: 1, z: 2 }, out)).toBe(out);
  });

  test("on only while he holds forth", () => {
    expect(leZAuraOn(LeZPhase.Holding)).toBe(true);
    expect(leZAuraOn(LeZPhase.Leaving)).toBe(false);
    expect(leZAuraOn(LeZPhase.Chased)).toBe(false);
    expect(leZAuraOn(null)).toBe(false);
  });
});

describe("profiling: the CRS go for the mecs de cité first", () => {
  test("×3 for a Mec de cité while he is here, 1 for everyone else and when he isn't", () => {
    expect(leZProfiling(Archetype.Cite, true)).toBe(3);
    expect(leZProfiling(Archetype.Cite, false)).toBe(1);
    for (const a of [Archetype.Lambda, Archetype.Bobo, Archetype.GiletJaune, Archetype.BlackBloc]) expect(leZProfiling(a, true)).toBe(1);
  });

  test("on while he holds forth or walks off, off once chased or gone", () => {
    expect(leZProfilingOn(LeZPhase.Holding)).toBe(true);
    expect(leZProfilingOn(LeZPhase.Leaving)).toBe(true);
    expect(leZProfilingOn(LeZPhase.Chased)).toBe(false);
    expect(leZProfilingOn(null)).toBe(false);
  });

  /** A protester as the room builds it: archetype weight × bot weight × Le Z's factor. */
  const view = (id: string, x: number, archetype: Archetype, bot: boolean, here: boolean): ProtesterView => ({
    id,
    x,
    z: 0,
    status: PlayerStatus.Free,
    down: false,
    priority: archetypeStats(archetype).targetWeight * (bot ? BOT.targetWeight : 1) * leZProfiling(archetype, here),
  });

  test("through the CRS targeting: a mec de cité twice as far is picked only while he is here", () => {
    const people = (here: boolean) => [view("lambda", 5, Archetype.Lambda, false, here), view("cite", 10, Archetype.Cite, false, here)];
    expect(pickTarget({ x: 0, z: 0 }, people(false), 30, null, 0)).toBe("lambda");
    expect(pickTarget({ x: 0, z: 0 }, people(true), 30, null, 0)).toBe("cite");
  });

  test("a bot mec de cité too, its bot weight and the profiling multiplied", () => {
    const people = (here: boolean) => [view("lambda", 5, Archetype.Lambda, false, here), view("bot-cite", 10, Archetype.Cite, true, here)];
    expect(pickTarget({ x: 0, z: 0 }, people(false), 30, null, 0)).toBe("lambda");
    // 10 / (1 × 0.7 × 3) ≈ 4.8 < 5.
    expect(pickTarget({ x: 0, z: 0 }, people(true), 30, null, 0)).toBe("bot-cite");
  });

  test("it stacks on the archetype's weight: the black bloc (×1.4) still beats a mec de cité at 3/1.4 his distance", () => {
    const bloc = view("bloc", 5, Archetype.BlackBloc, false, true);
    expect(bloc.priority).toBeCloseTo(1.4, 5);
    // Cité at 10.6: 10.6 / 3 ≈ 3.53 < 5 / 1.4 ≈ 3.57: he wins; at 10.8 (3.6) the bloc does.
    expect(pickTarget({ x: 0, z: 0 }, [bloc, view("cite", 10.6, Archetype.Cite, false, true)], 30, null, 0)).toBe("cite");
    expect(pickTarget({ x: 0, z: 0 }, [bloc, view("cite", 10.8, Archetype.Cite, false, true)], 30, null, 0)).toBe("bloc");
  });

  test("never past the CRS's sight: the real distance decides that", () => {
    expect(pickTarget({ x: 0, z: 0 }, [view("cite", 31, Archetype.Cite, false, true)], 30, null, 0)).toBeNull();
  });
});

describe("where he stands", () => {
  test("behind the CRS near the front, down the street from the cortège", () => {
    const front = 0.3;
    const { from, to } = L.progress;
    const at = (t: number, side = 0) => ({ x: from.x + (to.x - from.x) * t + side, z: from.z + (to.z - from.z) * t });
    const crs = [at(front + 0.03, -2), at(front + 0.03, 2), at(0.9)];
    const post = leZPost(L, crs, front);
    const crsT = progressAt(L, at(front + 0.03).x, at(front + 0.03).z);
    expect(progressAt(L, post.x, post.z)).toBeGreaterThan(crsT);
    expect(progressAt(L, post.x, post.z)).toBeLessThan(front + 0.1);
  });

  test("with no CRS near the front, a little ahead of it on the axis", () => {
    const post = leZPost(L, [], 0.4);
    expect(progressAt(L, post.x, post.z)).toBeCloseTo(0.4 + LEZ.aheadOfFront, 2);
  });

  test("never on the cortège's side of the front", () => {
    const { from, to } = L.progress;
    const behind = { x: from.x + (to.x - from.x) * 0.29, z: from.z + (to.z - from.z) * 0.29 };
    const post = leZPost(L, [behind], 0.3);
    expect(progressAt(L, post.x, post.z)).toBeGreaterThanOrEqual(0.3 - 1e-6);
  });
});

describe("his lines", () => {
  test("made up, short, one of each kind at least", () => {
    for (const kind of ["arrive", "talk", "tomato", "hit", "chased", "leave"] as const) expect(LEZ_LINES.some((l) => l.kind === kind)).toBe(true);
    for (const l of LEZ_LINES) expect(l.text.length).toBeLessThan(45);
    expect(LEZ_LINES.length).toBeLessThan(128);
  });

  test("the ones agreed for each moment", () => {
    expect(leZLineText(pickLeZLine("arrive", -1))).toBe("Je suis historien, moi !");
    expect(leZLineText(pickLeZLine("tomato", -1))).toBe("Ma chemise de plateau !");
    expect(leZLineText(pickLeZLine("hit", -1))).toBe("Vous n'avez pas lu mon livre !");
    expect(leZLineText(pickLeZLine("chased", -1))).toBe("Je retourne sur mon plateau.");
    expect(leZLineText(pickLeZLine("leave", -1))).toBe("Bon, j'ai une émission.");
    const talk = LEZ_LINES.filter((l) => l.kind === "talk").map((l) => l.text);
    expect(talk).toEqual(["Ça, c'était mieux avant.", "Mon prochain livre sort mardi.", "On ne peut plus rien dire !", "Je suis interrompu, c'est la censure !"]);
  });

  test("an ordinary line avoids the last one; out of range reads empty", () => {
    const first = pickLeZLine("talk", -1, () => 0);
    expect(pickLeZLine("talk", first, () => 0)).not.toBe(first);
    expect(pickLeZLine("tomato", 5)).toBe(5);
    expect(leZLineText(-1)).toBe("");
    expect(leZLineText(99)).toBe("");
  });
});
