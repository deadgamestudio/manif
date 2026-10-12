import { defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DEFAULT_SERVER_PORT, ROOM_NAME } from "@manif/shared";
import { StreetRoom } from "../rooms/StreetRoom.js";

const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);

const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: {
    [ROOM_NAME]: defineRoom(StreetRoom),
  },
});

await server.listen(port);
console.log(`manif server listening on ws://localhost:${port}`);
