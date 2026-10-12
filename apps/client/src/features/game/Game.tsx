import { Canvas } from "@react-three/fiber";
import { MAX_PLAYERS } from "@manif/shared";
import { net, type NetSnapshot } from "../../shared/net/index.ts";
import { CAMERA_OFFSET } from "../../shared/iso/index.ts";
import { Scene } from "./Scene.tsx";
import { useMoveInput } from "../movement/index.ts";

/** The street. Mounted only while playing, so keyboard input never reaches the homepage fields. */
export function Game({ snap }: { snap: NetSnapshot }) {
  useMoveInput();

  return (
    <>
      <Canvas
        shadows="percentage"
        orthographic
        dpr={[1, 2]}
        camera={{ position: CAMERA_OFFSET.toArray(), zoom: 40, near: 0.1, far: 200 }}
      >
        <Scene players={snap.players} localId={snap.sessionId} />
      </Canvas>
      <div className="hud">
        <div>
          manif <b>{snap.roomId}</b> · {snap.players.length}/{MAX_PLAYERS} manifestants
        </div>
        <div>WASD / flèches pour marcher</div>
        <button type="button" className="hud-leave" onClick={() => net.leave()}>
          Rentrer à la maison
        </button>
      </div>
    </>
  );
}
