import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { App } from "./App.tsx";
import { scrubBreadcrumb, scrubEvent } from "./errorReport.ts";
import { loadSavedName } from "../features/home/index.ts";
import { net, readInviteCode } from "../shared/net/index.ts";
import { startAudio } from "../features/audio/index.ts";
import "./styles.css";

// Error tracking with Rustrak (Sentry-protocol). The DSN is a public ingest
// key, inlined at build time (VITE_SENTRY_DSN, see apps/client/Dockerfile).
// Unset in dev, which just turns reporting off. Reports never carry a lobby
// code or console lines (errorReport.ts).
const dsn = import.meta.env.VITE_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubEvent,
  });
}

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing");

// No connection on page load, with one exception: an invite link opened by a
// player who already has a saved name goes straight into that lobby. Done here,
// outside React, so StrictMode's double effects can't join twice. A first-time
// visitor sees the homepage with the code pre-filled and picks a name first.
// The sound layer (#57) watches the room from now on, but stays silent until a click unlocks it.
startAudio();

const invite = readInviteCode();
const savedName = loadSavedName();
if (invite && savedName) void net.joinLobby(invite, savedName);

createRoot(root, {
  // React render errors don't reach window.onerror: hand them to Sentry.
  onCaughtError: Sentry.reactErrorHandler(),
  onUncaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
