import { Suspense, lazy, useSyncExternalStore } from "react";
import { Phase } from "@manif/shared";
import { net } from "../shared/net/index.ts";
import { Home } from "../features/home/index.ts";
import { Lobby } from "../features/lobby/index.ts";

// three.js and the scene load only when the march starts, so the homepage stays light.
const Game = lazy(() => import("../features/game/index.ts").then((m) => ({ default: m.Game })));

/** Homepage until a room is joined, then the lobby screen, then the street. */
export function App() {
  const snap = useSyncExternalStore(net.subscribe, net.getSnapshot);

  if (snap.status === "connected" && snap.phase === Phase.Playing) {
    return (
      <Suspense fallback={<div className="screen loading">En route…</div>}>
        <Game snap={snap} />
      </Suspense>
    );
  }
  if (snap.status === "connected" && snap.phase === Phase.Lobby) return <Lobby snap={snap} />;
  // idle, error, connecting, or connected but waiting for the first state
  return <Home snap={snap} />;
}
