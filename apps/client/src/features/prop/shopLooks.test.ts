import { describe, expect, test } from "bun:test";
import { Vector3 } from "three";
import { SHOP_KINDS, type ShopLot } from "@manif/shared";
import { mergeBoxes } from "../../shared/boxes/index.ts";
import { BALCONY_DEPTH, EMBLEM_TOP, FrontKit, GENERIC_STYLE, SHOP_STYLES, buildFront, emblem, shopSignText, shopStyle } from "./shopLooks.ts";

const lot = (over: Partial<ShopLot> = {}): ShopLot => ({
  id: "shop-1",
  kind: "cafe",
  side: -1,
  z: 0,
  width: 4,
  face: 10,
  out: 0.5,
  height: 3,
  interior: 3,
  style: 7,
  ...over,
});

describe("shop fronts (#117)", () => {
  test("every kind has its own look, with a sign and debris colours", () => {
    for (const kind of SHOP_KINDS) {
      const s = SHOP_STYLES[kind];
      expect(s.sign.length).toBe(2);
      expect(s.debris.length).toBeGreaterThan(0);
    }
    // No two kinds share front, fascia and sign colours all at once.
    const looks = SHOP_KINDS.map((k) => `${SHOP_STYLES[k].front}|${SHOP_STYLES[k].fascia}|${SHOP_STYLES[k].sign.join()}`);
    expect(new Set(looks).size).toBe(SHOP_KINDS.length);
  });

  test("the new kinds each stand out by an emblem or an awning", () => {
    for (const kind of SHOP_KINDS.slice(6)) expect(!!SHOP_STYLES[kind].emblem || !!SHOP_STYLES[kind].awning, kind).toBe(true);
  });

  test("a kind this build doesn't know gets the generic front and a plain sign", () => {
    const unknown = lot({ unknown: true });
    expect(shopStyle(unknown)).toBe(GENERIC_STYLE);
    expect(shopSignText(unknown)).toBe("Boutique");
    expect(buildFront(unknown, false).solid.pieces.length).toBeGreaterThan(0);
    expect(shopStyle(lot())).toBe(SHOP_STYLES.cafe);
  });

  test("every kind, intact or broken, narrow or wide, builds a few merged layers and nothing behind the facade", () => {
    for (const kind of SHOP_KINDS) {
      for (const over of [{ width: 4, out: -0.5 }, { width: 7.5, out: 1, height: 4.25 }]) {
        for (const broken of [false, true]) {
          const kit = buildFront(lot({ kind, ...over }), broken);
          expect(kit.solid.pieces.length, kind).toBeGreaterThan(0);
          if (!broken) expect(kit.lit.pieces.length, kind).toBeGreaterThan(0);
          for (const layer of [kit.solid, kit.lit, kit.shard]) {
            const g = mergeBoxes(layer.pieces);
            if (!g) continue;
            const pos = g.getAttribute("position");
            const v = new Vector3();
            for (let i = 0; i < pos.count; i++) {
              v.fromBufferAttribute(pos, i);
              // A hair behind the facade at most (a tilted shelf's corner), never into the room.
              expect(v.x, `${kind} ${broken ? "broken" : "intact"}`).toBeGreaterThan(-0.3);
            }
            g.dispose();
          }
        }
      }
    }
  });

  test("emblems hang above head height and under the first-floor balcony, whatever the front's height", () => {
    for (const kind of SHOP_KINDS) {
      const e = SHOP_STYLES[kind].emblem;
      if (!e) continue;
      for (const height of [3, 3.5, 4.25]) {
        for (const broken of [false, true]) {
          const kit = new FrontKit();
          emblem(kit, e, 0.125, 4, height, broken);
          const g = mergeBoxes([...kit.lit.pieces, ...kit.solid.pieces])!;
          const pos = g.getAttribute("position");
          let low = Infinity;
          let high = -Infinity;
          let back = Infinity;
          for (let i = 0; i < pos.count; i++) {
            low = Math.min(low, pos.getY(i));
            // Within the balcony's depth, nothing above EMBLEM_TOP.
            if (pos.getX(i) < BALCONY_DEPTH) high = Math.max(high, pos.getY(i));
            back = Math.min(back, pos.getX(i));
          }
          expect(low, `${kind} ${height}`).toBeGreaterThan(2.2);
          expect(high, `${kind} ${height}`).toBeLessThanOrEqual(EMBLEM_TOP + 0.05);
          expect(back, `${kind} ${height}`).toBeGreaterThan(-0.05);
          g.dispose();
        }
      }
    }
  });
});
