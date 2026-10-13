import { useEffect } from "react";
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
import { useJumpInput } from "../jump/index.ts";
import { useInteractInput } from "../interact/index.ts";
import { RescueHud } from "../rescue/index.ts";
import { GasOverlay } from "../gas/index.ts";
import { FireHud } from "../fire/index.ts";
import { CarryHud } from "../carry/index.ts";
import { EndScreen, RoundHud } from "../round/index.ts";
import { TouchControls, useInputMode } from "../touch/index.ts";
import { HelpMenu, HelpTip } from "../help/index.ts";

/**
 * The street, while marching and on the end screen (#12). Not mounted on the
 * homepage or the lobby screen, so keyboard input never reaches their fields.
 */
export function Game({ snap }: { snap: NetSnapshot }) {
  useMoveInput();
  useAttackInput();
  useDodgeInput();
  useJumpInput();
  useInteractInput();
  // Touch mode also caps the pixel ratio: phones pay for every pixel of the fire and gas layers.
  const touch = useInputMode() === "touch";
  const ended = snap.phase === Phase.Ended;

  // No page scroll, zoom, selection or long-press menu while playing (#42). On
  // <html> rather than everywhere, so the homepage's fields keep working.
  useEffect(() => {
    document.documentElement.classList.add("playing");
    return () => document.documentElement.classList.remove("playing");
  }, []);

  return (
    <>
      <Canvas
        shadows="percentage"
        orthographic
        dpr={[1, touch ? 1.5 : 2]}
        camera={{ position: CAMERA_OFFSET.toArray(), zoom: 40, near: 0.1, far: 200 }}
      >
        <Scene players={snap.players} crs={snap.crs} localId={snap.sessionId} />
      </Canvas>
      <GasOverlay localId={snap.sessionId} />
      {ended && <EndScreen localId={snap.sessionId} />}
      {/* Before the HUD, so the HUD's buttons stay on top of the stick zone. */}
      {touch && snap.phase === Phase.Marching && <TouchControls localId={snap.sessionId} players={snap.players} />}
      {/* One overlay, three spots: the player's panel, the round, and the buttons. The panel
          and the round go away on the end screen; the leave button never moves. */}
      <div className="hud" data-touch={touch || undefined} data-ended={ended || undefined}>
        {!ended && (
          <div className="hud-panel">
            <p className="hud-room">
              manif <b>{snap.roomId}</b> · {snap.players.length}/{MAX_PLAYERS} manifestants
            </p>
            <HealthHud localId={snap.sessionId} />
            <DodgeHud localId={snap.sessionId} touch={touch} />
            <RescueHud localId={snap.sessionId} players={snap.players} touch={touch} />
            <FireHud localId={snap.sessionId} players={snap.players} touch={touch} />
            <CarryHud localId={snap.sessionId} players={snap.players} touch={touch} />
            <HelpTip localId={snap.sessionId} players={snap.players} touch={touch} />
            {import.meta.env.DEV && <DebugKnockbackKeys />}
          </div>
        )}
        {!ended && <RoundHud />}
        <div className="hud-corner">
          {!ended && <HelpMenu touch={touch} />}
          <button type="button" className="hud-chip hud-leave" onClick={() => net.leave()}>
            Rentrer à la maison
          </button>
        </div>
      </div>
    </>
  );
}
