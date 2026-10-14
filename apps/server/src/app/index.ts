import * as Sentry from "@sentry/node";
import { createEndpoint, createRouter, defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DEFAULT_SERVER_PORT, ROOM_NAME } from "@manif/shared";
import { StreetRoom } from "../rooms/StreetRoom.js";
import { scoreStore } from "../features/score/index.js";

const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);

// Error tracking with Rustrak (Sentry-protocol). The DSN is a public ingest
// key, passed at runtime by docker-compose (SENTRY_DSN). Unset in dev, which
// just turns reporting off. Console lines are not kept as breadcrumbs: the
// room's logs name players and carry lobby codes, which stay on this server.
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    beforeBreadcrumb: (crumb) => (crumb.category === "console" ? null : crumb),
  });
}

/** Answers 200 while the server is up. The Docker healthcheck polls it (see apps/server/Dockerfile). */
const health = createEndpoint("/health", { method: "GET" }, async () => ({ ok: true }));

// The lasting totals (#41): opened at boot so a broken database shows in the
// logs straight away (the game runs anyway, with round scores only).
const scores = scoreStore();

/** The top of the lasting leaderboard (#41): names, totals and rounds only, never a token. */
const leaderboard = createEndpoint("/leaderboard", { method: "GET" }, async () => {
  const { available, top } = scores.leaderboard(null);
  return { available, top };
});

// SIGTERM (a redeploy: `docker stop` sends it to node, PID 1 in the
// container) and SIGINT run Colyseus' graceful shutdown: every room is
// disposed, its clients disconnected, then the process exits 0.
const server = defineServer({
  gracefullyShutdown: true,
  transport: new WebSocketTransport(),
  rooms: {
    [ROOM_NAME]: defineRoom(StreetRoom),
  },
  routes: createRouter({ health, leaderboard }),
});
server.onBeforeShutdown(() => console.log("manif server shutting down"));
server.onShutdown(() => {
  scores.close();
  console.log("manif server shut down");
});

await server.listen(port);
console.log(`manif server listening on ws://localhost:${port}`);
