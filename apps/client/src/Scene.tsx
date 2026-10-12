import { useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Object3D, Vector3, type DirectionalLight } from "three";
import { STREET_LEVEL } from "@manif/shared";
import { CAMERA_OFFSET, damp } from "./iso.ts";
import { LevelView } from "./Level.tsx";
import { net } from "./net.ts";
import { PlayerAvatar } from "./PlayerAvatar.tsx";
import type { LobbyPlayer } from "./net.ts";

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

export function Scene({ players, localId }: { players: readonly LobbyPlayer[]; localId: string | null }) {
  return (
    <>
      <FollowRig localId={localId} />
      <color attach="background" args={["#2a2d34"]} />
      <hemisphereLight args={["#dfe8ff", "#3a3a3a", 0.8]} />

      <LevelView level={LEVEL} />

      {players.map((p) => (
        <PlayerAvatar key={p.id} id={p.id} name={p.name} isLocal={p.id === localId} />
      ))}
    </>
  );
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
        intensity={2}
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
