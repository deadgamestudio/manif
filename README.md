# manif

Multiplayer 3D isometric web game about French street protests. Players are
protesters; CRS riot police (server bots) chase and arrest them.

So far: a monorepo, a homepage where you pick a name and create or join a
private lobby by code or invite link, a lobby screen where the host starts the
march, and a long street (start zone at one end, the Préfecture at the other)
with walls and obstacles the server collides players against, with names above
the players walking it, synced through the server. Players swing (Space or
click) to smash breakable props: bins, bus shelters, shop windows and cars.
CRS riot police bots chase the nearest protester, hit them with batons, grab
them and drag them to the police vans; protesters can hit them back, or dodge
(Shift) with a short burst of speed that has a 3 s cooldown. A teammate being
dragged away can be rescued: hold E next to them for a second (or floor the CRS
holding them) and they are free, with a moment of grab immunity.

## Layout

| Path | What |
| --- | --- |
| `apps/client` | Vite + React + three.js via @react-three/fiber, Colyseus SDK |
| `apps/server` | Colyseus 0.18 server (runs on Node) |
| `packages/shared` | Constants, message names, payload types, level data, collision and lobby rules used by both. No runtime deps. |

Inside each one, code is grouped by feature:

```
apps/client/src/
  app/        main.tsx, App.tsx, styles.css
  features/   home/ lobby/ game/ level/ player/ health/ movement/ melee/ (attack input) prop/ (props, debris)
              crs/ (police bot avatars) dodge/ (dodge key, cooldown HUD) interact/ (E key)
              rescue/ (rescue bar, HUD prompt) debug/ (dev-only keys)
  shared/     net/ (connection, invite link)  iso/ (camera maths)
apps/server/src/
  app/        server bootstrap
  features/   player/ (Player Schema)  physics/ (knockback bodies)  health/ (HP and arrest timers)
              melee/ (swing cooldowns)  prop/ (Prop Schema, prop HP, the room's collision world)
              crs/ (Crs Schema, CrsSquad: the bots, spawning, syncing)  dodge/ (dodge cooldowns)
              rescue/ (who holds interact, rescue progress)
  rooms/      StreetRoom and its root state, which wires the features together
packages/shared/src/
  net/ player/ lobby/ physics/ level/ health/ prop/ melee/ crs/ dodge/ rescue/   (each with an index.ts)
```

A feature imports another feature only through its `index.ts`, `shared/` never
imports from `features/`, and tests sit next to the code they test. See
`AGENTS.md` ("Code layout").

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
(unit tests with `bun test`, run through turbo; they sit next to the code as `*.test.ts`).
Run the built server with `bun run --cwd apps/server start`.

## Where to change things

| To... | Edit |
| --- | --- |
| Tune speed, player radius | `packages/shared/src/player/constants.ts` |
| Tune tick rate, room name, server port | `packages/shared/src/net/constants.ts` |
| Change the street layout (walls, obstacles, start, Préfecture, prop slots) | `packages/shared/src/level/street.ts` |
| Change the level format or level queries (progress, spawns) | `packages/shared/src/level/level.ts` |
| Change collision (push-out, sliding, sub-steps, minimum wall thickness) | `packages/shared/src/physics/collision.ts` |
| Tune knockback (drag, friction, knockdown threshold, down time, get-up immunity, wall bounce) | `packages/shared/src/physics/constants.ts` |
| Change knockback kinematics (impulses, integration, bounce, down timer) | `packages/shared/src/physics/body.ts`; the server side is `apps/server/src/features/physics/` |
| Push a body from a new hit (melee, baton, pavé...) | `StreetRoom.applyImpulse(id, dirX, dirZ, strength, mode?)` in `apps/server/src/rooms/StreetRoom.ts` |
| Tune HP, KO time, respawn delay, invulnerability, grab immunity after a rescue, default drag time, respawn margin | `packages/shared/src/health/constants.ts` |
| Change the health state machine (free, grabbed, KO, arrested) | `packages/shared/src/health/health.ts`; respawn position in `health/respawn.ts` |
| Hurt, grab or free a protester from a new system (melee, baton, gas, a thrown teammate #11...) | `StreetRoom.damagePlayer(id, amount)`, `grabPlayer(id, duration?)`, `rescuePlayer(id)`; check `hasControl(id)` before letting a player act |
| Tune melee reach, arc, cooldown, damage to props | `packages/shared/src/melee/constants.ts` |
| Change the arc check, line of sight or cooldown rule | `packages/shared/src/melee/melee.ts` |
| Tune a prop type (HP, intact and broken collision shape, pavés dropped) | `packages/shared/src/prop/constants.ts` |
| Handle a swing on the server (targets, hit events), hit a new kind of target | `StreetRoom.attack()` in `apps/server/src/rooms/StreetRoom.ts` |
| Tune a police unit (speed, HP, sight, baton, grab, drag, stun, stagger) or add a unit type (#13) | The `CRS_STATS` table in `packages/shared/src/crs/constants.ts` (plus a look in `apps/client/src/features/crs/crsVisuals.tsx`) |
| Change how many CRS start, the cap, respawn delay, stuck detection | `packages/shared/src/crs/constants.ts` |
| Change the bot AI (targeting, baton, grab, drag, stun, steering, stuck detector) | `packages/shared/src/crs/brain.ts` (`stepCrs`; a unit type can swap steps via `CrsBehaviour`); target and spawn choice in `crs/targeting.ts` |
| Change bot pathfinding (grid, A*, straight-line check) | `packages/shared/src/crs/nav.ts` |
| Move or add CRS spawn points | `crsSpawns` in `packages/shared/src/level/street.ts` |
| Spawn CRS from a new system (#12 waves), stun one (#8 pavés) | `CrsSquad.spawn(x, z, kind)`, `reinforceTo`, `stun(id, now)` in `apps/server/src/features/crs/squad.ts`, owned by `StreetRoom` |
| Replace the placeholder CRS look | `apps/client/src/features/crs/crsVisuals.tsx` (animation in `CrsAvatar.tsx`) |
| Spawn pavés from a broken prop (#8) | `StreetRoom.dropPaves(slot)` |
| Replace a prop's placeholder look or its debris colours | `apps/client/src/features/prop/propVisuals.tsx` (debris simulation in `prop/debris.ts`) |
| Tune the dodge (speed factor, duration, cooldown, bonk threshold and down time) | `packages/shared/src/dodge/constants.ts` |
| Change the dodge burst (direction, wall bonk) or its cooldown rule | `startDodge` / `stepBody` in `packages/shared/src/physics/body.ts`; `dodgeDirection`, `dodgeReady` in `dodge/dodge.ts`; the server checks are in `StreetRoom.dodge()` |
| Change the dodge key, its cooldown bar or its look | `apps/client/src/features/dodge/` (key, HUD); the lean, squash and dust puff are in `features/player/PlayerAvatar.tsx` |
| Tune the rescue (hold time, range, knockback on the CRS and the freed protester) | `packages/shared/src/rescue/constants.ts` |
| Change the rescue rules (target choice, progress, interrupts, several rescuers) | `packages/shared/src/rescue/rescue.ts`; the room applies them at the top of `StreetRoom.step()` and the release is `StreetRoom.pullFree()` |
| Add something to the interact key (E), e.g. pick up a pavé (#8) | `StreetRoom.interact(id, held)` (a grabbed teammate in range has priority); the key is `apps/client/src/features/interact/` |
| Change the rescue bar or the HUD prompt | `apps/client/src/features/rescue/` |
| Change the attack keys | `apps/client/src/features/melee/useAttackInput.ts`; the swing animation is in `features/player/PlayerAvatar.tsx` |
| Change the HP bar and status line | `apps/client/src/features/health/` (HUD and the bar above other players) |
| Change the knocked-down look | `apps/client/src/features/player/PlayerAvatar.tsx` |
| Change how the level is drawn | `apps/client/src/features/level/Level.tsx` |
| Add unit tests | A `*.test.ts` next to the code it tests, e.g. `packages/shared/src/level/level.test.ts` (any package with a `test` script) |
| Add a client → server message | `packages/shared/src/net/messages.ts`, then handle it in `apps/server/src/rooms/StreetRoom.ts` |
| Add synced state | A Schema in the feature (e.g. `apps/server/src/features/player/schema.ts`), composed into the root state in `apps/server/src/rooms/state.ts`, and the matching plain type in `packages/shared/src/net/state.ts` |
| Change the scene, camera, rendering | `apps/client/src/features/game/Scene.tsx`, `features/player/PlayerAvatar.tsx`, `shared/iso/iso.ts` |
| Change keyboard movement | `apps/client/src/features/movement/useMoveInput.ts` |
| Change the connection or state listeners | `apps/client/src/shared/net/net.ts` |
| Change the homepage or the lobby screen | `apps/client/src/features/home/Home.tsx`, `features/lobby/Lobby.tsx`, `app/styles.css` |
| Change name rules, default funny names, host hand-over order, max players | `packages/shared/src/lobby/lobby.ts`, `lobby/constants.ts` |
| Change lobby rules (who is host, who can start, phases) | `apps/server/src/rooms/StreetRoom.ts` |
| Change the name tags above avatars | `apps/client/src/features/player/NameTag.tsx` |

Before pushing, run `bun run build && bun run typecheck && bun run lint && bun run test`.

## AI agent skills

The repo ships skills for Colyseus 0.18 and three.js in `.agents/skills/`
(symlinked into `.claude/skills/`, pinned in `skills-lock.json`). Claude Code and
other agents pick them up automatically. Colyseus 0.18's API differs a lot from
older versions, so let agents use the skill rather than their memory.

## Config

- Client: `VITE_SERVER_URL` (default `ws://<page host>:2567`). A path such as
  `/colyseus` means the same origin as the page (https gives wss). See
  `apps/client/.env.example`.
- Server: `PORT` (default `2567`), `NODE_ENV` (`production` turns off the debug
  knockback message). `GET /health` answers 200 while the server is up.

## Deploy

Production is two containers (`docker-compose.yaml`):

- `client`: the Vite build served by Caddy on :80, the only public service. It
  proxies `/colyseus/*` (matchmaking and WebSockets) to the server, caches the
  hashed `/assets/*` forever and serves `index.html` for any other path.
- `server`: the Colyseus server on Node 24 (distroless, non-root), reachable
  only from the client. On SIGTERM it closes the rooms and exits at once.

No database: lobbies live in the server's memory, so a redeploy ends the games
in progress.

Run it locally on http://localhost:8080:

```sh
docker compose --env-file .env.production.example \
  -f docker-compose.yaml -f docker-compose.local.yaml up --build
```

On Coolify (https://manif.bazlab.si): create a Docker Compose resource from this
repo with `docker-compose.yaml`, give the `client` service the domain on port
80 (Coolify's proxy adds TLS), and leave `server` without a domain. The only
variable is the build arg `VITE_SERVER_URL=/colyseus` (the default); see
`.env.production.example`.

## Notes

- Lobbies are private Colyseus rooms: `client.create()` makes one, and the
  lobby code is its `roomId`, joined with `client.joinById()`. Nothing uses
  `joinOrCreate`, so strangers never land in a lobby. An empty room is
  disposed, so its code stops working.
- `net.ts` holds at most one room and connects only on Create or Join (or on
  load when an invite link is opened by someone who already has a saved name).
  Concurrent create/join calls share one attempt, so double clicks and React
  StrictMode can't create ghost players.

- Knockback (#2): a body walks from its input and also carries a server-only
  knockback velocity that hits add to and drag brings to zero. A hard hit
  knocks it down (synced `down` flag) for a moment: input is ignored, then it
  gets up with a short immunity. Each hit is broadcast as an `impulse` event so
  clients tip the avatar the right way. In dev builds, K / J / L in the street
  trigger a debug knockback (the server refuses it when `NODE_ENV=production`).
- Health (#3): each protester has HP (100) and a status: free, grabbed, KO or
  arrested. 0 HP means KO for 1.5 s, then arrested; after 10 s in the van they
  come back free with full HP behind the rearmost free protester, briefly
  immune. Only free protesters move or act. The state machine is pure (shared
  `health/`); the server keeps its timers in room time and syncs only `hp`,
  `status` and a whole-second countdown `stateLeft`. In dev builds, H hurts you
  and G gets you grabbed.
- Melee and props (#4): `attack` has no payload. The server swings from the
  player's own position and facing (its last walking direction), only for a
  free protester who is not knocked down, at most once per 0.5 s of room time.
  It hits every intact prop whose nearest point is within 1.2 and ±45° of the
  facing (or that the facing line meets within 1.2), unless a static wall or
  obstacle is in between. Each swing takes 1 HP; at 0 the prop breaks. Only
  `hp` and `broken` are synced per prop (`state.props`, keyed by level prop
  id); position and type come from the level. A broken prop switches to its
  broken collision shape (none for bins and shop windows) on the next tick.
  `swing` and `hit` are broadcast events, not state. Debris is local to each
  client and never collides. Props reset when the host starts.
- CRS bots (#5): `state.crs` holds only `x`, `z`, `rotation`, `hp`, `status`
  (active, stunned, grabbing, out), `down` and `kind`; targets, paths and timers
  stay on the server. When the host starts, `CRS_COUNT` (6) CRS appear on the
  level's spawn points. Each picks the nearest free protester within sight (28)
  and walks to them: straight when the way is clear and close, otherwise along
  an A* path on a 0.5-unit grid built from the collision world (rebuilt when a
  prop breaks), re-pathed at most every 0.75 s. No progress for 1 s re-paths;
  twice in a row, it gives up on that target for 3 s. With nobody in sight it
  walks back to its post. In reach, a baton hit takes 20 HP and knocks the
  protester down; touching a downed protester (or with the baton on cooldown)
  grabs them and drags them towards the nearest van at reduced speed until the
  health machine arrests them (4 s). Stunned, knocked down or out, it lets go
  and the protester is free. Protesters' melee pushes CRS back, every third quick
  hit knocks one over, and at 0 HP (6 hits) it is out: it lies there 3 s, is
  removed, and is replaced at a spawn point 10 s later until #12 owns spawning.
  Step order is protesters first (health timers, then movement), then CRS;
  rescues (#10) go before both, so a last-tick rescue beats the arrest.
- The server is authoritative. Clients only send inputs (a move direction, an attack); the server
  integrates movement at a fixed tick rate (`packages/shared/src/net/constants.ts`),
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
