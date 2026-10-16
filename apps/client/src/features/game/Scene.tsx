import { useCallback, useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Object3D, Vector3, type DirectionalLight } from "three";
import { CrsStatus, STREET_LEVEL, isBotId } from "@manif/shared";
import { CAMERA_OFFSET, damp } from "../../shared/iso/index.ts";
import { LevelView, type Point3 } from "../level/index.ts";
import { net } from "../../shared/net/index.ts";
import { PlayerAvatar } from "../player/index.ts";
import { PropsView } from "../prop/index.ts";
import { CrsView, DragTargets } from "../crs/index.ts";
import { AimTracker, ThrowablesView } from "../throwable/index.ts";
import { GasView } from "../gas/index.ts";
import { FiresView } from "../fire/index.ts";
import { TrucksView } from "../pompier/index.ts";
import { MoluchanView } from "../moluchan/index.ts";
import { DouaneView } from "../douane/index.ts";
import { GrabPairs } from "../grab/index.ts";
import { bodyUrlFor, preloadModels, roundPreloadGroups } from "../models/index.ts";
import type { LobbyPlayer } from "../../shared/net/index.ts";

const LEVEL = STREET_LEVEL;
/** Where the camera looks before the local player shows up: the start zone. */
const START_CENTRE = new Vector3(
  (LEVEL.start.minX + LEVEL.start.maxX) / 2,
  0,
  (LEVEL.start.minZ + LEVEL.start.maxZ) / 2,
);
/** Sun direction, relative to the followed point. */
const SUN_OFFSET = new Vector3(15, 25, 10);
/** Half size of the shadow box around the followed point. The street is too long to shadow all at once. */
const SHADOW_HALF = 30;
/**
 * Lighting (#28): Jordan's models are realistic and dark (near-black CRS,
 * navy vans, dark outfits), so the street is lit brighter than for the old
 * bright placeholders: a strong soft sky fill (no shadows, costs nothing on
 * phones) plus the one shadow-casting sun, over a lighter asphalt (Level.tsx).
 */
const BACKGROUND = "#3b4048";
const SKY = "#e8efff";
/** Light bounced off the street, warm and fairly bright so dark clothes keep some shape from below. */
const GROUND_BOUNCE = "#8a8272";
const SKY_FILL = 1.9;
const SUN_INTENSITY = 2.6;
/** Height of the point on a character that a building must not hide (#80): about the chest. */
const BODY_Y = 1;

export function Scene({
  players,
  crs,
  localId,
}: {
  players: readonly LobbyPlayer[];
  crs: readonly string[];
  localId: string | null;
}) {
  const ids = players.map((p) => p.id);
  const fadeTargets = useFadeTargets(ids, crs);
  usePreloadModels(players);
  return (
    <>
      <FollowRig localId={localId} />
      <AimTracker />
      <color attach="background" args={[BACKGROUND]} />
      <hemisphereLight args={[SKY, GROUND_BOUNCE, SKY_FILL]} />

      <LevelView level={LEVEL} fadeTargets={fadeTargets} />
      <PropsView level={LEVEL} />

      {players.map((p) => (
        <PlayerAvatar key={p.id} id={p.id} name={p.name} isLocal={p.id === localId} bot={isBotId(p.id)} />
      ))}
      <CrsView ids={crs} />
      <GrabPairs />
      {/* #70: the van each grabbed protester is dragged to, and the local player's off-screen arrow. */}
      <DragTargets ids={ids} localId={localId} />
      <ThrowablesView />
      <GasView />
      <FiresView />
      <TrucksView />
      <MoluchanView />
      <DouaneView />
    </>
  );
}

/**
 * Starts fetching Jordan's models (#28) as soon as the street is drawn, the
 * bodies of who is here first. Placeholders stand in until each one arrives.
 * Again when someone joins or changes archetype: what is cached costs nothing.
 */
function usePreloadModels(players: readonly LobbyPlayer[]) {
  // A string, so the effect only runs again when the set of bodies changes, not with each new players array.
  const bodies = [...new Set(players.map((p) => bodyUrlFor(p.archetype, p.id)))].sort().join(" ");
  useEffect(() => {
    preloadModels(roundPreloadGroups(bodies ? bodies.split(" ") : []));
  }, [bodies]);
}

/**
 * Who the buildings fade for (#80): every protester, human or bot (the local
 * player among them), and any CRS holding someone, so a friend dragged
 * behind a building stays in sight. Reuses its points: it runs ~10 times a second.
 */
function useFadeTargets(playerIds: readonly string[], crsIds: readonly string[]): () => readonly Point3[] {
  return useCallback(() => {
    FADE_TARGETS.length = 0;
    for (const id of playerIds) {
      const p = net.getPlayer(id);
      if (p) addFadeTarget(p.x, p.z);
    }
    for (const id of crsIds) {
      const c = net.getCrs(id);
      if (c && c.status === CrsStatus.Grabbing) addFadeTarget(c.x, c.z);
    }
    return FADE_TARGETS;
  }, [playerIds, crsIds]);
}

// Scratch for useFadeTargets, reused so the test makes no garbage. One Scene at a time.
const FADE_POINTS: Point3[] = [];
const FADE_TARGETS: Point3[] = [];
function addFadeTarget(x: number, z: number) {
  const point = FADE_POINTS[FADE_TARGETS.length] ?? { x: 0, y: BODY_Y, z: 0 };
  FADE_POINTS[FADE_TARGETS.length] = point;
  point.x = x;
  point.z = z;
  FADE_TARGETS.push(point);
}

/**
 * Keeps the orthographic camera at the isometric offset, smoothly following the
 * local player, and moves the sun's shadow box along with it.
 */
function FollowRig({ localId }: { localId: string | null }) {
  const camera = useThree((s) => s.camera);
  const target = useRef(START_CENTRE.clone());
  const light = useRef<DirectionalLight>(null);
  // Created once; the light aims at it and it moves with the camera target.
  const [lightTarget] = useState(() => new Object3D());

  useFrame((_, dt) => {
    const p = localId ? net.getPlayer(localId) : undefined;
    if (p) {
      const k = damp(4, dt);
      target.current.x += (p.x - target.current.x) * k;
      target.current.z += (p.z - target.current.z) * k;
    }
    camera.position.copy(target.current).add(CAMERA_OFFSET);
    camera.lookAt(target.current);

    const l = light.current;
    if (l) {
      lightTarget.position.copy(target.current);
      lightTarget.updateMatrixWorld();
      l.position.copy(target.current).add(SUN_OFFSET);
    }
  });

  return (
    <>
      <primitive object={lightTarget} />
      <directionalLight
        ref={light}
        target={lightTarget}
        castShadow
        intensity={SUN_INTENSITY}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-SHADOW_HALF}
        shadow-camera-right={SHADOW_HALF}
        shadow-camera-top={SHADOW_HALF}
        shadow-camera-bottom={-SHADOW_HALF}
        shadow-camera-near={1}
        shadow-camera-far={100}
      />
    </>
  );
}
