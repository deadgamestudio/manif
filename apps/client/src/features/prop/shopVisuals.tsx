/*
 * PLACEHOLDER LOOKS for the shops dealt each round (#68): coloured fronts in
 * plain boxes, one small prop per kind so they read apart from above, until
 * Jordan's models (#28) replace them here. Every kind fills the same
 * footprint (SHOP_FRONT), so what you see is what you bump into. Locally the
 * shop front faces +X, towards the street (the level turns the right-hand
 * slots round). The sign is a separate sprite (ShopSign), drawn by PropView.
 */
import type { ReactNode } from "react";
import { SHOP_FRONT, type ShopKind } from "@manif/shared";
import type { PropLook } from "./propVisuals.tsx";

const W = SHOP_FRONT.type === "box" ? SHOP_FRONT.halfX * 2 : 1;
const D = SHOP_FRONT.type === "box" ? SHOP_FRONT.halfZ * 2 : 3;
const H = 2.6;
const GLASS = { color: "#a5d8ff", transparent: true, opacity: 0.4 } as const;
const GLASS_DEBRIS = ["#a5d8ff", "#e3f2fd", "#81d4fa"];

/** What a shop kind looks like, and how its sign is painted. */
export interface ShopStyle {
  /** Pillars and fascia. */
  front: string;
  /** Fascia band above the window. */
  fascia: string;
  /** Awning colour; none for a shop without one. */
  awning?: string;
  /** The sign: background, then lettering. */
  sign: readonly [string, string];
  /** The kind's own little extra, in front of the window. */
  extra?: (broken: boolean) => ReactNode;
  /** Heavy shutters instead of glass (the bank). */
  shutter?: boolean;
  debris: string[];
}

function Box({ at, size, color, rot }: { at: [number, number, number]; size: [number, number, number]; color: string; rot?: [number, number, number] }) {
  return (
    <mesh position={at} rotation={rot ?? [0, 0, 0]} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function Baguette() {
  // A giant baguette across the fascia.
  return (
    <mesh position={[W / 2 + 0.05, H - 0.25, 0]} rotation-x={Math.PI / 2} castShadow>
      <capsuleGeometry args={[0.12, D * 0.7, 4, 10]} />
      <meshStandardMaterial color="#d9a441" />
    </mesh>
  );
}

function Terrace({ broken }: { broken: boolean }) {
  // Two little bistro tables with chairs, tucked against the window (inside the footprint).
  if (broken) return <Box at={[0.25, 0.08, 0.6]} size={[0.5, 0.06, 0.5]} color="#5d4037" rot={[0, 0, 1.4]} />;
  return (
    <group>
      {[-0.8, 0.8].map((z) => (
        <group key={z} position={[0.3, 0, z]}>
          <mesh position-y={0.55} castShadow>
            <cylinderGeometry args={[0.22, 0.22, 0.04, 14]} />
            <meshStandardMaterial color="#eceff1" />
          </mesh>
          <mesh position-y={0.27}>
            <cylinderGeometry args={[0.03, 0.03, 0.54, 6]} />
            <meshStandardMaterial color="#37474f" />
          </mesh>
          <Box at={[0, 0.3, 0.32]} size={[0.25, 0.04, 0.2]} color="#a1887f" />
          <Box at={[0, 0.3, -0.32]} size={[0.25, 0.04, 0.2]} color="#a1887f" />
        </group>
      ))}
    </group>
  );
}

function Neon({ broken }: { broken: boolean }) {
  // Unlit (basic) material so it glows; PropView's hit flash only touches lit materials.
  if (broken) return null;
  return (
    <group>
      <mesh position={[W / 2 + 0.02, H - 0.55, 0]}>
        <boxGeometry args={[0.04, 0.06, D * 0.9]} />
        <meshBasicMaterial color="#00e5ff" />
      </mesh>
      <mesh position={[W / 2 + 0.02, 0.45, 0]}>
        <boxGeometry args={[0.04, 0.06, D * 0.9]} />
        <meshBasicMaterial color="#ff2bd6" />
      </mesh>
      {/* A giant sneaker on display. */}
      <Box at={[0.1, 1.1, 0]} size={[0.35, 0.3, 0.8]} color="#fafafa" />
      <Box at={[0.1, 0.92, 0]} size={[0.37, 0.08, 0.84]} color="#ff2bd6" />
    </group>
  );
}

function Spit({ broken }: { broken: boolean }) {
  // The kebab's turning spit, behind the glass.
  return (
    <group position={[-0.05, 0, 0.7]}>
      <mesh position-y={1.2} rotation-z={broken ? 1.2 : 0} castShadow>
        <cylinderGeometry args={[0.22, 0.12, 0.9, 10]} />
        <meshStandardMaterial color="#8d4f2a" />
      </mesh>
      {!broken && <Box at={[0, 1.2, 0]} size={[0.03, 1.3, 0.03]} color="#9e9e9e" />}
    </group>
  );
}

function Poodle({ broken }: { broken: boolean }) {
  // A pompom poodle statue: three white balls.
  return (
    <group position={[0.2, 0, -0.8]} rotation-z={broken ? Math.PI / 2 : 0}>
      {(
        [
          [0, 0.35, 0, 0.18],
          [0, 0.65, 0, 0.14],
          [0, 0.85, 0.12, 0.1],
        ] as const
      ).map(([x, y, z, r]) => (
        <mesh key={y} position={[x, y, z]} castShadow>
          <sphereGeometry args={[r, 12, 10]} />
          <meshStandardMaterial color="#fafafa" />
        </mesh>
      ))}
    </group>
  );
}

export const SHOP_STYLES: Readonly<Record<ShopKind, ShopStyle>> = {
  boulangerie: {
    front: "#e8d5b0",
    fascia: "#8d5524",
    awning: "#f3e6c8",
    sign: ["#8d5524", "#fff3d6"],
    extra: () => <Baguette />,
    debris: [...GLASS_DEBRIS, "#d9a441", "#f3e6c8"],
  },
  cafe: {
    front: "#7b1f1f",
    fascia: "#4e1212",
    awning: "#c62828",
    sign: ["#1b1b1b", "#ffd54f"],
    extra: (broken) => <Terrace broken={broken} />,
    debris: [...GLASS_DEBRIS, "#c62828", "#eceff1"],
  },
  sneakers: {
    front: "#1c1c1c",
    fascia: "#111111",
    sign: ["#111111", "#00e5ff"],
    extra: (broken) => <Neon broken={broken} />,
    debris: [...GLASS_DEBRIS, "#ff2bd6", "#00e5ff"],
  },
  banque: {
    front: "#9e9e9e",
    fascia: "#546e7a",
    sign: ["#263238", "#e0e0e0"],
    shutter: true,
    debris: ["#9e9e9e", "#757575", "#cfd8dc", "#546e7a"],
  },
  kebab: {
    front: "#f9a825",
    fascia: "#c62828",
    awning: "#2e7d32",
    sign: ["#c62828", "#fff176"],
    extra: (broken) => <Spit broken={broken} />,
    debris: [...GLASS_DEBRIS, "#f9a825", "#2e7d32"],
  },
  toilettage: {
    front: "#f8bbd0",
    fascia: "#ec407a",
    awning: "#f8bbd0",
    sign: ["#fce4ec", "#ad1457"],
    extra: (broken) => <Poodle broken={broken} />,
    debris: [...GLASS_DEBRIS, "#f8bbd0", "#fafafa"],
  },
};

function ShopFront({ style, broken }: { style: ShopStyle; broken: boolean }) {
  const pillar = 0.25;
  return (
    <group>
      {/* Dark interior behind the window. */}
      <Box at={[-W * 0.2, H / 2, 0]} size={[W * 0.6, H, D - pillar * 2]} color="#263238" />
      {/* Pillars at both ends and the fascia over the window. */}
      <Box at={[0, H / 2, D / 2 - pillar / 2]} size={[W, H, pillar]} color={style.front} />
      <Box at={[0, H / 2, -D / 2 + pillar / 2]} size={[W, H, pillar]} color={style.front} />
      <Box at={[0, H - 0.25, 0]} size={[W, 0.5, D]} color={style.fascia} />
      <Box at={[0, 0.12, 0]} size={[W, 0.24, D]} color={style.front} />
      {style.awning && (
        <Box at={[W / 2 + 0.15, H - 0.65, 0]} size={[0.7, 0.05, D * 0.92]} color={broken ? "#5d4037" : style.awning} rot={[0, 0, broken ? -0.9 : -0.35]} />
      )}
      {style.shutter ? (
        broken ? (
          // The shutter half torn off, hanging crooked.
          <Box at={[W / 2 - 0.1, H - 0.8, 0.2]} size={[0.06, 0.6, D * 0.7]} color="#78909c" rot={[0.25, 0, 0]} />
        ) : (
          <group>
            <Box at={[W / 2 - 0.06, (H - 0.5) / 2 + 0.12, 0]} size={[0.08, H - 0.74, D - pillar * 2]} color="#90a4ae" />
            {/* Slats. */}
            {[0.5, 0.8, 1.1, 1.4, 1.7].map((y) => (
              <Box key={y} at={[W / 2 - 0.01, y, 0]} size={[0.02, 0.05, D - pillar * 2]} color="#607d8b" />
            ))}
          </group>
        )
      ) : (
        !broken && (
          <mesh position={[W / 2 - 0.1, (H - 0.5) / 2 + 0.12, 0]}>
            <boxGeometry args={[0.06, H - 0.74, D - pillar * 2]} />
            <meshStandardMaterial {...GLASS} />
          </mesh>
        )
      )}
      {style.extra?.(broken)}
    </group>
  );
}

function shopLook(style: ShopStyle): PropLook {
  return {
    intact: () => <ShopFront style={style} broken={false} />,
    broken: () => <ShopFront style={style} broken />,
    debris: { y: 1.6, count: 28, colors: style.debris, size: 0.15, speed: 6 },
  };
}

/** One `PropLook` per shop kind, merged into PROP_LOOKS. */
export const SHOP_LOOKS: Readonly<Record<ShopKind, PropLook>> = {
  boulangerie: shopLook(SHOP_STYLES.boulangerie),
  cafe: shopLook(SHOP_STYLES.cafe),
  sneakers: shopLook(SHOP_STYLES.sneakers),
  banque: shopLook(SHOP_STYLES.banque),
  kebab: shopLook(SHOP_STYLES.kebab),
  toilettage: shopLook(SHOP_STYLES.toilettage),
};
