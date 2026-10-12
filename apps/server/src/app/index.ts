import { createEndpoint, createRouter, defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DEFAULT_SERVER_PORT, ROOM_NAME } from "@manif/shared";
import { StreetRoom } from "../rooms/StreetRoom.js";

const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);

/** Answers 200 while the server is up. The Docker healthcheck polls it (see apps/server/Dockerfile). */
const health = createEndpoint("/health", { method: "GET" }, async () => ({ ok: true }));

// SIGTERM (a redeploy: `docker stop` sends it to node, PID 1 in the
// container) and SIGINT run Colyseus' graceful shutdown: every room is
// disposed, its clients disconnected, then the process exits 0.
const server = defineServer({
  gracefullyShutdown: true,
  transport: new WebSocketTransport(),
  rooms: {
    [ROOM_NAME]: defineRoom(StreetRoom),
  },
  routes: createRouter({ health }),
});
server.onBeforeShutdown(() => console.log("manif server shutting down"));
server.onShutdown(() => console.log("manif server shut down"));

await server.listen(port);
console.log(`manif server listening on ws://localhost:${port}`);
