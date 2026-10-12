# manif

Multiplayer 3D isometric web game about French street protests. Players are
protesters; CRS riot police (server bots) chase and arrest them.

This is the foundation only: a monorepo plus a minimal end-to-end "hello world"
(players walk around a street, synced through the server).

## Layout

| Path | What |
| --- | --- |
| `apps/client` | Vite + React + three.js via @react-three/fiber, Colyseus SDK |
| `apps/server` | Colyseus 0.18 server (runs on Node) |
| `packages/shared` | Constants, message names and payload types used by both. No runtime deps. |

Tooling: bun (package manager, workspaces), turbo (tasks), TypeScript strict, oxlint.

## Run it

```sh
bun install
bun run dev        # shared (tsc --watch) + server on :2567 + client on :5173
```

Open http://localhost:5173 in two tabs. Move with WASD or the arrow keys.

Other tasks: `bun run build`, `bun run typecheck`, `bun run lint`.
Run the built server with `bun run --cwd apps/server start`.

## Config

- Client: `VITE_SERVER_URL` (default `ws://<page host>:2567`). See `apps/client/.env.example`.
- Server: `PORT` (default `2567`).

## Notes

- The server is authoritative. Clients only send a move direction; the server
  integrates movement at a fixed tick rate (`packages/shared/src/constants.ts`)
  and clamps players to the map.
- Schema classes live in the server only and use the `schema()` builder, so no
  decorator compiler flags are needed. The client reads state through the plain
  types in `@manif/shared`.
- The server runs on Node (`tsx watch` in dev, `tsc` + `node` in prod). Bun is
  only the package manager.
- `bunfig.toml` uses the hoisted linker: bun's isolated linker installs two
  copies of `@colyseus/core` and every join then fails with
  "seat reservation expired".
