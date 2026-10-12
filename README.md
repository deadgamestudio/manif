# manif

Multiplayer 3D isometric web game about French street protests. Players are
protesters; CRS riot police (server bots) chase and arrest them.

So far: a monorepo, a homepage where you pick a name and create or join a
private lobby by code or invite link, a lobby screen where the host starts the
march, and a long street (start zone at one end, the Préfecture at the other)
with walls and obstacles the server collides players against, with names above
the players walking it, synced through the server.

## Layout

| Path | What |
| --- | --- |
| `apps/client` | Vite + React + three.js via @react-three/fiber, Colyseus SDK |
| `apps/server` | Colyseus 0.18 server (runs on Node) |
| `packages/shared` | Constants, message names and payload types used by both. No runtime deps. |

Tooling: bun (package manager, workspaces), turbo (tasks), TypeScript strict, oxlint.

## Prerequisites

- [bun](https://bun.sh) 1.4.2 (pinned in `package.json`)
- Node 24 (runs the server; tested with v24)

## Run it

```sh
bun install
bun run dev        # shared (tsc --watch) + server on :2567 + client on :5173
```

Open http://localhost:5173, create a lobby, and open the invite link
(`?lobby=<code>`) in a second browser or a private window (tabs of one browser
share the saved name). The host presses Start. Move with WASD or the arrow keys.

Other tasks: `bun run build`, `bun run typecheck`, `bun run lint`, `bun run test`
(unit tests with `bun test`, run through turbo; they live in `packages/*/test/`).
Run the built server with `bun run --cwd apps/server start`.

## Where to change things

| To... | Edit |
| --- | --- |
| Tune speed, tick rate, player radius | `packages/shared/src/constants.ts` |
| Change the street layout (walls, obstacles, start, Préfecture, prop slots) | `packages/shared/src/levels/street.ts` |
| Change the level format or level queries (progress, spawns) | `packages/shared/src/level.ts` |
| Change collision (push-out, sliding, sub-steps, minimum wall thickness) | `packages/shared/src/collision.ts` |
| Change how the level is drawn | `apps/client/src/Level.tsx` |
| Add unit tests | `packages/shared/test/*.test.ts` (or a `test/` folder plus a `test` script in any package) |
| Add a client → server message | `packages/shared/src/messages.ts`, then handle it in `apps/server/src/rooms/StreetRoom.ts` |
| Add synced state | `apps/server/src/state.ts` (Schema) and the matching plain type in `packages/shared/src/state.ts` |
| Change the scene, camera, rendering | `apps/client/src/Scene.tsx`, `PlayerAvatar.tsx`, `iso.ts` |
| Change the connection or state listeners | `apps/client/src/net.ts` |
| Change the homepage or the lobby screen | `apps/client/src/Home.tsx`, `Lobby.tsx`, `styles.css` |
| Change name rules, default funny names, host hand-over order | `packages/shared/src/lobby.ts` |
| Change lobby rules (who is host, who can start, phases) | `apps/server/src/rooms/StreetRoom.ts` |
| Change the name tags above avatars | `apps/client/src/NameTag.tsx` |

Before pushing, run `bun run build && bun run typecheck && bun run lint && bun run test`.

## AI agent skills

The repo ships skills for Colyseus 0.18 and three.js in `.agents/skills/`
(symlinked into `.claude/skills/`, pinned in `skills-lock.json`). Claude Code and
other agents pick them up automatically. Colyseus 0.18's API differs a lot from
older versions, so let agents use the skill rather than their memory.

## Config

- Client: `VITE_SERVER_URL` (default `ws://<page host>:2567`). See `apps/client/.env.example`.
- Server: `PORT` (default `2567`).

## Notes

- Lobbies are private Colyseus rooms: `client.create()` makes one, and the
  lobby code is its `roomId`, joined with `client.joinById()`. Nothing uses
  `joinOrCreate`, so strangers never land in a lobby. An empty room is
  disposed, so its code stops working.
- `net.ts` holds at most one room and connects only on Create or Join (or on
  load when an invite link is opened by someone who already has a saved name).
  Concurrent create/join calls share one attempt, so double clicks and React
  StrictMode can't create ghost players.

- The server is authoritative. Clients only send a move direction; the server
  integrates movement at a fixed tick rate (`packages/shared/src/constants.ts`),
  pushes players out of obstacles and keeps them inside the street. The client
  never collides on its own; it only draws server positions.
- The level is static data in `@manif/shared`, imported by both the server
  (collision, spawns) and the client (rendering). It is not synced through
  Schema. Collision and level queries are pure functions, so they can be unit
  tested without a room.
- Schema classes live in the server only and use the `schema()` builder, so no
  decorator compiler flags are needed. The client reads state through the plain
  types in `@manif/shared`.
- The server runs on Node (`tsx watch` in dev, `tsc` + `node` in prod). Bun is
  only the package manager.
- `bunfig.toml` uses the hoisted linker: bun's isolated linker installs two
  copies of `@colyseus/core` and every join then fails with
  "seat reservation expired".
