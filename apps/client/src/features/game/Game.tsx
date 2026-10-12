import { Canvas } from "@react-three/fiber";
import { MAX_PLAYERS } from "@manif/shared";
import { net, type NetSnapshot } from "../../shared/net/index.ts";
import { CAMERA_OFFSET } from "../../shared/iso/index.ts";
import { Scene } from "./Scene.tsx";
import { useMoveInput } from "../movement/index.ts";
import { useAttackInput } from "../melee/index.ts";
import { DebugKnockbackKeys } from "../debug/index.ts";
import { HealthHud } from "../health/index.ts";
import { DodgeHud, useDodgeInput } from "../dodge/index.ts";

/** The street. Mounted only while playing, so keyboard input never reaches the homepage fields. */
export function Game({ snap }: { snap: NetSnapshot }) {
  useMoveInput();
  useAttackInput();
  useDodgeInput();

  return (
    <>
      <Canvas
        shadows="percentage"
        orthographic
        dpr={[1, 2]}
        camera={{ position: CAMERA_OFFSET.toArray(), zoom: 40, near: 0.1, far: 200 }}
      >
        <Scene players={snap.players} crs={snap.crs} localId={snap.sessionId} />
      </Canvas>
      <div className="hud">
        <div>
          manif <b>{snap.roomId}</b> · {snap.players.length}/{MAX_PLAYERS} manifestants
        </div>
        <HealthHud localId={snap.sessionId} />
        <DodgeHud localId={snap.sessionId} />
        <div>WASD / flèches pour marcher · Espace / clic pour taper · Maj pour plonger</div>
        {import.meta.env.DEV && <DebugKnockbackKeys />}
        <button type="button" className="hud-leave" onClick={() => net.leave()}>
          Rentrer à la maison
        </button>
      </div>
    </>
  );
}
