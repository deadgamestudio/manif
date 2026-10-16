import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import { STREET_LEVEL, allVelibDocks, type BoxKind, type BoxObstacle, type CircleKind, type CircleObstacle, type Level, type Rect } from "@manif/shared";
import { Vector3, type Object3D } from "three";
import { net } from "../../shared/net/index.ts";
import { MODELS, fitToBox, modelBounds, useGltf, useStaticModel, type GLTF } from "../models/index.ts";
import { carveBlocks } from "./blocks.ts";
import { BuildingsView, type BuildingSpec } from "./Buildings.tsx";
import { InstancedModel } from "./InstancedModel.tsx";
import { crosswalkPlacements, dashPlacements, type Placement } from "./scenery.ts";
import type { Point3 } from "./occlusion.ts";
import { PAVEMENT_COLOR, Pavements } from "./Pavements.tsx";
import { RoomsView } from "./Rooms.tsx";

/*
 * Draws the level from the shared data: the same boxes and circles the server
 * collides with, so what you see is where you stop. Static: rendered once,
 * except the buildings, which fade when they hide someone (#80).
 *
 * Jordan's models (#28) dress it: each one stretched over its collision box
 * (they are drawn to those sizes, so the stretch is about 1), and the repeated
 * ones (trees, lamps, bollards, road dashes, crosswalks) as one instanced
 * mesh per part. The pavement and its kerb are drawn in code (#102,
 * Pavements.tsx): Jordan's pavement tile sat under the asphalt but for its
 * thin kerb lip, and the edge of the road did not read. Until a model has loaded, or if it failed, the
 * flat boxes and circles stand in. The buildings stay plain blocks for now:
 * the fade needs one material per building, which the facade modules don't
 * have yet.
 */

const BOX_COLORS: Record<BoxKind, readonly string[]> = {
  building: ["#c58b6b", "#b9a07a", "#9d7a6b", "#d2a679", "#a8876f"],
  wall: ["#9e9e9e"],
  kiosk: ["#2e7d32"],
  barrier: ["#e0e0e0"],
  van: ["#1e3a8a"],
  prefecture: ["#e8e2d0"],
};

/** Lighter than real asphalt (#28): the dark CRS and outfits must stand out against it. */
const ASPHALT = "#767b84";
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
  // Same array until a new layout arrives: carved once per round, never per frame.
  const shops = useSyncExternalStore(net.subscribeShops, net.getShops);
  const { buildings, rooms, kinds } = useMemo(() => {
    const carved = carveBlocks(level, shops);
    // Colours by index in the full box list, as before buildings were split out.
    const specs = carved.blocks.map(
      (block): BuildingSpec => ({ box: block.box, pieces: block.pieces, rooms: block.rooms, color: pick(BOX_COLORS.building, block.index) }),
    );
    // Which kind each room's shop is, to dress it (#117); none for a kind this build doesn't know.
    const kindOf = new Map(shops.flatMap((lot) => (lot.unknown ? [] : [[lot.id, lot.kind] as const])));
    return { buildings: specs, rooms: carved.rooms, kinds: kindOf };
  }, [level, shops]);
  return (
    <group>
      {/* Pavement beyond the street, under the buildings. */}
      <RectMesh rect={grow(b, 30)} y={-0.02} color={PAVEMENT_COLOR} />
      {/* The walkable street: exactly the server bounds. */}
      <RectMesh rect={b} y={0} color={ASPHALT} />
      <Pavements level={level} />
      <StartZone rect={level.start} />
      <ZoneMarks rect={level.destination} color="#e53935" />
      <Forecourt rect={level.destination} />
      <CentreLine level={level} />
      <Crosswalks level={level} />
      <VelibDocks level={level} />

      <BuildingsView buildings={buildings} targets={fadeTargets} />
      <RoomsView rooms={rooms} kinds={kinds} />
      {level.boxes.map((box, i) => box.kind !== "building" && <BoxMesh key={box.id} box={box} index={i} />)}
      <CirclesView circles={level.circles} />
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

/** Dashed line down the middle of the street, between the start and the destination, broken by the crosswalks. */
function CentreLine({ level }: { level: Level }) {
  const dashes = useMemo(() => dashPlacements(level), [level]);
  const fallback = dashes.map((d) => <RectMesh key={d.z} rect={{ minX: -0.12, maxX: 0.12, minZ: d.z - 1, maxZ: d.z + 1 }} y={0.01} color={MARKING} />);
  return <InstancedModel url={MODELS.scenery.roadDash} placements={dashes} y={0.005} fallback={fallback} receiveOnly />;
}

function Crosswalks({ level }: { level: Level }) {
  const crossings = useMemo(() => crosswalkPlacements(level), [level]);
  return <InstancedModel url={MODELS.scenery.crosswalk} placements={crossings} y={0.004} receiveOnly />;
}

/** The Vélib stations' docks (#121), on the kerb. Scenery: nothing collides with them. The bikes are ground items. */
function VelibDocks({ level }: { level: Level }) {
  const docks = useMemo(() => allVelibDocks(level).map((d): Placement => ({ x: d.dock.x, z: d.dock.z, yaw: d.yaw })), [level]);
  return <InstancedModel url={MODELS.throwables.velibDock} placements={docks} y={0.02} />;
}

/** The start zone: Jordan's "DÉPART" outline over the zone, or the green marks. */
function StartZone({ rect }: { rect: Rect }) {
  return <RectModel rect={rect} y={0.01} url={MODELS.scenery.startZone} fallback={<ZoneMarks rect={rect} color="#43a047" />} />;
}

/** The Préfecture's forecourt (gates and railings, nothing to collide with) over the destination zone. */
function Forecourt({ rect }: { rect: Rect }) {
  return <RectModel rect={rect} y={0} url={MODELS.scenery.prefectureForecourt} fallback={null} />;
}

/** A model laid over a rectangle of the ground, keeping its own height. */
function RectModel({ rect, y, url, fallback }: { rect: Rect; y: number; url: string; fallback: ReactNode }) {
  const gltf = useGltf(url);
  const copy = useStaticModel(url);
  if (!gltf || !copy) return <>{fallback}</>;
  const h = modelBounds(gltf).getSize(new Vector3()).y;
  const fit = fitToBox(gltf, [rect.maxX - rect.minX, h, rect.maxZ - rect.minZ]);
  return (
    <group position={[(rect.minX + rect.maxX) / 2, y, (rect.minZ + rect.maxZ) / 2]} scale={fit.scale}>
      <primitive object={copy} position={fit.offset} dispose={null} />
    </group>
  );
}

/**
 * A police van, the "panier à salade" (#70: where the CRS drag people):
 * Jordan's model (#28) stretched over the collision box, or until it has
 * loaded (or if it failed), the box in police blue with a white stripe and a
 * blue light bar on the roof, so it reads as a van from far off.
 */
function VanMesh({ box }: { box: BoxObstacle }) {
  const van = useStaticModel(MODELS.police.policeVan);
  const gltf = useGltf(MODELS.police.policeVan);
  if (van && gltf) return <VanModel box={box} van={van} gltf={gltf} />;
  return <VanPlaceholder box={box} />;
}

/**
 * The model is 2.4 × 2.4 × 5 m with its nose on +Z, like the boxes: parked
 * along the street, nose down the right-hand lane (towards the Préfecture
 * on the +X side, away from it on the -X side); across it if a box is ever
 * longer in X.
 */
function VanModel({ box, van, gltf }: { box: BoxObstacle; van: Object3D; gltf: GLTF }) {
  const long = box.halfZ >= box.halfX;
  const yaw = long ? (box.x > 0 ? Math.PI : 0) : box.z > 0 ? -Math.PI / 2 : Math.PI / 2;
  const width = (long ? box.halfX : box.halfZ) * 2;
  const length = (long ? box.halfZ : box.halfX) * 2;
  const fit = fitToBox(gltf, [width, box.height, length]);
  return (
    <group position={[box.x, 0, box.z]} rotation-y={yaw}>
      <group scale={fit.scale}>
        <primitive object={van} position={fit.offset} dispose={null} />
      </group>
    </group>
  );
}

function VanPlaceholder({ box }: { box: BoxObstacle }) {
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

/** The model of a level box, or null for a plain block. Walls by their length: works-1 is 7 m, works-2 6.5 m. */
function boxModelUrl(box: BoxObstacle): string | null {
  switch (box.kind) {
    case "kiosk":
      return MODELS.scenery.newspaperKiosk;
    case "barrier":
      return MODELS.scenery.sideStreetBarrier;
    case "prefecture":
      return MODELS.scenery.prefecture;
    case "wall":
      if (box.id === "start-wall") return MODELS.scenery.startWall;
      return Math.max(box.halfX, box.halfZ) * 2 >= 6.75 ? MODELS.scenery.constructionWall7 : MODELS.scenery.constructionWall6_5;
    default:
      return null;
  }
}

function BoxMesh({ box, index }: { box: BoxObstacle; index: number }) {
  if (box.kind === "van") return <VanMesh box={box} />;
  const color = pick(BOX_COLORS[box.kind], index);
  const block = (
    <mesh position={[box.x, box.height / 2, box.z]} castShadow receiveShadow>
      <boxGeometry args={[box.halfX * 2, box.height, box.halfZ * 2]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
  const url = boxModelUrl(box);
  if (!url) return block;
  // The barriers on the right-hand side turned round, so both sides show the same face to the street.
  return <BoxModel box={box} url={url} yaw={box.kind === "barrier" && box.x > 0 ? Math.PI : 0} fallback={block} />;
}

/** Jordan's model stretched over a box (front +Z, the way the boxes are laid out), or `fallback`. */
function BoxModel({ box, url, yaw, fallback }: { box: BoxObstacle; url: string; yaw: number; fallback: ReactNode }) {
  const gltf = useGltf(url);
  const copy = useStaticModel(url);
  if (!gltf || !copy) return <>{fallback}</>;
  const fit = fitToBox(gltf, [box.halfX * 2, box.height, box.halfZ * 2]);
  return (
    <group position={[box.x, 0, box.z]} rotation-y={yaw}>
      <group scale={fit.scale}>
        <primitive object={copy} position={fit.offset} dispose={null} />
      </group>
    </group>
  );
}

const CIRCLE_MODELS: Readonly<Record<CircleKind, string>> = {
  tree: MODELS.scenery.tree,
  lamp: MODELS.scenery.lampPost,
  bollard: MODELS.scenery.bollard,
};

/** Trees, lamp posts and bollards: one instanced model per kind, each kind falling back to its circles on its own. */
function CirclesView({ circles }: { circles: readonly CircleObstacle[] }) {
  const byKind = useMemo(() => {
    const out = new Map<CircleKind, CircleObstacle[]>();
    for (const c of circles) out.set(c.kind, [...(out.get(c.kind) ?? []), c]);
    return [...out];
  }, [circles]);
  return (
    <>
      {byKind.map(([kind, list]) => (
        <CircleKindView key={kind} kind={kind} list={list} />
      ))}
    </>
  );
}

function CircleKindView({ kind, list }: { kind: CircleKind; list: readonly CircleObstacle[] }) {
  const placements = useMemo(() => list.map((c): Placement => ({ x: c.x, z: c.z, yaw: 0 })), [list]);
  const fallback = list.map((c) => <CircleMesh key={c.id} c={c} />);
  return <InstancedModel url={CIRCLE_MODELS[kind]} placements={placements} fallback={fallback} />;
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
