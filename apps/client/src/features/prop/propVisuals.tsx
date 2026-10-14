/*
 * PLACEHOLDER LOOKS for breakable props (#4). Plain boxes and cylinders in
 * flat colours, all in this one file, so a real model (Jordan's) can replace
 * a kind here without touching the logic in PropView. Sizes come from the
 * collision shapes in PROP_TYPES, so what you see is what you bump into.
 */
import type { ReactNode } from "react";
import { DoubleSide } from "three";
import { PROP_TYPES, type PropKind, type PropShapeDef, type ShopKind } from "@manif/shared";
import type { DebrisBurst } from "./debris.ts";

/** Footprint (full width along X, full depth along Z) of a shape. */
function footprint(def: PropShapeDef): [number, number] {
  return def.type === "box" ? [def.halfX * 2, def.halfZ * 2] : [def.r * 2, def.r * 2];
}

const GLASS = { color: "#a5d8ff", transparent: true, opacity: 0.45 } as const;

export interface PropLook {
  /** Intact model, centred on the slot, local frame (before the slot's rotation). */
  intact: () => ReactNode;
  /** Broken model. */
  broken: () => ReactNode;
  /** Debris sprayed when it breaks (position filled in by PropView). */
  debris: Omit<DebrisBurst, "x" | "z">;
  /** Optional per-frame extra for the broken state (the car alarm). */
  alarm?: boolean;
}

function Bin({ broken }: { broken: boolean }) {
  const [w] = footprint(PROP_TYPES.bin.intact);
  const r = w / 2;
  if (broken) {
    // Knocked over, lid gone.
    return (
      <mesh position={[0.2, r * 0.8, 0]} rotation-z={Math.PI / 2} castShadow>
        <cylinderGeometry args={[r * 0.8, r * 0.7, 0.9, 14, 1, true]} />
        <meshStandardMaterial color="#2e7d32" side={DoubleSide} />
      </mesh>
    );
  }
  return (
    <group>
      <mesh position-y={0.5} castShadow receiveShadow>
        <cylinderGeometry args={[r * 0.95, r * 0.8, 1, 16]} />
        <meshStandardMaterial color="#388e3c" />
      </mesh>
      <mesh position-y={1.05} castShadow>
        <cylinderGeometry args={[r, r, 0.1, 16]} />
        <meshStandardMaterial color="#1b5e20" />
      </mesh>
    </group>
  );
}

function BusShelter({ broken }: { broken: boolean }) {
  const [w, d] = footprint(PROP_TYPES.bus_shelter.intact);
  const h = 2.4;
  const posts: [number, number][] = [
    [-w / 2 + 0.05, -d / 2 + 0.05],
    [-w / 2 + 0.05, d / 2 - 0.05],
    [w / 2 - 0.05, -d / 2 + 0.05],
    [w / 2 - 0.05, d / 2 - 0.05],
  ];
  return (
    <group>
      {posts.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, h / 2, z]} castShadow>
          <boxGeometry args={[0.1, h, 0.1]} />
          <meshStandardMaterial color="#455a64" />
        </mesh>
      ))}
      <mesh position-y={h} castShadow>
        <boxGeometry args={[w + 0.2, 0.12, d + 0.2]} />
        <meshStandardMaterial color={broken ? "#37474f" : "#546e7a"} />
      </mesh>
      {/* Bench. */}
      <mesh position={[w / 4, 0.45, 0]} castShadow>
        <boxGeometry args={[w / 3, 0.08, d * 0.7]} />
        <meshStandardMaterial color="#8d6e63" />
      </mesh>
      {!broken && (
        // Back glass panel.
        <mesh position={[w / 2 - 0.05, h / 2 + 0.1, 0]}>
          <boxGeometry args={[0.04, h - 0.4, d - 0.2]} />
          <meshStandardMaterial {...GLASS} />
        </mesh>
      )}
    </group>
  );
}


function Car({ broken }: { broken: boolean }) {
  const [w, d] = footprint(PROP_TYPES.car.intact);
  return (
    <group>
      <mesh position-y={0.5} castShadow receiveShadow>
        <boxGeometry args={[w, 0.7, d]} />
        <meshStandardMaterial color={broken ? "#2b2b2b" : "#c62828"} />
      </mesh>
      <mesh position={[0, 1.1, -0.1]} castShadow>
        <boxGeometry args={[w * 0.85, 0.55, d * 0.5]} />
        <meshStandardMaterial {...(broken ? { color: "#1a1a1a" } : GLASS)} />
      </mesh>
      {/* Indicator lights; PropView blinks them when the alarm goes off. */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (w / 2 - 0.15), 0.6, d / 2 + 0.01]} name="alarm-light">
          <boxGeometry args={[0.25, 0.15, 0.04]} />
          <meshStandardMaterial color="#ffb300" emissive="#ffb300" emissiveIntensity={0} />
        </mesh>
      ))}
    </group>
  );
}

function MarketStall({ broken }: { broken: boolean }) {
  // A trestle table of tomato crates under a striped awning (#15). Long side along the street (Z).
  const [w, d] = footprint(PROP_TYPES.market_stall.intact);
  if (broken) {
    // The table folded flat, crates spilled.
    return (
      <group>
        <mesh position={[0, 0.06, 0]} rotation-z={0.15} receiveShadow>
          <boxGeometry args={[w * 0.9, 0.08, d * 0.9]} />
          <meshStandardMaterial color="#8d6e63" />
        </mesh>
        <mesh position={[w * 0.3, 0.02, d * 0.25]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[w * 0.9, d * 0.6]} />
          <meshStandardMaterial color="#e53935" side={DoubleSide} />
        </mesh>
      </group>
    );
  }
  const tableY = 0.8;
  const awningY = 2.1;
  const legs: [number, number][] = [
    [-w / 2 + 0.08, -d / 2 + 0.08],
    [w / 2 - 0.08, -d / 2 + 0.08],
    [-w / 2 + 0.08, d / 2 - 0.08],
    [w / 2 - 0.08, d / 2 - 0.08],
  ];
  return (
    <group>
      <mesh position-y={tableY} castShadow receiveShadow>
        <boxGeometry args={[w, 0.08, d]} />
        <meshStandardMaterial color="#a1887f" />
      </mesh>
      {/* Crates of tomatoes. */}
      {[-1, 0, 1].map((k) => (
        <mesh key={k} position={[0, tableY + 0.14, (k * d) / 3.2]} castShadow>
          <boxGeometry args={[w * 0.7, 0.2, d / 3.6]} />
          <meshStandardMaterial color="#d62a1e" />
        </mesh>
      ))}
      {legs.map(([x, z], i) => (
        <mesh key={i} position={[x, awningY / 2, z]} castShadow>
          <boxGeometry args={[0.06, awningY, 0.06]} />
          <meshStandardMaterial color="#5d4037" />
        </mesh>
      ))}
      {/* The awning, tilted towards the street. */}
      <mesh position-y={awningY} rotation-z={0.2} castShadow>
        <boxGeometry args={[w * 1.25, 0.04, d * 1.1]} />
        <meshStandardMaterial color="#f5f5f5" />
      </mesh>
      <mesh position={[0, awningY + 0.03, 0]} rotation-z={0.2}>
        <boxGeometry args={[w * 1.26, 0.04, d * 0.35]} />
        <meshStandardMaterial color="#c62828" />
      </mesh>
    </group>
  );
}

/** The props the level places itself; shops are generated each round and drawn by ShopView (#83). */
export type LevelPropKind = Exclude<PropKind, ShopKind>;

export const PROP_LOOKS: Readonly<Record<LevelPropKind, PropLook>> = {
  bin: {
    intact: () => <Bin broken={false} />,
    broken: () => <Bin broken />,
    debris: { y: 1, count: 14, colors: ["#1b5e20", "#a1887f", "#fff59d", "#90a4ae"], size: 0.18, speed: 5 },
  },
  bus_shelter: {
    intact: () => <BusShelter broken={false} />,
    broken: () => <BusShelter broken />,
    debris: { y: 1.8, count: 28, colors: ["#a5d8ff", "#e3f2fd", "#81d4fa"], size: 0.16, speed: 6 },
  },
  car: {
    intact: () => <Car broken={false} />,
    broken: () => <Car broken />,
    debris: { y: 1, count: 30, colors: ["#c62828", "#212121", "#a5d8ff", "#9e9e9e"], size: 0.22, speed: 7 },
    alarm: true,
  },
  market_stall: {
    intact: () => <MarketStall broken={false} />,
    broken: () => <MarketStall broken />,
    debris: { y: 1.2, count: 24, colors: ["#d62a1e", "#e53935", "#8d6e63", "#f5f5f5"], size: 0.16, speed: 6 },
  },
};
