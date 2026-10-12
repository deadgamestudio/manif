import { Suspense, lazy, useSyncExternalStore } from "react";
import { Phase } from "@manif/shared";
import { net } from "./net.ts";
import { Home } from "./Home.tsx";
import { Lobby } from "./Lobby.tsx";

// three.js and the scene load only when the march starts, so the homepage stays light.
const Game = lazy(() => import("./Game.tsx").then((m) => ({ default: m.Game })));

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
