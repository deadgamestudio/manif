import { useSyncExternalStore } from "react";
import { Canvas } from "@react-three/fiber";
import { MAX_PLAYERS } from "@manif/shared";
import { net } from "./net.ts";
import { CAMERA_OFFSET } from "./iso.ts";
import { Scene } from "./Scene.tsx";
import { useMoveInput } from "./useMoveInput.ts";

export function App() {
  const snap = useSyncExternalStore(net.subscribe, net.getSnapshot);
  useMoveInput();

  return (
    <>
      <Canvas
        shadows="percentage"
        orthographic
        dpr={[1, 2]}
        camera={{ position: CAMERA_OFFSET.toArray(), zoom: 40, near: 0.1, far: 200 }}
      >
        <Scene playerIds={snap.playerIds} localId={snap.sessionId} />
      </Canvas>
      <div className="hud">
        <div>
          <span className="dot" data-status={snap.status} />
          {snap.status}
          {snap.error ? ` (${snap.error})` : ""}
        </div>
        <div>
          players: {snap.playerIds.length}/{MAX_PLAYERS}
        </div>
        <div>WASD / arrows to move</div>
      </div>
    </>
  );
}
