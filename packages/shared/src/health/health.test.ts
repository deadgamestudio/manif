import { describe, expect, test } from "bun:test";
import { GRAB_DURATION, GRAB_IMMUNITY, KO_DURATION, MAX_HP, RESCUE_MIN_HP, RESPAWN_DELAY, RESPAWN_INVULNERABILITY } from "./constants.js";
import {
  PlayerStatus,
  canAct,
  canMove,
  canTransition,
  createHealth,
  damage,
  grab,
  rescue,
  respawn,
  secondsLeft,
  tickHealth,
  heal,
  type Health,
} from "./health.js";

const S = PlayerStatus;
const ALL = [S.Free, S.Grabbed, S.Ko, S.Arrested] as const;

/** A fake room clock: tick it forward and read `now`. */
function fakeClock(start = 0) {
  let now = start;
  return {
    get now() {
      return now;
    },
    advance(dt: number) {
      now += dt;
      return now;
    },
  };
}

/** Run tickHealth at 30 Hz from `from` to `to`, returning the final health and every event seen. */
function run(h: Health, from: number, to: number) {
  const events: { at: number; event: string }[] = [];
  let health = h;
  // Integer ticks, so float drift never skips the last one.
  for (let i = Math.round(from * 30); i <= Math.round(to * 30); i++) {
    const now = i / 30;
    const res = tickHealth(health, now);
    health = res.health;
    if (res.event) events.push({ at: now, event: res.event });
  }
  return { health, events };
}

function ko(now = 0): Health {
  return damage(createHealth(), MAX_HP, now);
}

describe("transition table", () => {
  test("allows exactly the documented transitions", () => {
    const allowed = new Set(["0>1", "0>2", "1>0", "1>3", "2>3", "3>0"]);
    for (const from of ALL) {
      for (const to of ALL) {
        expect(canTransition(from, to)).toBe(allowed.has(`${from}>${to}`));
      }
    }
  });
});

describe("createHealth", () => {
  test("starts free at full HP", () => {
    const h = createHealth();
    expect(h.hp).toBe(MAX_HP);
    expect(h.status).toBe(S.Free);
    expect(canMove(h)).toBe(true);
    expect(canAct(h)).toBe(true);
  });
});

describe("damage", () => {
  test("lowers HP and stays free above 0", () => {
    const h = damage(createHealth(), 30, 0);
    expect(h.hp).toBe(70);
    expect(h.status).toBe(S.Free);
  });

  test("clamps at 0 and goes KO with a KO timer", () => {
    const h = damage(createHealth(), 250, 5);
    expect(h.hp).toBe(0);
    expect(h.status).toBe(S.Ko);
    expect(h.until).toBeCloseTo(5 + KO_DURATION);
  });

  test("exactly reaching 0 goes KO", () => {
    expect(damage(damage(createHealth(), 60, 0), 40, 0).status).toBe(S.Ko);
  });

  test("ignores zero, negative and non-finite amounts", () => {
    const h = createHealth();
    expect(damage(h, 0, 0)).toBe(h);
    expect(damage(h, -10, 0)).toBe(h);
    expect(damage(h, Number.NaN, 0)).toBe(h);
    expect(damage(h, Number.POSITIVE_INFINITY, 0)).toBe(h);
  });

  test("does not mutate its input", () => {
    const h = createHealth();
    damage(h, 50, 0);
    expect(h.hp).toBe(MAX_HP);
  });

  test("while KO does nothing and keeps the KO timer", () => {
    const h = ko(0);
    const after = damage(h, 10, 0.5);
    expect(after).toBe(h);
    expect(after.until).toBeCloseTo(KO_DURATION);
  });

  test("while arrested does nothing and keeps the respawn timer", () => {
    const arrested = tickHealth(ko(0), KO_DURATION).health;
    expect(arrested.status).toBe(S.Arrested);
    const after = damage(arrested, 10, KO_DURATION + 1);
    expect(after).toBe(arrested);
  });

  test("while grabbed lowers HP but stays grabbed, even at 0", () => {
    const g = grab(createHealth(), 0);
    const hurt = damage(g, 500, 1);
    expect(hurt.hp).toBe(0);
    expect(hurt.status).toBe(S.Grabbed);
    expect(hurt.until).toBe(g.until);
    // The drag still ends in an arrest at the same time.
    expect(tickHealth(hurt, g.until).health.status).toBe(S.Arrested);
  });

  test("is ignored during respawn invulnerability, then applies again", () => {
    const h = respawn(10);
    expect(damage(h, 50, 10 + RESPAWN_INVULNERABILITY - 0.01)).toBe(h);
    expect(damage(h, 50, 10 + RESPAWN_INVULNERABILITY).hp).toBe(MAX_HP - 50);
  });
});

describe("grab and rescue", () => {
  test("free -> grabbed with a drag timer", () => {
    const h = grab(createHealth(), 2);
    expect(h.status).toBe(S.Grabbed);
    expect(h.until).toBeCloseTo(2 + GRAB_DURATION);
    expect(canMove(h)).toBe(false);
    expect(canAct(h)).toBe(false);
    expect(grab(createHealth(), 0, 7).until).toBe(7);
  });

  test("grabbed -> free on rescue, keeping HP", () => {
    const h = rescue(damage(grab(createHealth(), 0), 30, 0), 0);
    expect(h.status).toBe(S.Free);
    expect(h.hp).toBe(70);
  });

  test("a rescue at 0 HP gives back the minimum HP", () => {
    const h = rescue(damage(grab(createHealth(), 0), 500, 0), 0);
    expect(h.status).toBe(S.Free);
    expect(h.hp).toBe(RESCUE_MIN_HP);
  });

  test("grabbed -> arrested when the drag ends", () => {
    const { health, events } = run(grab(createHealth(), 0), 0, GRAB_DURATION);
    expect(health.status).toBe(S.Arrested);
    expect(events).toHaveLength(1);
    expect(events[0]?.at).toBeCloseTo(GRAB_DURATION, 5);
  });

  test("refuses grabbing a grabbed, KO or arrested protester", () => {
    const g = grab(createHealth(), 0);
    expect(grab(g, 1)).toBe(g);
    const k = ko(0);
    expect(grab(k, 0.5)).toBe(k);
    const a = tickHealth(k, KO_DURATION).health;
    expect(grab(a, KO_DURATION + 1)).toBe(a);
  });

  test("a rescued protester cannot be grabbed again during GRAB_IMMUNITY, but can be hurt", () => {
    const freed = rescue(grab(createHealth(), 0), 2);
    expect(freed.status).toBe(S.Free);
    expect(grab(freed, 2)).toBe(freed);
    expect(grab(freed, 2 + GRAB_IMMUNITY - 0.01)).toBe(freed);
    expect(damage(freed, 10, 2.1).hp).toBe(MAX_HP - 10);
    expect(grab(freed, 2 + GRAB_IMMUNITY).status).toBe(S.Grabbed);
  });

  test("a respawn clears any leftover grab immunity", () => {
    const freed = rescue(grab(createHealth(), 0), 0);
    expect(respawn(0.5).grabImmuneUntil).toBe(0);
    expect(freed.grabImmuneUntil).toBeCloseTo(GRAB_IMMUNITY);
  });

  test("refuses a grab during respawn invulnerability", () => {
    const h = respawn(0);
    expect(grab(h, 1)).toBe(h);
    expect(grab(h, RESPAWN_INVULNERABILITY).status).toBe(S.Grabbed);
  });

  test("refuses rescuing anyone who is not grabbed", () => {
    const free = createHealth();
    expect(rescue(free, 0)).toBe(free);
    const k = ko(0);
    expect(rescue(k, 0.5)).toBe(k);
    const a = tickHealth(k, KO_DURATION).health;
    expect(rescue(a, KO_DURATION + 1)).toBe(a);
  });
});

describe("KO, arrest and respawn timing (fake clock)", () => {
  test("ko -> arrested after KO_DURATION -> free after RESPAWN_DELAY", () => {
    const clock = fakeClock(100);
    let h = ko(clock.now);
    expect(canMove(h)).toBe(false);

    expect(tickHealth(h, clock.advance(KO_DURATION - 0.1)).event).toBeNull();
    let res = tickHealth(h, clock.advance(0.1));
    expect(res.event).toBe("arrested");
    h = res.health;
    expect(h.status).toBe(S.Arrested);
    expect(h.until).toBeCloseTo(clock.now + RESPAWN_DELAY);
    expect(canMove(h)).toBe(false);

    expect(tickHealth(h, clock.advance(RESPAWN_DELAY - 0.1)).event).toBeNull();
    res = tickHealth(h, clock.advance(0.1));
    expect(res.event).toBe("respawned");
    h = res.health;
    expect(h.status).toBe(S.Free);
    expect(h.hp).toBe(MAX_HP);
    expect(h.invulnerableUntil).toBeCloseTo(clock.now + RESPAWN_INVULNERABILITY);
  });

  test("the whole cycle at 30 Hz fires each event once, at the right time", () => {
    const { health, events } = run(ko(0), 0, KO_DURATION + RESPAWN_DELAY + 1);
    expect(health.status).toBe(S.Free);
    expect(events.map((e) => e.event)).toEqual(["arrested", "respawned"]);
    expect(events[0]?.at).toBeCloseTo(KO_DURATION, 5);
    expect(events[1]?.at).toBeCloseTo(KO_DURATION + RESPAWN_DELAY, 1);
  });

  test("hits during KO and arrest do not move the arrest or respawn time", () => {
    let h = ko(0);
    let arrestAt = -1;
    let respawnAt = -1;
    for (let i = 0; i <= (KO_DURATION + RESPAWN_DELAY) * 30 + 1; i++) {
      const now = i / 30;
      h = damage(h, 25, now);
      const res = tickHealth(h, now);
      h = res.health;
      if (res.event === "arrested") arrestAt = now;
      if (res.event === "respawned") {
        respawnAt = now;
        break;
      }
    }
    expect(arrestAt).toBeCloseTo(KO_DURATION, 5);
    expect(respawnAt).toBeCloseTo(KO_DURATION + RESPAWN_DELAY, 1);
  });

  test("free protesters never change on tick", () => {
    const h = damage(createHealth(), 20, 0);
    const res = tickHealth(h, 1000);
    expect(res.health).toBe(h);
    expect(res.event).toBeNull();
  });
});

describe("secondsLeft", () => {
  test("counts down whole seconds, 0 while free", () => {
    expect(secondsLeft(createHealth(), 5)).toBe(0);
    const a = tickHealth(ko(0), KO_DURATION).health;
    expect(secondsLeft(a, KO_DURATION)).toBe(RESPAWN_DELAY);
    expect(secondsLeft(a, KO_DURATION + 2.5)).toBe(RESPAWN_DELAY - 2);
    expect(secondsLeft(a, KO_DURATION + RESPAWN_DELAY + 5)).toBe(0);
  });
});

describe("an archetype's max HP (#14)", () => {
  test("a fresh protester starts at its archetype's max HP", () => {
    expect(createHealth(130)).toMatchObject({ hp: 130, maxHp: 130 });
    expect(createHealth()).toMatchObject({ hp: MAX_HP, maxHp: MAX_HP });
  });

  test("and comes back from the van with it", () => {
    let h = createHealth(75);
    h = damage(h, 100, 0);
    for (let t = 0; t < 30 && h.status !== PlayerStatus.Free; t += 0.5) h = tickHealth(h, t).health;
    for (let t = 30; h.status !== PlayerStatus.Free; t += 0.5) h = tickHealth(h, t).health;
    expect(h).toMatchObject({ hp: 75, maxHp: 75 });
    expect(respawn(0, 130).hp).toBe(130);
  });

  test("a max HP outside the uint8 is clamped", () => {
    expect(createHealth(999).hp).toBe(255);
    expect(createHealth(0).hp).toBe(1);
    expect(createHealth(Number.NaN).hp).toBe(MAX_HP);
  });
});

describe("heal (#14, the CGT's aura)", () => {
  test("gives HP back up to the max", () => {
    const h = damage(createHealth(100), 10, 0);
    expect(heal(h, 4).hp).toBe(94);
    expect(heal(h, 50).hp).toBe(100);
  });

  test("nothing at full HP, for a bad amount, or when not free", () => {
    const full = createHealth();
    expect(heal(full, 5)).toBe(full);
    const hurt = damage(createHealth(), 10, 0);
    expect(heal(hurt, 0)).toBe(hurt);
    expect(heal(hurt, Number.NaN)).toBe(hurt);
    const grabbed = grab(hurt, 0);
    expect(heal(grabbed, 5)).toBe(grabbed);
  });
});
