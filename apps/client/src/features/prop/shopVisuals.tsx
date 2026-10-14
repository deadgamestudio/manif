/*
 * PLACEHOLDER LOOKS for the shops (#68, #83): Paris ground-floor storefronts
 * built from plain boxes, sized from each shop's generated `ShopLot`, until
 * Jordan's models (#28) replace them here. Nothing here is per frame: a shop's
 * meshes are built when its round's layout arrives.
 *
 * Local frame of a shop (ShopView sets it): the origin is on the facade at the
 * middle of the shop, +X points out into the street, Z runs along the facade,
 * Y is up. The front stands at `shopFront(lot)`, the same plane the server
 * collides with, so what you see is what you bump into. Nothing is drawn
 * behind the facade (x < 0): the room there (`lot.interior`, #84) and the
 * walls around it are the level's (`features/level`). Intact, the front
 * closes the doorway from the ground to the sign band; broken, nothing but
 * the sign band (the lintel) spans it, so the way in reads as open.
 *
 * Materials are shared per kind (and the common ones by every shop); every
 * mesh is one shared unit box, scaled.
 */
import type { ReactNode } from "react";
import { BoxGeometry, DoubleSide, MeshStandardMaterial, type Material } from "three";
import { SHOP_LAYOUT, SHOP_ROOM, type ShopKind, type ShopLot } from "@manif/shared";

/** What a shop kind looks like, and how its sign is painted. */
export interface ShopStyle {
  /** Pilasters and stall riser. */
  front: string;
  /** The sign band over the window. */
  fascia: string;
  /** Awning stripes (two colours); none for a shop without one. */
  awning?: readonly [string, string];
  /** What shows through the glass while the lights are on. */
  inside: string;
  /** The sign: background, then lettering. */
  sign: readonly [string, string];
  /** A metal shutter (the bank). */
  shutter?: boolean;
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
};

/** One unit box, scaled by every mesh. */
export const UNIT_BOX = new BoxGeometry(1, 1, 1);

function mat(color: string, extra: Partial<ConstructorParameters<typeof MeshStandardMaterial>[0]> = {}): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, ...extra });
}

/** Shared by every shop. */
export const COMMON = {
  glass: mat("#a5d8ff", { transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.2 }),
  shard: mat("#cfeaff", { transparent: true, opacity: 0.6, side: DoubleSide }),
  dark: mat("#15191c", { roughness: 1 }),
  wreck: mat("#3e2f27"),
  mullion: mat("#2b2b2b"),
  metal: mat("#90a4ae", { metalness: 0.5, roughness: 0.5 }),
  slat: mat("#607d8b", { metalness: 0.4 }),
  white: mat("#fafafa"),
  bread: mat("#d9a441"),
  meat: mat("#8d4f2a"),
  neonA: mat("#00e5ff", { emissive: "#00e5ff", emissiveIntensity: 1.2 }),
  neonB: mat("#ff2bd6", { emissive: "#ff2bd6", emissiveIntensity: 1.2 }),
  table: mat("#eceff1"),
};

export interface KindMaterials {
  front: Material;
  riser: Material;
  fascia: Material;
  inside: Material;
  awning: readonly [Material, Material] | null;
}

const kindMaterials = new Map<ShopKind, KindMaterials>();

/** The materials of a kind, made once and shared by every shop of that kind. */
export function materialsOf(kind: ShopKind): KindMaterials {
  let m = kindMaterials.get(kind);
  if (!m) {
    const s = SHOP_STYLES[kind];
    m = {
      front: mat(s.front),
      riser: mat(s.front, { roughness: 0.9 }),
      fascia: mat(s.fascia),
      inside: mat(s.inside, { emissive: s.inside, emissiveIntensity: 0.35 }),
      awning: s.awning ? [mat(s.awning[0], { side: DoubleSide }), mat(s.awning[1], { side: DoubleSide })] : null,
    };
    kindMaterials.set(kind, m);
  }
  return m;
}

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

type V3 = readonly [number, number, number];

/** A scaled unit box. */
function B({ at, size, m, rot, shadow = true }: { at: V3; size: V3; m: Material; rot?: V3; shadow?: boolean }) {
  return <mesh geometry={UNIT_BOX} material={m} position={at as [number, number, number]} scale={size as [number, number, number]} rotation={(rot ?? [0, 0, 0]) as [number, number, number]} castShadow={shadow} />;
}

/** A small deterministic generator from the shop's style seed, for the look's little variations. */
function styleRandom(seed: number): () => number {
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
 * The storefront of one shop, intact or smashed: pilasters and stall riser,
 * a big pane of glass (or the bank's shutter) with mullions, the sign band,
 * an awning for the food shops, the kind's window display; broken, the glass
 * is gone, a dark wrecked shop shows, with shards left in the frame.
 */
export function Storefront({ lot, broken }: { lot: ShopLot; broken: boolean }): ReactNode {
  const s = SHOP_STYLES[lot.kind];
  const m = materialsOf(lot.kind);
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
  // The glass sits a little behind the front of the frame, in its reveal.
  const glassX = Math.max(0.03, F - 0.08);
  // The window display stands between the facade and the glass; a deep front gives it room.
  const depth = Math.max(0.04, glassX - 0.02);
  const panes = 1 + Math.floor(rand() * 3);
  const parts: ReactNode[] = [];
  const add = (node: ReactNode) => parts.push(node);
  let k = 0;
  const key = () => `p${k++}`;

  // Pilasters at both ends, the stall riser and the sign band (the roof of a deep front).
  for (const z of [-(W - P) / 2, (W - P) / 2]) add(<B key={key()} at={[(F + 0.04) / 2, H / 2, z]} size={[F + 0.04, H, P]} m={m.front} />);
  if (!broken) add(<B key={key()} at={[F / 2, winBottom / 2, 0]} size={[F, winBottom, winW]} m={m.riser} />);
  add(<B key={key()} at={[(F + 0.1) / 2, H - FRAME.band / 2, 0]} size={[F + 0.1, FRAME.band, W]} m={m.fascia} />);
  // A thin cornice over the band.
  add(<B key={key()} at={[(F + 0.18) / 2, H + 0.04, 0]} size={[F + 0.18, 0.08, W + 0.1]} m={m.front} />);

  if (!broken) {
    // Lit shop behind the glass.
    add(<B key={key()} at={[depth / 2, winY, 0]} size={[depth, winH, winW]} m={m.inside} shadow={false} />);
    if (s.shutter) {
      // The bank's metal shutter, pulled most of the way down.
      const down = winH * (0.55 + rand() * 0.35);
      add(<B key={key()} at={[glassX + 0.03, winTop - down / 2, 0]} size={[0.05, down, winW]} m={COMMON.metal} />);
      for (let y = winTop - 0.2; y > winTop - down; y -= 0.22) add(<B key={key()} at={[glassX + 0.06, y, 0]} size={[0.02, 0.05, winW]} m={COMMON.slat} shadow={false} />);
    }
    add(<B key={key()} at={[glassX, winY, 0]} size={[0.04, winH, winW]} m={COMMON.glass} shadow={false} />);
    for (let i = 1; i < panes; i++) {
      const z = -winW / 2 + (winW * i) / panes;
      add(<B key={key()} at={[glassX + 0.02, winY, z]} size={[0.06, winH, 0.08]} m={COMMON.mullion} />);
    }
    add(<Display key={key()} lot={lot} x={depth} winW={winW} />);
  } else {
    // Smashed: the riser and the glass are gone and the doorway (the room's
    // width, `SHOP_ROOM.frame` in from each end) is open into the room behind.
    // Only stubs of the riser stay, in the strip between the doorway and the pilasters.
    const stub = SHOP_ROOM.frame - P;
    for (const side of [-1, 1]) {
      const h = winBottom * (0.4 + rand() * 0.6);
      add(<B key={key()} at={[F / 2, h / 2, side * (winW / 2 - stub / 2)]} size={[F, h, stub]} m={m.riser} />);
    }
    if (depth > 0.1) add(<B key={key()} at={[depth / 2, 0.02, 0]} size={[depth, 0.04, winW]} m={COMMON.dark} shadow={false} />);
    // A tipped-over shelf and a few things on the floor, out on the pavement.
    add(<B key={key()} at={[F + 0.35, 0.25, -winW * 0.2]} size={[0.5, 0.5, 1.4]} m={COMMON.wreck} rot={[0, 0.4, 1.2]} />);
    for (let i = 0; i < 4; i++) {
      const z = (rand() - 0.5) * winW;
      add(<B key={key()} at={[F + 0.2 + rand() * 0.8, 0.08, z]} size={[0.25, 0.16, 0.3]} m={i % 2 ? m.inside : COMMON.wreck} rot={[0, rand() * 3, 0]} />);
    }
    // Shards still hanging from the top of the frame, and more on the ground.
    for (let i = 0; i < 6; i++) {
      const z = -winW / 2 + 0.2 + rand() * (winW - 0.4);
      const h = 0.25 + rand() * 0.45;
      const w = 0.18 + rand() * 0.3;
      if (i % 2 === 0) add(<B key={key()} at={[glassX, winTop - h / 2, z]} size={[0.02, h, w]} m={COMMON.shard} rot={[rand() - 0.5, 0, 0]} shadow={false} />);
      else add(<B key={key()} at={[F + 0.1 + rand() * 0.6, 0.015, z]} size={[h, 0.02, w]} m={COMMON.shard} rot={[0, rand() * 3, 0]} shadow={false} />);
    }
    if (s.shutter) {
      // The shutter torn half off, hanging crooked from one end of the frame, high over the doorway.
      add(<B key={key()} at={[glassX + 0.15, winTop - 0.3, winW * 0.32]} size={[0.05, 0.55, winW * 0.36]} m={COMMON.metal} rot={[0.35, 0, -0.2]} />);
    }
  }

  if (m.awning) add(<Awning key={key()} lot={lot} front={F} top={winTop} materials={m.awning} broken={broken} />);
  return <group>{parts}</group>;
}

/** A striped awning over the window, sloping down into the street. Torn and sagging once the shop is smashed. */
function Awning({ lot, front, top, materials, broken }: { lot: ShopLot; front: number; top: number; materials: readonly [Material, Material]; broken: boolean }) {
  const W = lot.width - 2 * FRAME.pilaster;
  const reach = 1.1;
  const tilt = broken ? 0.9 : 0.35;
  const stripes = Math.max(3, Math.round(W / 0.55));
  const sw = W / stripes;
  return (
    <group position={[front, top - 0.05, 0]} rotation-z={-tilt}>
      {Array.from({ length: stripes }, (_, i) => {
        // A torn awning loses every third stripe.
        if (broken && i % 3 === 1) return null;
        return <B key={i} at={[reach / 2, 0, -W / 2 + sw * (i + 0.5)]} size={[reach, 0.04, sw]} m={materials[i % 2]!} />;
      })}
      {/* The scalloped valance at the end. */}
      {!broken && <B at={[reach, -0.12, 0]} size={[0.03, 0.24, W]} m={materials[0]} />}
    </group>
  );
}

/** What each kind shows in its window, between the facade and the glass, scaled to the window. */
function Display({ lot, x, winW }: { lot: ShopLot; x: number; winW: number }) {
  const at = Math.min(x, 0.3);
  switch (lot.kind) {
    case "boulangerie":
      // Baguettes stacked in the window.
      return (
        <group>
          {[-0.3, 0, 0.3].map((dz, i) => (
            <mesh key={i} geometry={UNIT_BOX} material={COMMON.bread} position={[at, 1.0 + i * 0.12, dz * winW * 0.5]} scale={[0.12, 0.12, winW * 0.3]} rotation-x={0.15} />
          ))}
        </group>
      );
    case "cafe":
      // Café tables out front when the shop stands out far enough to have a terrace in its footprint.
      if (x < 0.6) return null;
      return (
        <group>
          {[-winW / 4, winW / 4].map((z) => (
            <group key={z} position={[x * 0.55, 0, z]}>
              <B at={[0, 0.55, 0]} size={[0.45, 0.04, 0.45]} m={COMMON.table} />
              <B at={[0, 0.27, 0]} size={[0.05, 0.54, 0.05]} m={COMMON.mullion} />
            </group>
          ))}
        </group>
      );
    case "sneakers":
      return (
        <group>
          <B at={[at, 1.1, 0]} size={[0.35, 0.3, 0.8]} m={COMMON.white} />
          <B at={[at, 0.92, 0]} size={[0.37, 0.08, 0.84]} m={COMMON.neonB} />
          <B at={[x + 0.07, lot.height - FRAME.band - 0.1, 0]} size={[0.04, 0.06, winW * 0.9]} m={COMMON.neonA} shadow={false} />
        </group>
      );
    case "kebab":
      // The turning spit.
      return (
        <group position={[at, 0, winW * 0.25]}>
          <mesh geometry={UNIT_BOX} material={COMMON.meat} position-y={1.25} scale={[0.35, 0.9, 0.35]} castShadow />
          <B at={[0, 1.25, 0]} size={[0.03, 1.3, 0.03]} m={COMMON.metal} />
        </group>
      );
    case "toilettage":
      // A pompom poodle statue.
      return (
        <group position={[at, 0, -winW * 0.25]}>
          <B at={[0, 0.75, 0]} size={[0.32, 0.32, 0.32]} m={COMMON.white} />
          <B at={[0, 1.05, 0]} size={[0.24, 0.24, 0.24]} m={COMMON.white} />
          <B at={[0, 1.25, 0.12]} size={[0.16, 0.16, 0.16]} m={COMMON.white} />
        </group>
      );
    default:
      return null;
  }
}
