import { Canvas } from "@react-three/fiber";
import { MAX_PLAYERS, Phase } from "@manif/shared";
import { net, type NetSnapshot } from "../../shared/net/index.ts";
import { CAMERA_OFFSET } from "../../shared/iso/index.ts";
import { Scene } from "./Scene.tsx";
import { useMoveInput } from "../movement/index.ts";
import { useAttackInput } from "../melee/index.ts";
import { DebugKnockbackKeys } from "../debug/index.ts";
import { HealthHud } from "../health/index.ts";
import { DodgeHud, useDodgeInput } from "../dodge/index.ts";
import { useInteractInput } from "../interact/index.ts";
import { RescueHud } from "../rescue/index.ts";
import { GasOverlay } from "../gas/index.ts";
import { EndScreen, RoundHud } from "../round/index.ts";

/**
 * The street, while marching and on the end screen (#12). Not mounted on the
 * homepage or the lobby screen, so keyboard input never reaches their fields.
 */
export function Game({ snap }: { snap: NetSnapshot }) {
  useMoveInput();
  useAttackInput();
  useDodgeInput();
  useInteractInput();

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
      <GasOverlay localId={snap.sessionId} />
      {snap.phase === Phase.Ended ? <EndScreen /> : <RoundHud />}
      <div className="hud">
        <div>
          manif <b>{snap.roomId}</b> · {snap.players.length}/{MAX_PLAYERS} manifestants
        </div>
        <HealthHud localId={snap.sessionId} />
        <DodgeHud localId={snap.sessionId} />
        <RescueHud localId={snap.sessionId} players={snap.players} />
        <div>Emmenez au moins la moitié du cortège jusqu'à la Préfecture avant la fin du chrono.</div>
        <div>WASD / flèches pour marcher · Espace / clic pour taper · Maj pour plonger · E pour ramasser un pavé, clic pour le lancer vers la souris · E (maintenu) pour libérer · sors vite des lacrymos (Maj pour plonger dehors)</div>
        {import.meta.env.DEV && <DebugKnockbackKeys />}
        <button type="button" className="hud-leave" onClick={() => net.leave()}>
          Rentrer à la maison
        </button>
      </div>
    </>
  );
}
