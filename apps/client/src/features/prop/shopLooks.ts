/*
 * LOOKS for the shops (#68, #83, #117): Paris ground-floor storefronts built
 * from plain boxes, sized from each shop's generated `ShopLot`, with Jordan's
 * shop window (#28) in the intact window once it has loaded. Nothing here is
 * per frame: a shop's meshes are built when its round's layout arrives, and
 * again once when it breaks.
 *
 * Draw calls (#117): a street has 16 to 20 shops, so the boxes of a front are
 * not one mesh each. They are collected into a few layers (`FrontKit`) and
 * each layer baked into ONE mesh with its colours per vertex
 * (`shared/boxes`): the solid frame (lit by the sun, casts shadows), the
 * glowing bits (the lit shop inside, neon, emblems: unlit, no shadow) and
 * the broken shards. A front costs those few draws plus its window
 * model and its sign, whatever its kind.
 *
 * Not used on purpose: `facade-shop-2m` has "BOULANGERIE" written on it and a
 * glazed door that would stand in the doorway of a broken shop, and
 * `shop-window-broken` keeps its middle mullion and its sill, right across
 * that doorway. A broken shop keeps the boxes, so the way in reads as open.
 *
 * Local frame of a shop (ShopView sets it): the origin is on the facade at the
 * middle of the shop, +X points out into the street, Z runs along the facade,
 * Y is up. The front stands at `shopFront(lot)`, the same plane the server
 * collides with, so what you see is what you bump into. Nothing is drawn
 * behind the facade (x < 0): the room there (`lot.interior`, #84) and the
 * walls around it are the level's (`features/level`). Intact, the front
 * closes the doorway from the ground to the sign band; broken, nothing but
 * the sign band (the lintel) spans it, so the way in reads as open. Emblems
 * and blade signs (#117) hang over the pavement, above head height: they
 * never collide, like the awnings.
 *
 * Brands: every name and emblem is a parody (#117). No real logo, lettering
 * or trade dress: an arch "M", a green cross, a red carrot are generic street
 * signs, drawn from boxes.
 */
import { BoxGeometry, DoubleSide, Matrix4, MeshBasicMaterial, MeshStandardMaterial } from "three";
import { SHOP_LAYOUT, SHOP_ROOM, shopSign, type ShopKind, type ShopLot } from "@manif/shared";
import { BoxBatch, groupMatrix, type V3 } from "../../shared/boxes/index.ts";

/** A big readable sign over the pavement, for the kinds people spot from afar (#117). */
export type Emblem = "arches" | "drumstick" | "cross" | "carotte" | "phone";

/** What a shop kind looks like, and how its sign is painted. */
export interface ShopStyle {
  /** Pilasters and stall riser. */
  front: string;
  /** The sign band over the window. */
  fascia: string;
  /** Awning stripes (two colours); none for a shop without one. */
  awning?: readonly [string, string];
  /** Narrow awning stripes, like a referee's shirt. */
  thinStripes?: boolean;
  /** What shows through the glass while the lights are on. */
  inside: string;
  /** The sign: background, then lettering. */
  sign: readonly [string, string];
  /** A metal shutter (the bank, the tabac's grille). */
  shutter?: boolean;
  emblem?: Emblem;
  debris: readonly string[];
}

const GLASS_DEBRIS = ["#a5d8ff", "#e3f2fd", "#81d4fa"];

export const SHOP_STYLES: Readonly<Record<ShopKind, ShopStyle>> = {
  boulangerie: {
    front: "#e8d5b0",
    fascia: "#8d5524",
    awning: ["#f3e6c8", "#8d5524"],
    inside: "#f6d58e",
    sign: ["#8d5524", "#fff3d6"],
    debris: [...GLASS_DEBRIS, "#d9a441", "#f3e6c8"],
  },
  cafe: {
    front: "#7b1f1f",
    fascia: "#4e1212",
    awning: ["#c62828", "#f5f5f5"],
    inside: "#e8b46a",
    sign: ["#1b1b1b", "#ffd54f"],
    debris: [...GLASS_DEBRIS, "#c62828", "#eceff1"],
  },
  sneakers: {
    front: "#1c1c1c",
    fascia: "#111111",
    inside: "#cfd8dc",
    sign: ["#111111", "#00e5ff"],
    debris: [...GLASS_DEBRIS, "#ff2bd6", "#00e5ff"],
  },
  banque: {
    front: "#b0b0b0",
    fascia: "#546e7a",
    inside: "#b0bec5",
    sign: ["#263238", "#e0e0e0"],
    shutter: true,
    debris: ["#9e9e9e", "#757575", "#cfd8dc", "#546e7a"],
  },
  kebab: {
    front: "#f9a825",
    fascia: "#c62828",
    awning: ["#2e7d32", "#fff176"],
    inside: "#ffe082",
    sign: ["#c62828", "#fff176"],
    debris: [...GLASS_DEBRIS, "#f9a825", "#2e7d32"],
  },
  toilettage: {
    front: "#f8bbd0",
    fascia: "#ec407a",
    inside: "#fce4ec",
    sign: ["#fce4ec", "#ad1457"],
    debris: [...GLASS_DEBRIS, "#f8bbd0", "#fafafa"],
  },
  // #117. Red and yellow, a big golden double arch on the roof of the front.
  burger: {
    front: "#c8102e",
    fascia: "#a50d26",
    inside: "#ffe9a8",
    sign: ["#c8102e", "#ffcc00"],
    emblem: "arches",
    debris: [...GLASS_DEBRIS, "#ffcc00", "#c8102e"],
  },
  // Fried chicken and tacos: orange and black, a drumstick on a blade sign.
  poulet: {
    front: "#1a1a1a",
    fascia: "#ff6f00",
    awning: ["#ff6f00", "#1a1a1a"],
    inside: "#ffcc80",
    sign: ["#1a1a1a", "#ff9100"],
    emblem: "drumstick",
    debris: [...GLASS_DEBRIS, "#ff6f00", "#ffcc80"],
  },
  // A sports store: a referee's black and white striped awning.
  sport: {
    front: "#2b2b2b",
    fascia: "#111111",
    awning: ["#111111", "#f5f5f5"],
    thinStripes: true,
    inside: "#e3f2fd",
    sign: ["#f5f5f5", "#111111"],
    debris: [...GLASS_DEBRIS, "#111111", "#f5f5f5"],
  },
  // Phone repair: a narrow blue front, a giant phone hanging out with its screen lit.
  telephone: {
    front: "#0d47a1",
    fascia: "#002171",
    inside: "#b3e5fc",
    sign: ["#002171", "#40c4ff"],
    emblem: "phone",
    debris: [...GLASS_DEBRIS, "#40c4ff", "#212121"],
  },
  // White and green, the glowing green cross.
  pharmacie: {
    front: "#f1f8e9",
    fascia: "#2e7d32",
    inside: "#e8f5e9",
    sign: ["#2e7d32", "#ffffff"],
    emblem: "cross",
    debris: [...GLASS_DEBRIS, "#ffffff", "#43a047"],
  },
  // The corner supérette: a green and white awning, fruit crates in the window.
  superette: {
    front: "#00695c",
    fascia: "#004d40",
    awning: ["#2e7d32", "#f5f5f5"],
    inside: "#f1f8e9",
    sign: ["#f5f5f5", "#00695c"],
    debris: [...GLASS_DEBRIS, "#e53935", "#fb8c00", "#7cb342"],
  },
  // Tabac-presse: dark red, a grille, and the red carrot sign.
  tabac: {
    front: "#4e1a1a",
    fascia: "#2b0d0d",
    inside: "#fff3e0",
    sign: ["#b71c1c", "#ffffff"],
    shutter: true,
    emblem: "carotte",
    debris: [...GLASS_DEBRIS, "#b71c1c", "#fafafa"],
  },
};

/**
 * The look of a shop whose kind this build doesn't know (`lot.unknown`, a tab
 * left open across a deploy, #117): a plain grey front, a plain sign.
 */
export const GENERIC_STYLE: ShopStyle = {
  front: "#9e9e9e",
  fascia: "#616161",
  inside: "#eeeeee",
  sign: ["#424242", "#fafafa"],
  debris: [...GLASS_DEBRIS, "#9e9e9e"],
};

/** A shop's look: its kind's, or the generic one for an unknown kind. */
export function shopStyle(lot: ShopLot): ShopStyle {
  return lot.unknown ? GENERIC_STYLE : SHOP_STYLES[lot.kind];
}

/** The name on a shop's sign. */
export function shopSignText(lot: ShopLot): string {
  return lot.unknown ? "Boutique" : shopSign(lot.kind, lot.style);
}

/** One unit box, scaled by the few meshes still drawn one by one. */
export const UNIT_BOX = new BoxGeometry(1, 1, 1);

function mat(color: string, extra: Partial<ConstructorParameters<typeof MeshStandardMaterial>[0]> = {}): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, ...extra });
}

/** Shared by every shop. */
export const COMMON = {
  glass: mat("#a5d8ff", { transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.2 }),
  shard: mat("#cfeaff", { transparent: true, opacity: 0.6, side: DoubleSide }),
  mullion: mat("#2b2b2b"),
  /** Every solid box of every front, coloured per vertex. */
  solid: new MeshStandardMaterial({ vertexColors: true }),
  /** The glowing bits (lit insides, neon, emblems): unlit, coloured per vertex. */
  lit: new MeshBasicMaterial({ vertexColors: true }),
};

/** Colours of the bits every kind shares. */
const C = {
  dark: "#15191c",
  wreck: "#3e2f27",
  mullion: "#2b2b2b",
  metal: "#90a4ae",
  slat: "#607d8b",
  white: "#fafafa",
  bread: "#d9a441",
  meat: "#8d4f2a",
  neonA: "#00e5ff",
  neonB: "#ff2bd6",
  table: "#eceff1",
  bracket: "#263238",
} as const;

/** How far out of the facade the front of a shop is: its collision box's front face. */
export function shopFront(lot: ShopLot): number {
  return Math.max(lot.out, SHOP_LAYOUT.lip);
}

/** Sizes of the pieces of a storefront. */
export const FRAME = {
  /** Width of each pilaster along the facade. */
  pilaster: 0.35,
  /** Height of the stall riser under the window. */
  riser: 0.5,
  /** Height of the sign band over the window. */
  band: 0.75,
} as const;

/** The boxes of one front, by layer, before they are baked. */
export class FrontKit {
  readonly solid = new BoxBatch();
  readonly lit = new BoxBatch();
  readonly shard = new BoxBatch();
}

/** A small deterministic generator from the shop's style seed, for the look's little variations. */
export function styleRandom(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a ^= a << 13;
    a >>>= 0;
    a ^= a >>> 17;
    a ^= a << 5;
    a >>>= 0;
    return a / 4294967296;
  };
}

/**
 * Every box of a front, intact or smashed: pilasters and stall riser, the
 * lit shop behind the glass (or the shutter), the sign band, an awning, the
 * kind's window display and emblem; broken, the glass is gone, a dark wrecked
 * shop shows, with shards left in the frame. Pure: the same lot always gives
 * the same boxes. The glass pane itself is Jordan's window model, drawn apart.
 */
export function buildFront(lot: ShopLot, broken: boolean): FrontKit {
  const kit = new FrontKit();
  const s = shopStyle(lot);
  const rand = styleRandom(lot.style);
  const F = shopFront(lot);
  const W = lot.width;
  const H = lot.height;
  const P = FRAME.pilaster;
  const winW = W - 2 * P;
  const winBottom = FRAME.riser;
  const winTop = H - FRAME.band;
  const winH = winTop - winBottom;
  const winY = (winTop + winBottom) / 2;
  const glassX = Math.max(0.03, F - 0.08);
  const depth = Math.max(0.04, glassX - 0.02);
  const solid = (at: V3, size: V3, color: string, rot?: V3, parent?: Matrix4) => kit.solid.add(at, size, color, rot, parent);

  // Pilasters at both ends, the stall riser and the sign band (the roof of a deep front).
  for (const z of [-(W - P) / 2, (W - P) / 2]) solid([(F + 0.04) / 2, H / 2, z], [F + 0.04, H, P], s.front);
  if (!broken) solid([F / 2, winBottom / 2, 0], [F, winBottom, winW], s.front);
  solid([(F + 0.1) / 2, H - FRAME.band / 2, 0], [F + 0.1, FRAME.band, W], s.fascia);
  // A thin cornice over the band.
  solid([(F + 0.18) / 2, H + 0.04, 0], [F + 0.18, 0.08, W + 0.1], s.front);

  if (!broken) {
    // Lit shop behind the glass.
    kit.lit.add([depth / 2, winY, 0], [depth, winH, winW], s.inside);
    if (s.shutter) {
      // A metal shutter (the bank's, the tabac's grille), pulled part of the way down.
      const down = winH * (lot.kind === "banque" ? 0.55 + rand() * 0.35 : 0.2 + rand() * 0.2);
      solid([glassX + 0.03, winTop - down / 2, 0], [0.05, down, winW], C.metal);
      for (let y = winTop - 0.2; y > winTop - down; y -= 0.22) solid([glassX + 0.06, y, 0], [0.02, 0.05, winW], C.slat);
    }
    display(kit, lot, depth, winW, rand);
  } else {
    // Smashed: the riser and the glass are gone and the doorway (the room's
    // width, `SHOP_ROOM.frame` in from each end) is open into the room behind.
    // Only stubs of the riser stay, in the strip between the doorway and the pilasters.
    const stub = SHOP_ROOM.frame - P;
    for (const side of [-1, 1]) {
      const h = winBottom * (0.4 + rand() * 0.6);
      solid([F / 2, h / 2, side * (winW / 2 - stub / 2)], [F, h, stub], s.front);
    }
    if (depth > 0.1) solid([depth / 2, 0.02, 0], [depth, 0.04, winW], C.dark);
    // A tipped-over shelf and a few things on the floor, out on the pavement.
    solid([F + 0.35, 0.25, -winW * 0.2], [0.5, 0.5, 1.4], C.wreck, [0, 0.4, 1.2]);
    for (let i = 0; i < 4; i++) {
      const z = (rand() - 0.5) * winW;
      solid([F + 0.2 + rand() * 0.8, 0.08, z], [0.25, 0.16, 0.3], i % 2 ? s.inside : C.wreck, [0, rand() * 3, 0]);
    }
    // Shards still hanging from the top of the frame, and more on the ground.
    for (let i = 0; i < 6; i++) {
      const z = -winW / 2 + 0.2 + rand() * (winW - 0.4);
      const h = 0.25 + rand() * 0.45;
      const w = 0.18 + rand() * 0.3;
      if (i % 2 === 0) kit.shard.add([glassX, winTop - h / 2, z], [0.02, h, w], "#ffffff", [rand() - 0.5, 0, 0]);
      else kit.shard.add([F + 0.1 + rand() * 0.6, 0.015, z], [h, 0.02, w], "#ffffff", [0, rand() * 3, 0]);
    }
    if (s.shutter) {
      // The shutter torn half off, hanging crooked from one end of the frame, high over the doorway.
      solid([glassX + 0.15, winTop - 0.3, winW * 0.32], [0.05, 0.55, winW * 0.36], C.metal, [0.35, 0, -0.2]);
    }
  }

  if (s.awning) awning(kit, lot, F, winTop, s.awning, !!s.thinStripes, broken);
  if (s.emblem) emblem(kit, s.emblem, F, W, H, broken);
  return kit;
}

/** A striped awning over the window, sloping down into the street. Torn and sagging once the shop is smashed. */
function awning(kit: FrontKit, lot: ShopLot, front: number, top: number, colors: readonly [string, string], thin: boolean, broken: boolean) {
  const W = lot.width - 2 * FRAME.pilaster;
  const reach = 1.1;
  const tilt = broken ? 0.9 : 0.35;
  const stripes = Math.max(3, Math.round(W / (thin ? 0.3 : 0.55)));
  const sw = W / stripes;
  const parent = groupMatrix([front, top - 0.05, 0], [0, 0, -tilt]);
  for (let i = 0; i < stripes; i++) {
    // A torn awning loses every third stripe.
    if (broken && i % 3 === 1) continue;
    kit.solid.add([reach / 2, 0, -W / 2 + sw * (i + 0.5)], [reach, 0.04, sw], colors[i % 2]!, undefined, parent);
  }
  // The valance at the end.
  if (!broken) kit.solid.add([reach, -0.12, 0], [0.03, 0.24, W], colors[0], undefined, parent);
}

/**
 * The first-floor balcony runs along every block (`HAUSSMANN` in
 * features/level): from 4.4 m up at the lowest, `BALCONY_DEPTH` out of the
 * wall. Whatever a shop hangs within that depth stays under `EMBLEM_TOP`, so
 * no emblem pokes through the balcony; further out it may rise higher.
 */
export const EMBLEM_TOP = 4.3;
export const BALCONY_DEPTH = 0.5;

/**
 * The kind's emblem (#117), big enough to spot from the game camera: on the
 * roof of the front, or on a blade sign hanging out over the pavement just
 * past one end of the front, above head height and under the first-floor
 * balcony (`EMBLEM_TOP`). A smashed shop's emblem hangs crooked.
 */
export function emblem(kit: FrontKit, kind: Emblem, F: number, W: number, H: number, broken: boolean) {
  const lit = (at: V3, size: V3, color: string, rot?: V3, parent?: Matrix4) => kit.lit.add(at, size, color, rot, parent);
  // A blade sign: hung from a bracket just past one end of the front, over
  // the plain wall between two shops (lots are at least `minGap` apart), and
  // above the sign band, so it never hides the name. Its faces look along the street.
  // A tall front leaves no room above it: its blade hangs lower, beside the band.
  const S = 1.25;
  const bladeZ = W / 2 + 0.3;
  const bladeX = F + 0.75;
  const bladeY = Math.min(H + 0.5, EMBLEM_TOP - 0.65);
  const bladeTilt: V3 = broken ? [0, 0, -0.5] : [0, 0, 0];
  const blade = groupMatrix([bladeX, bladeY, bladeZ], bladeTilt, [S, S, S]);
  if (kind !== "arches") kit.solid.add([(F + 0.75 + 0.3) / 2, bladeY + 0.55, bladeZ], [F + 0.75 + 0.3, 0.06, 0.06], C.bracket);
  switch (kind) {
    case "arches": {
      // A golden double arch, an "M" of three legs and two humps, standing on
      // a plate over the cornice and facing the street: out past the balcony's
      // depth, so a tall front's arches pass in front of the balcony, never through it.
      const x = Math.max(BALCONY_DEPTH + 0.15, F * 0.5);
      kit.solid.add([(x + 0.15) / 2, H + 0.06, 0], [x + 0.15, 0.06, 1.9], C.bracket);
      const parent = groupMatrix([x, H + 0.08, 0], broken ? [0.25, 0, -0.15] : [0, 0, 0]);
      const t = 0.16;
      const leg = 0.8;
      const mid = 0.7;
      const half = 0.85;
      for (const z of [-half, half]) lit([0, leg / 2, z], [t, leg, t], "#ffcc00", undefined, parent);
      lit([0, mid / 2, 0], [t, mid, t], "#ffcc00", undefined, parent);
      // Each hump: rises from an outer leg to a peak, falls to the middle leg.
      for (const s of [-1, 1]) {
        const peakZ = (s * half) / 2;
        const peakY = leg + 0.3;
        seg(kit, parent, s * half, leg, peakZ + s * 0.08, peakY, t, "#ffcc00");
        seg(kit, parent, peakZ - s * 0.08, peakY, 0, mid, t, "#ffcc00");
        lit([0, peakY, peakZ], [t, t, 0.2], "#ffcc00", undefined, parent);
      }
      break;
    }
    case "cross": {
      // The pharmacy's green cross, thick enough to read from any side, glowing.
      lit([0, 0, 0], [0.26, 0.8, 0.26], "#1ed760", undefined, blade);
      lit([0, 0, 0], [0.8, 0.26, 0.26], "#1ed760", undefined, blade);
      break;
    }
    case "carotte": {
      // The tabac's red carrot: a lozenge twice as tall as wide, with a white rim line.
      const tall = groupMatrix([bladeX, bladeY, bladeZ], bladeTilt, [S, 2 * S, S]);
      lit([0, 0, 0], [0.36, 0.36, 0.2], "#e01b24", [0, 0, Math.PI / 4], tall);
      lit([0, 0, 0], [0.27, 0.27, 0.22], "#ffffff", [0, 0, Math.PI / 4], tall);
      lit([0, 0, 0], [0.21, 0.21, 0.24], "#e01b24", [0, 0, Math.PI / 4], tall);
      break;
    }
    case "phone": {
      // A giant phone: dark body, the screen lit on both faces.
      kit.solid.add([0, 0, 0], [0.5, 0.9, 0.12], "#212121", undefined, blade);
      lit([0, 0.03, 0], [0.4, 0.7, 0.14], "#40c4ff", undefined, blade);
      lit([0, -0.36, 0], [0.12, 0.05, 0.15], "#e0e0e0", undefined, blade);
      break;
    }
    case "drumstick": {
      // A fried-chicken drumstick: the golden meat, the white bone out of its end.
      const leg = groupMatrix([bladeX, bladeY, bladeZ], [0, 0, (broken ? -0.5 : 0) + Math.PI / 5], [S, S, S]);
      lit([0, 0.12, 0], [0.5, 0.62, 0.3], "#f39c12", undefined, leg);
      lit([0, -0.32, 0], [0.12, 0.36, 0.12], "#fff8e1", undefined, leg);
      lit([0.07, -0.52, 0], [0.13, 0.13, 0.14], "#fff8e1", undefined, leg);
      lit([-0.07, -0.52, 0], [0.13, 0.13, 0.14], "#fff8e1", undefined, leg);
      break;
    }
  }
}

/** A bar between two points of the YZ plane (x = 0 in `parent`), `t` thick: for the arches. */
function seg(kit: FrontKit, parent: Matrix4, z1: number, y1: number, z2: number, y2: number, t: number, color: string) {
  const dz = z2 - z1;
  const dy = y2 - y1;
  const len = Math.hypot(dz, dy) + t * 0.6;
  kit.lit.add([0, (y1 + y2) / 2, (z1 + z2) / 2], [t, t, len], color, [Math.atan2(-dy, dz), 0, 0], parent);
}

/** What each kind shows in its window, between the facade and the glass, scaled to the window. */
function display(kit: FrontKit, lot: ShopLot, x: number, winW: number, rand: () => number) {
  if (lot.unknown) return;
  const at = Math.min(x, 0.3);
  const solid = (p: V3, size: V3, color: string, rot?: V3) => kit.solid.add(p, size, color, rot);
  const lit = (p: V3, size: V3, color: string) => kit.lit.add(p, size, color);
  switch (lot.kind) {
    case "boulangerie":
      // Baguettes stacked in the window.
      for (const [i, dz] of [-0.3, 0, 0.3].entries()) solid([at, 1.0 + i * 0.12, dz * winW * 0.5], [0.12, 0.12, winW * 0.3], C.bread, [0.15, 0, 0]);
      return;
    case "cafe":
      // Café tables out front when the shop stands out far enough to have a terrace in its footprint.
      if (x < 0.6) return;
      for (const z of [-winW / 4, winW / 4]) {
        solid([x * 0.55, 0.55, z], [0.45, 0.04, 0.45], C.table);
        solid([x * 0.55, 0.27, z], [0.05, 0.54, 0.05], C.mullion);
      }
      return;
    case "sneakers":
      solid([at, 1.1, 0], [0.35, 0.3, 0.8], C.white);
      lit([at, 0.92, 0], [0.37, 0.08, 0.84], C.neonB);
      lit([x + 0.07, lot.height - FRAME.band - 0.1, 0], [0.04, 0.06, winW * 0.9], C.neonA);
      return;
    case "kebab":
      // The turning spit.
      solid([at, 1.25, winW * 0.25], [0.35, 0.9, 0.35], C.meat);
      solid([at, 1.25, winW * 0.25], [0.03, 1.3, 0.03], C.metal);
      return;
    case "toilettage":
      // A pompom poodle statue.
      solid([at, 0.75, -winW * 0.25], [0.32, 0.32, 0.32], C.white);
      solid([at, 1.05, -winW * 0.25], [0.24, 0.24, 0.24], C.white);
      solid([at, 1.25, -winW * 0.25 + 0.12], [0.16, 0.16, 0.16], C.white);
      return;
    case "burger": {
      // A giant burger in the window: bun, cheese, patty, salad, bun.
      const z = -winW * 0.22;
      const layers: [number, string][] = [
        [0.14, "#d68a2e"],
        [0.08, "#4e2a12"],
        [0.05, "#ffd000"],
        [0.05, "#43a047"],
        [0.2, "#e09a3e"],
      ];
      let y = 0.62;
      for (const [h, color] of layers) {
        solid([at, y + h / 2, z], [0.5, h, 0.62], color);
        y += h;
      }
      // The menu board over the counter, lit.
      lit([Math.max(0.02, at - 0.1), lot.height - FRAME.band - 0.35, winW * 0.18], [0.03, 0.4, winW * 0.4], "#fff59d");
      return;
    }
    case "poulet": {
      // A striped bucket of chicken.
      const z = winW * 0.22;
      for (let i = 0; i < 4; i++) solid([at, 0.85, z - 0.24 + i * 0.16], [0.42, 0.6, 0.16], i % 2 ? "#ffffff" : "#d32f2f");
      solid([at, 1.2, z], [0.36, 0.14, 0.56], "#f39c12");
      return;
    }
    case "sport": {
      // Shirts on a rail: the referee's stripes, and a football.
      for (let i = 0; i < 3; i++) {
        const z = -winW * 0.3 + i * 0.55;
        solid([at, 1.2, z], [0.08, 0.7, 0.45], i % 2 ? "#1565c0" : "#f5f5f5");
        if (i % 2 === 0) for (let k = 0; k < 3; k++) solid([at + 0.05, 1.2, z - 0.15 + k * 0.15], [0.02, 0.7, 0.06], "#111111");
      }
      solid([at, 0.75, winW * 0.25], [0.32, 0.32, 0.32], "#fafafa", [0.4, 0.6, 0]);
      solid([at, 0.75, winW * 0.25], [0.33, 0.12, 0.12], "#111111", [0.4, 0.6, 0]);
      return;
    }
    case "telephone":
      // Phones on a shelf, screens lit.
      solid([at, 0.95, 0], [0.3, 0.04, winW * 0.7], C.metal);
      for (let i = 0; i < 4; i++) {
        const z = -winW * 0.3 + (i * winW * 0.6) / 3;
        solid([at, 1.12, z], [0.05, 0.32, 0.18], "#212121");
        lit([at + 0.03, 1.13, z], [0.02, 0.26, 0.14], i % 2 ? "#40c4ff" : "#b388ff");
      }
      return;
    case "pharmacie":
      // White shelves of boxes, and a little green cross in the window.
      for (let r = 0; r < 2; r++) solid([at, 0.8 + r * 0.45, -winW * 0.2], [0.25, 0.25, winW * 0.4], r ? "#e3f2fd" : "#ffffff");
      lit([at, 1.3, winW * 0.25], [0.04, 0.4, 0.13], "#1ed760");
      lit([at, 1.3, winW * 0.25], [0.04, 0.13, 0.4], "#1ed760");
      return;
    case "superette": {
      // Fruit crates stacked in the window: apples, oranges, limes.
      const fruit = ["#e53935", "#fb8c00", "#7cb342"];
      for (let i = 0; i < 3; i++) {
        const z = -winW * 0.3 + (i * winW * 0.6) / 2;
        solid([at, 0.65, z], [0.36, 0.26, 0.5], "#8d6e63");
        solid([at, 0.8, z], [0.32, 0.06, 0.46], fruit[(i + Math.floor(rand() * 3)) % 3]!);
      }
      return;
    }
    case "tabac":
      // The newspaper rack: front pages stuck up in the window.
      for (let i = 0; i < 4; i++) solid([at, 1.05, -winW * 0.3 + i * 0.35], [0.03, 0.45, 0.3], i % 2 ? "#eeeeee" : "#fff59d", [0, 0, -0.1]);
      return;
    default:
      return;
  }
}
