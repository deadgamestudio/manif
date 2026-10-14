import { Suspense, lazy, useEffect, useRef, useSyncExternalStore } from "react";
import { Phase } from "@manif/shared";
import { net } from "../shared/net/index.ts";
import { Home } from "../features/home/index.ts";
import { Lobby } from "../features/lobby/index.ts";
import { HelpOverlay, HelpPage, closeHelp, useHelpOpen } from "../features/help/index.ts";

// three.js and the scene load only when the march starts, so the homepage stays light.
const Game = lazy(() => import("../features/game/index.ts").then((m) => ({ default: m.Game })));

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
        <Suspense fallback={<div className="screen loading">En route…</div>}>
          <Game snap={snap} />
        </Suspense>
        {overlay}
      </>
    );
  }
  if (screen === "lobby") {
    return (
      <>
        <Lobby snap={snap} />
        {overlay}
      </>
    );
  }
  // idle, error, connecting, or connected but waiting for the first state
  return helpOpen ? <HelpPage /> : <Home snap={snap} />;
}
