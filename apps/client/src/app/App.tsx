import { useEffect, useRef, useSyncExternalStore } from "react";
import { Phase } from "@manif/shared";
import { net } from "../shared/net/index.ts";
import { Home } from "../features/home/index.ts";
import { Lobby } from "../features/lobby/index.ts";
import { HelpOverlay, HelpPage, closeHelp, useHelpOpen } from "../features/help/index.ts";
import { lazyModule } from "./lazyModule.ts";

// three.js and the scene (#88) are a chunk of their own: the homepage and /aide
// never fetch it, the lobby fetches it while players gather.
const game = lazyModule(() => import("../features/game/index.ts"));

/**
 * Homepage until a room is joined, then the lobby screen (`waiting`), then the
 * street (marching, then the end screen). `/aide` (#71) is the help: a page of
 * its own out of a room, an overlay on top of the lobby or the street in one.
 */
export function App() {
  const snap = useSyncExternalStore(net.subscribe, net.getSnapshot);
  const helpOpen = useHelpOpen();
  const connected = snap.status === "connected";
  const screen = !connected ? null : snap.phase === Phase.Marching || snap.phase === Phase.Ended ? "game" : snap.phase === Phase.Waiting ? "lobby" : null;
  const scene = useSyncExternalStore(game.subscribe, game.getSnapshot);

  // In a room: get the scene now, so Start (or joining mid-round) doesn't wait on the download.
  useEffect(() => {
    if (screen !== null) game.load();
  }, [screen]);

  // The march starting, or the room going away, closes the overlay: the player has somewhere else to look.
  const lastScreen = useRef(screen);
  useEffect(() => {
    const before = lastScreen.current;
    lastScreen.current = screen;
    if (before !== null && before !== screen) closeHelp(screen === null ? "replace" : "back");
  }, [screen]);

  const overlay = helpOpen && <HelpOverlay />;
  if (screen === "game") {
    return (
      <>
        {scene.status === "ready" ? (
          <scene.module.Game snap={snap} />
        ) : scene.status === "failed" ? (
          <NewVersion />
        ) : (
          <div className="screen loading">En route…</div>
        )}
        {overlay}
      </>
    );
  }
  if (screen === "lobby") {
    return (
      <>
        <Lobby snap={snap} />
        {scene.status === "failed" && <NewVersion banner />}
        {overlay}
      </>
    );
  }
  // idle, error, connecting, or connected but waiting for the first state
  return helpOpen ? <HelpPage /> : <Home snap={snap} />;
}

/**
 * The scene's chunk didn't download. Almost always a tab opened before a
 * deploy, asking for a file that no longer exists: a reload fetches the new
 * version (and an invite link in the address bar rejoins the room).
 */
function NewVersion({ banner = false }: { banner?: boolean }) {
  return (
    <div className={banner ? "new-version banner" : "screen new-version"} role="alert">
      <p>Nouvelle version du jeu, recharge la page.</p>
      <button type="button" className="btn" onClick={() => location.reload()}>
        Recharger
      </button>
    </div>
  );
}
