import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { MAP_SIZE } from "@manif/shared";
import { CAMERA_OFFSET, damp } from "./iso.ts";
import { net } from "./net.ts";
import { PlayerAvatar } from "./PlayerAvatar.tsx";

// Placeholder scenery: [x, z, width, height, depth, colour]
const BOXES: ReadonlyArray<readonly [number, number, number, number, number, string]> = [
  [-8, -6, 4, 3, 2, "#8d6e63"],
  [7, -9, 2, 1.2, 2, "#546e7a"],
  [10, 6, 6, 4, 3, "#a1887f"],
  [-12, 9, 3, 2, 3, "#78909c"],
  [2, 12, 1, 1, 1, "#ef6c00"],
  [-3, -14, 5, 1, 1, "#9e9e9e"],
];

export function Scene({ playerIds, localId }: { playerIds: readonly string[]; localId: string | null }) {
  return (
    <>
      <CameraRig localId={localId} />
      <color attach="background" args={["#2a2d34"]} />
      <hemisphereLight args={["#dfe8ff", "#3a3a3a", 0.8]} />
      <directionalLight
        castShadow
        position={[15, 25, 10]}
        intensity={2}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-MAP_SIZE * 0.75}
        shadow-camera-right={MAP_SIZE * 0.75}
        shadow-camera-top={MAP_SIZE * 0.75}
        shadow-camera-bottom={-MAP_SIZE * 0.75}
        shadow-camera-near={1}
        shadow-camera-far={80}
      />

      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[MAP_SIZE, MAP_SIZE]} />
        <meshStandardMaterial color="#5b5f66" />
      </mesh>
      <gridHelper args={[MAP_SIZE, MAP_SIZE / 2, "#6c7079", "#646870"]} position-y={0.01} />

      {BOXES.map(([x, z, w, h, d, color], i) => (
        <mesh key={i} position={[x, h / 2, z]} castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}

      {playerIds.map((id) => (
        <PlayerAvatar key={id} id={id} isLocal={id === localId} />
      ))}
    </>
  );
}

/** Keeps the orthographic camera at the isometric offset, smoothly following the local player. */
function CameraRig({ localId }: { localId: string | null }) {
  const camera = useThree((s) => s.camera);
  const target = useRef(new Vector3());

  useFrame((_, dt) => {
    const p = localId ? net.getPlayer(localId) : undefined;
    if (p) {
      const k = damp(4, dt);
      target.current.x += (p.x - target.current.x) * k;
      target.current.z += (p.z - target.current.z) * k;
    }
    camera.position.copy(target.current).add(CAMERA_OFFSET);
    camera.lookAt(target.current);
  });

  return null;
}
