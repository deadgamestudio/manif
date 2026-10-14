import { useMemo } from "react";
import { STREET_LEVEL, type BoxKind, type BoxObstacle, type CircleObstacle, type Level, type Rect } from "@manif/shared";
import { BuildingsView, type BuildingSpec } from "./Buildings.tsx";
import type { Point3 } from "./occlusion.ts";

/*
 * Draws the level from the shared data: the same boxes and circles the server
 * collides with, so what you see is where you stop. Static: rendered once,
 * except the buildings, which fade when they hide someone (#80).
 */

const BOX_COLORS: Record<BoxKind, readonly string[]> = {
  building: ["#c58b6b", "#b9a07a", "#9d7a6b", "#d2a679", "#a8876f"],
  wall: ["#9e9e9e"],
  kiosk: ["#2e7d32"],
  barrier: ["#e0e0e0"],
  van: ["#1e3a8a"],
  prefecture: ["#e8e2d0"],
};

const ASPHALT = "#4a4e55";
const PAVEMENT = "#6b6f76";
const MARKING = "#d8d8d0";

export function LevelView({
  level = STREET_LEVEL,
  fadeTargets,
}: {
  level?: Level;
  /** Where the characters that must stay visible are, read a few times a second (#80). */
  fadeTargets?: () => readonly Point3[];
}) {
  const b = level.bounds;
  // Colours by index in the full box list, as before buildings were split out.
  const buildings = useMemo(
    () =>
      level.boxes.flatMap((box, i): BuildingSpec[] =>
        box.kind === "building" ? [{ box, color: pick(BOX_COLORS.building, i) }] : [],
      ),
    [level],
  );
  return (
    <group>
      {/* Pavement beyond the street, under the buildings. */}
      <RectMesh rect={grow(b, 30)} y={-0.02} color={PAVEMENT} />
      {/* The walkable street: exactly the server bounds. */}
      <RectMesh rect={b} y={0} color={ASPHALT} />
      <ZoneMarks rect={level.start} color="#43a047" />
      <ZoneMarks rect={level.destination} color="#e53935" />
      <CentreLine level={level} />

      <BuildingsView buildings={buildings} targets={fadeTargets} />
      {level.boxes.map((box, i) => box.kind !== "building" && <BoxMesh key={box.id} box={box} index={i} />)}
      {level.circles.map((c) => (
        <CircleMesh key={c.id} c={c} />
      ))}
    </group>
  );
}

function pick(palette: readonly string[], index: number): string {
  return palette[index % palette.length] ?? "#999999";
}

function grow(r: Rect, by: number): Rect {
  return { minX: r.minX - by, maxX: r.maxX + by, minZ: r.minZ - by, maxZ: r.maxZ + by };
}

function RectMesh({ rect, y, color, opacity = 1 }: { rect: Rect; y: number; color: string; opacity?: number }) {
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[(rect.minX + rect.maxX) / 2, y, (rect.minZ + rect.maxZ) / 2]}
      receiveShadow
    >
      <planeGeometry args={[rect.maxX - rect.minX, rect.maxZ - rect.minZ]} />
      <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
}

/** A translucent zone with a solid border. */
function ZoneMarks({ rect, color }: { rect: Rect; color: string }) {
  const t = 0.3;
  const edges: Rect[] = [
    { minX: rect.minX, maxX: rect.maxX, minZ: rect.minZ, maxZ: rect.minZ + t },
    { minX: rect.minX, maxX: rect.maxX, minZ: rect.maxZ - t, maxZ: rect.maxZ },
    { minX: rect.minX, maxX: rect.minX + t, minZ: rect.minZ, maxZ: rect.maxZ },
    { minX: rect.maxX - t, maxX: rect.maxX, minZ: rect.minZ, maxZ: rect.maxZ },
  ];
  return (
    <>
      <RectMesh rect={rect} y={0.01} color={color} opacity={0.25} />
      {edges.map((e, i) => (
        <RectMesh key={i} rect={e} y={0.02} color={color} />
      ))}
    </>
  );
}

/** Dashed line down the middle of the street, between the start and the destination. */
function CentreLine({ level }: { level: Level }) {
  const dashes: number[] = [];
  for (let z = level.destination.maxZ + 2; z < level.start.minZ - 2; z += 4) dashes.push(z);
  return (
    <>
      {dashes.map((z) => (
        <RectMesh key={z} rect={{ minX: -0.12, maxX: 0.12, minZ: z, maxZ: z + 2 }} y={0.01} color={MARKING} />
      ))}
    </>
  );
}

/**
 * A police van, the "panier à salade" (#70: where the CRS drag people):
 * the collision box in police blue, a white stripe along it and a blue light
 * bar on the roof, so it reads as a van from far off. Placeholder until the real model (#28).
 */
function VanMesh({ box }: { box: BoxObstacle }) {
  const long = box.halfZ >= box.halfX;
  const stripe: [number, number, number] = long ? [box.halfX * 2 + 0.02, 0.25, box.halfZ * 2 - 0.4] : [box.halfX * 2 - 0.4, 0.25, box.halfZ * 2 + 0.02];
  return (
    <group position={[box.x, 0, box.z]}>
      <mesh position-y={box.height / 2} castShadow receiveShadow>
        <boxGeometry args={[box.halfX * 2, box.height, box.halfZ * 2]} />
        <meshStandardMaterial color={BOX_COLORS.van[0]} />
      </mesh>
      <mesh position-y={box.height * 0.55}>
        <boxGeometry args={stripe} />
        <meshStandardMaterial color="#f5f5f5" />
      </mesh>
      <mesh position-y={box.height + 0.1}>
        <boxGeometry args={long ? [0.9, 0.2, 0.35] : [0.35, 0.2, 0.9]} />
        <meshStandardMaterial color="#4f8cff" emissive="#4f8cff" emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

function BoxMesh({ box, index }: { box: BoxObstacle; index: number }) {
  if (box.kind === "van") return <VanMesh box={box} />;
  const color = pick(BOX_COLORS[box.kind], index);
  return (
    <mesh position={[box.x, box.height / 2, box.z]} castShadow receiveShadow>
      <boxGeometry args={[box.halfX * 2, box.height, box.halfZ * 2]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function CircleMesh({ c }: { c: CircleObstacle }) {
  switch (c.kind) {
    case "tree":
      return (
        <group position={[c.x, 0, c.z]}>
          {/* The trunk is the collision circle; the crown is up above heads. */}
          <mesh position-y={c.height / 2} castShadow>
            <cylinderGeometry args={[c.r, c.r, c.height, 16]} />
            <meshStandardMaterial color="#6d4c41" />
          </mesh>
          <mesh position-y={c.height + 0.6} castShadow>
            <sphereGeometry args={[1.8, 16, 12]} />
            <meshStandardMaterial color="#558b2f" />
          </mesh>
        </group>
      );
    case "lamp":
      return (
        <group position={[c.x, 0, c.z]}>
          <mesh position-y={0.4} castShadow>
            <cylinderGeometry args={[c.r, c.r, 0.8, 16]} />
            <meshStandardMaterial color="#37474f" />
          </mesh>
          <mesh position-y={c.height / 2} castShadow>
            <cylinderGeometry args={[0.12, 0.12, c.height, 8]} />
            <meshStandardMaterial color="#37474f" />
          </mesh>
          <mesh position-y={c.height}>
            <sphereGeometry args={[0.35, 12, 8]} />
            <meshStandardMaterial color="#fff59d" emissive="#fff59d" emissiveIntensity={0.6} />
          </mesh>
        </group>
      );
    case "bollard":
      return (
        <mesh position={[c.x, c.height / 2, c.z]} castShadow>
          <cylinderGeometry args={[c.r * 0.85, c.r, c.height, 16]} />
          <meshStandardMaterial color="#5d4037" />
        </mesh>
      );
  }
}
