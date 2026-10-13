# manif

Multiplayer 3D isometric web game about French street protests. Players are
protesters; CRS riot police (server bots) chase and arrest them.

So far: a monorepo, a homepage where you pick a name and create or join a
private lobby by code or invite link, a lobby screen where the host starts the
march, and a long street (start zone at one end, the Préfecture at the other)
with walls and obstacles the server collides players against, with names above
the players walking it, synced through the server. Players swing (left
click) to smash breakable props: bins, bus shelters, shop windows and cars.
Space hops (#45): half a second in the air to get over a wheelie bin or a CRS
lying in the street (not over cars, walls or a shield line), and a baton swing
that lands while you are in the air misses. A grab still gets you. A short
cooldown keeps it from being spammed. On a phone it is the Sauter button.
CRS riot police bots chase the nearest protester, hit them with batons, grab
them and drag them to the police vans; protesters can hit them back, or dodge
(Shift) with a short burst of speed that has a 3 s cooldown. A teammate being
dragged away can be rescued: hold E next to them for a second (or floor the CRS
holding them) and they are free, with a moment of grab immunity. Pavés lie in
the street and fall out of broken bus shelters, shop windows and cars: press E
next to one to pick it up, then click to throw it towards the mouse.
A pavé floors and stuns the CRS it hits, which drops whoever it was dragging,
and lands on the ground again wherever it stops.
Teammates can be thrown too: press E next to a free teammate to lift them
overhead (no asking), walk a bit slower, and click to throw them towards the
mouse. They fly flailing over bins and fallen CRS, bowl over the CRS they hit
(which drops whoever it was dragging) and smash props, then lie in a heap and
get up. Not thrown within 3 s, they wriggle free; a carrier who is hit or
grabbed drops them at once. E again puts them down.
Further down, CRS shield lines stand across the street: a wall of shields that
advances slowly towards the cortège once it comes close, blocks protesters and
shoves whoever leans on it. Hit it hard enough in a short time, or get behind
it, and it breaks up into ordinary chasing CRS.
CRS also lob tear gas canisters at bunches of protesters (a lone CRS, or the
middle member of a shield line, over the shields): the canister flies for a
second, stops at the first wall, and leaves a green-grey cloud for 8 s.
Protesters inside cough, lose HP slowly and walk slower; it wears off half a
second after stepping out (a dodge is not slowed: dive out). Gas never goes
through walls, and overlapping clouds don't stack.
Bins and cars burn (#16): hold E next to one for a second to light it (shop
windows and bus shelters don't burn). A burning prop slowly loses its HP for up
to 30 s, then stays there charred, still in the way, and never burns again.
After 8 s a fire can spread to a bin or car within 3 units, at most 6 fires at
once. Anyone who walks into the flames, protester or CRS, gets their bum set on
fire for 4 s: they flail, run faster and lose HP, unless a teammate pats them
out (hold E next to them). CRS path around fires, and a shield line stops or
splits when one is in its way.
Each lobby plays rounds (#12): the host starts a march with an 8-minute timer
and a progress bar from the start to the Préfecture. Get at least half the
cortège (rounded up) free into the Préfecture forecourt at the same time to
win; run out of time, or get everyone arrested at once (2+ players), and you
lose. CRS reinforcements arrive in waves as the cortège advances. An end
screen shows the result and a few joke awards for 10 s, then the street resets
and everyone is back on the lobby screen for the next round.

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
              crs/ (police bot avatars) dodge/ (dodge key, cooldown HUD) jump/ (Space, the hop arc) interact/ (E key)
              rescue/ (rescue bar, HUD prompt) throwable/ (pavés on the ground, in hand, in flight; mouse aim)
              gas/ (tear gas canisters, clouds, screen tint)
              fire/ (flames and smoke on props, burning bodies, hold bar, fire prompts)
              round/ (timer and progress HUD, end screen, last result in the lobby)
              debug/ (dev-only keys)
  shared/     net/ (connection, invite link)  iso/ (camera maths)
apps/client/seo/      the link preview and search tags (meta.ts) and the Vite plugin that writes them (plugin.ts)
apps/client/scripts/  og/ (renders the link preview image)
apps/client/public/   og/og.png, favicon.svg, apple-touch-icon.png
apps/server/src/
  app/        server bootstrap
  features/   player/ (Player Schema)  physics/ (knockback bodies)  health/ (HP and arrest timers)
              melee/ (swing cooldowns)  prop/ (Prop Schema, prop HP, the room's collision world)
              crs/ (Crs Schema, CrsSquad: the bots, spawning, syncing)  dodge/ (dodge cooldowns)  jump/ (hop cooldowns)
              rescue/ (who holds interact, rescue progress)
              throwable/ (GroundItem and Projectile Schemas, items on the ground and in flight)
              gas/ (GasCloud and Canister Schemas, clouds, canisters, who is coughing)
              fire/ (Fire Schema, burning props, who is on fire, who holds E to light or pat out)
              round/ (end-of-round numbers, dev-only round debug)
  rooms/      StreetRoom and its root state, which wires the features together
packages/shared/src/
  net/ player/ lobby/ physics/ level/ health/ prop/ melee/ crs/ dodge/ jump/ rescue/ throwable/ gas/ fire/ round/   (each with an index.ts)
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
| Tune the hop (time in the air, cooldown, drawn height, landing search) | `packages/shared/src/jump/constants.ts` |
| Make a prop hoppable, or change what a hop clears | `hoppable` in `PROP_TYPES` (`packages/shared/src/prop/constants.ts`); fallen CRS are added as hoppable, soft circles by `CrsSquad.fallenCircles()`. The filter is `skipHoppable` in `physics/collision.ts`, the hop and its landing are `startJump` / `landBody` in `physics/body.ts`, and the baton miss is in `crsHost.batonHit` in `StreetRoom.ts` |
| Push a body from a new hit (melee, baton, pavé...) | `StreetRoom.applyImpulse(id, dirX, dirZ, strength, mode?)` in `apps/server/src/rooms/StreetRoom.ts` |
| Tune HP, KO time, respawn delay, invulnerability, grab immunity after a rescue, default drag time, respawn margin | `packages/shared/src/health/constants.ts` |
| Change the health state machine (free, grabbed, KO, arrested) | `packages/shared/src/health/health.ts`; respawn position in `health/respawn.ts` |
| Hurt, grab or free a protester from a new system (melee, baton, gas, a thrown teammate #11...) | `StreetRoom.damagePlayer(id, amount)`, `grabPlayer(id, duration?)`, `rescuePlayer(id)`; check `hasControl(id)` before letting a player act |
| Tune melee reach, arc, cooldown, damage to props | `packages/shared/src/melee/constants.ts` |
| Change the arc check, line of sight or cooldown rule | `packages/shared/src/melee/melee.ts` |
| Tune a prop type (HP, intact and broken collision shape, pavés dropped) | `packages/shared/src/prop/constants.ts` |
| Handle a swing on the server (targets, hit events), hit a new kind of target | `StreetRoom.attack()` in `apps/server/src/rooms/StreetRoom.ts` |
| Tune a police unit (speed, HP, sight, baton, grab, drag, stun, stagger) or add a unit type (#13) | The `CRS_STATS` table in `packages/shared/src/crs/constants.ts` (plus a look in `apps/client/src/features/crs/crsVisuals.tsx`) |
| Change the cap on CRS, respawn delay, stuck detection | `packages/shared/src/crs/constants.ts` |
| Tune the round (length, end screen time, win share, wipe rule) or the reinforcement waves (`ROUND_WAVES`: when, how many chasers, which lines) | `packages/shared/src/round/constants.ts` |
| Change the round rules (phases, progress, win and lose order, wave spawn points, start spots clear of props) | `packages/shared/src/round/round.ts`; the room applies them in `StreetRoom.startMarch()`, `updateFront()`, `spawnWave()`, `stepRoundClock()` and `resetStreet()` |
| Reset something new between rounds | `StreetRoom.resetStreet()` in `apps/server/src/rooms/StreetRoom.ts` (the round-live check compares the street after a reset with a fresh room) |
| Change the round HUD, end screen or joke awards | `apps/client/src/features/round/`; the awards are `roundAwards` in `packages/shared/src/round/stats.ts`, the numbers are counted by `RoundStats` (`apps/server/src/features/round/`) |
| Change the bot AI (targeting, baton, grab, drag, stun, steering, stuck detector) | `packages/shared/src/crs/brain.ts` (`stepCrs`; a unit type can swap steps via `CrsBehaviour`); target and spawn choice in `crs/targeting.ts` |
| Change bot pathfinding (grid, A*, straight-line check) | `packages/shared/src/crs/nav.ts` |
| Tune shield lines (size, spacing, shield reach, speed, engage range, how far they advance, clearance from the start zone, shove, what breaks them) | The `LINE_*` constants in `packages/shared/src/crs/constants.ts` |
| Change shield line rules (slots against the level, advancing, stragglers, shove, break checks, collision with protesters) | `packages/shared/src/crs/line.ts` (`lineSlots`, `stepLine`, `checkBreak`, `resolveShieldContacts`) |
| Spawn a shield line from a new system | `CrsSquad.spawnLine(x, z, size?, facing?, kind?)` in `apps/server/src/features/crs/squad.ts`; where lines can form is `lineSpawns` in `packages/shared/src/level/street.ts` |
| Move or add CRS spawn points | `crsSpawns` in `packages/shared/src/level/street.ts` |
| Spawn CRS from a new system, stun one, hit one with a thrown item (#8) | `CrsSquad.spawn(x, z, kind)`, `reinforceTo`, `stun(id, now)`, `strike(...)` in `apps/server/src/features/crs/squad.ts`, owned by `StreetRoom` |
| Replace the placeholder CRS look (and the riot shield of a line) | `apps/client/src/features/crs/crsVisuals.tsx` (animation, shove thrust in `CrsAvatar.tsx`) |
| Add a throwable kind (#15: tomato, dog poo...) | A `ThrowableKind` value and a row in `THROWABLE_TYPES` in `packages/shared/src/throwable/constants.ts`, and its look in `apps/client/src/features/throwable/throwableVisuals.tsx`. What a hit does is `StreetRoom.projectileHit()` |
| Tune pavés (speed, range, damage, knockback, stun), pick-up range, caps on items | `packages/shared/src/throwable/constants.ts` |
| Change the pick-up, carry, aim or flight rules (swept collision, what stops a throw, where it lands) | `packages/shared/src/throwable/throwable.ts`; the server side is `apps/server/src/features/throwable/` and `StreetRoom.throwItem()` / `interact()` |
| Tune tear gas (cloud radius and duration, damage, slow, linger, cap on clouds, squad interval, canister flight, throw range, group size, scatter) | `packages/shared/src/gas/constants.ts`; how often one bot throws is `gasCooldown` in `CRS_STATS` (0: that unit never throws) |
| Change tear gas rules (who is in a cloud, walls, overlap, exposure and damage ticks, aim, canister flight, the cap) | `packages/shared/src/gas/gas.ts`; who throws when is `tryThrowGas` in `crs/brain.ts` (lone bots) and `lineThrower` in `crs/line.ts`; the server side is `apps/server/src/features/gas/` and the gas lines in `StreetRoom.step()` |
| Replace the tear gas look (canister, cloud puffs, cough wobble, screen tint) | `apps/client/src/features/gas/gasVisuals.tsx` |
| Tune fire (burn time, hurt zone, spread delay, cooldown and radius, cap, hold times, on-fire time, damage, panic speed) | `packages/shared/src/fire/constants.ts`; which prop kinds burn is `flammable` in `PROP_TYPES` (`prop/constants.ts`) |
| Change fire rules (lighting, burn-down, charring, spread choice, the cap, the zone, putting out) | `packages/shared/src/fire/fire.ts` (`FireField`); bodies on fire in `fire/burn.ts`; the interact holds and their priority in `fire/hold.ts`; the server side is `apps/server/src/features/fire/` and `StreetRoom.stepFireHolds()`, `stepFires()`, `burnCrs()` |
| Put a fire out from a new system (#17 pompiers' hose, #13 water cannon) or light one (#15 fumigène) | `StreetRoom.extinguishAt(x, z, radius)` (prop fires and burning bodies near a point), `extinguishProp(id)`, `putOutBody(id)`, `lightProp(id)`; the synced `state.fires` (by prop id: x, z, radius, intensity, left) is what to aim at. Dev builds: Y throws water around you; scripts can send `debug:round {action: "calm"}` to clear the CRS and the waves |
| Replace the fire look (flames, smoke, charred colour, bum on fire, hold bar) | `apps/client/src/features/fire/fireVisuals.tsx` |
| Put an item on the ground (a broken prop's pavés, a dropped carry) | `Throwables.drop(kind, x, z)` from `StreetRoom`; broken props go through `StreetRoom.dropPaves(slot)` |
| Move or add the pavés lying on the street at the start | `items` in `packages/shared/src/level/street.ts` |
| Change the throw key or the mouse aim | `apps/client/src/features/melee/useAttackInput.ts` (a click throws while carrying), `apps/client/src/features/throwable/aim.ts` and `AimTracker.tsx` |
| Replace a prop's placeholder look or its debris colours | `apps/client/src/features/prop/propVisuals.tsx` (debris simulation in `prop/debris.ts`) |
| Tune the dodge (speed factor, duration, cooldown, bonk threshold and down time) | `packages/shared/src/dodge/constants.ts` |
| Change the dodge burst (direction, wall bonk) or its cooldown rule | `startDodge` / `stepBody` in `packages/shared/src/physics/body.ts`; `dodgeDirection`, `dodgeReady` in `dodge/dodge.ts`; the server checks are in `StreetRoom.dodge()` |
| Change the dodge key, its cooldown bar or its look | `apps/client/src/features/dodge/` (key, HUD); the lean, squash and dust puff are in `features/player/PlayerAvatar.tsx` |
| Tune the rescue (hold time, range, knockback on the CRS and the freed protester) | `packages/shared/src/rescue/constants.ts` |
| Change the rescue rules (target choice, progress, interrupts, several rescuers) | `packages/shared/src/rescue/rescue.ts`; the room applies them at the top of `StreetRoom.step()` and the release is `StreetRoom.pullFree()` |
| Add something to the interact key (E) | The priority is `pickInteract` in `packages/shared/src/carry/carry.ts` (a carrier puts down; else rescue, pat out, pick up an item, pick up a teammate, light), used by `StreetRoom.interact(id, held)` and by the client prompts (`carryTargetFor`, `fireActionFor`, `useActionHint`); the key is `apps/client/src/features/interact/` |
| Tune carrying and throwing teammates (range, carry time, carrier speed, throw speed, time in the air, what a hit does to CRS and props) | `packages/shared/src/carry/constants.ts` |
| Change the carry rules (who can lift whom, drops, launch, what a flight hits) | `packages/shared/src/carry/carry.ts` and `launchBody` in `physics/body.ts`; the server side is `apps/server/src/features/carry/` and `StreetRoom.pickUpTeammate()`, `throwTeammate()`, `endCarry()`, `stepCarries()`, `stepFlights()` |
| Change the carried pose or the carry prompts | `apps/client/src/features/carry/` (`carryVisuals.ts`, `CarryHud.tsx`); the pose is drawn in `features/player/PlayerAvatar.tsx` |
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
| Change lobby rules (who is host, who can start) | `apps/server/src/rooms/StreetRoom.ts` |
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
  hashed `/assets/*` forever, serves `invite.html` for invite links
  (`?lobby=<code>`) and `index.html` for any other path (see
  [Link previews and search](#link-previews-and-search)).
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

## Link previews and search

A link pasted in Discord, Slack, WhatsApp or X shows a card with a title, a
line of text and an image. Their bots don't run JavaScript, so those tags have
to be in the HTML the server sends, not set by the app once it runs.

- `apps/client/seo/meta.ts` holds all that text, in French, and the site's
  address (`SITE_ORIGIN`, https://manif.bazlab.si, the only place the domain
  is written). There are two pages: the home page, and one generic invite
  ("Tu es invité·e à une manif !") for every `/?lobby=<code>` link. The invite
  is `noindex` and never contains the code. The home page also describes the
  game as schema.org `VideoGame` data (JSON-LD) for search engines.
- `apps/client/seo/plugin.ts` (a Vite plugin) puts those tags in place of the
  `<!-- seo -->` marker in `index.html`. `vite build` writes
  `dist/index.html` and a copy, `dist/invite.html`, with the invite's tags
  and the same hashed bundles, plus `robots.txt` and `sitemap.xml` (the home
  page only). The Caddyfile sends any page URL with a `lobby` query parameter
  to `invite.html`; `vite dev` and `vite preview` do the same, so they send
  what production sends.
- The share image is `apps/client/public/og/og.png` (1200 × 630, under 200
  KB), a shot of the real game. To redraw it, stop `bun run dev` and run
  `bun run og:render` in `apps/client`: it starts the game server and the
  client, opens five players in headless Chromium (Playwright), creates a
  lobby, has the others join by the invite link, walks the cortège up to the
  first shield line, lays the MANIF banner over it and shrinks the PNG to 256
  colours with Pillow (`python3 -m pip install Pillow`). The bots move a bit
  differently each run, so look at the image before committing it. The same
  script draws `public/apple-touch-icon.png` from `public/favicon.svg`
  (`bun run og:render -- icon` for that one only).

`apps/client/seo/plugin.test.ts` checks the built HTML (the tags, the image
size, the invite page) and the `vite preview` routing; `bun run test` builds
the client first.

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
  client and never collides. Props reset between rounds.
- CRS bots (#5): `state.crs` holds only `x`, `z`, `rotation`, `hp`, `status`
  (active, stunned, grabbing, out), `down` and `kind`; targets, paths and timers
  stay on the server. They come in the round's waves (#12), on the level's
  spawn points ahead of the cortège. Each picks the nearest free protester within sight (28)
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
  removed, and is not replaced (the round's waves send more).
  Step order is protesters first (health timers, then movement), then CRS;
  rescues (#10) go before both, so a last-tick rescue beats the arrest.
- Shield lines (#6): a line of `LINE_SIZE` (8) CRS forms at one of the
  level's `lineSpawns` when a round wave sends one (z 54 when the march
  starts, z -38 at progress 0.4), facing the cortège. Its
  slots are 1.5 apart across the street, computed against the level (and props)
  around the line's centre, so a narrower street gets fewer front slots and the
  extra members stand in a second rank; no slot is ever inside a wall. The line
  holds until a free protester comes within 30, then advances at 1.2 m/s for at
  most 20 m (never closer than 22 m to the start zone, so line 1 stops at z 64), waiting for members out of place except stragglers (2 s late) or
  stunned and floored ones, so one member stuck on a car never stops it. In
  formation, members never swing or grab. Their shields (radius 0.6, so the gap
  between two is 0.3) are solid to free and KO'd protesters: protesters step
  against them as circles (sub-stepped, so a dodge or a flying body cannot
  squeeze through), and after the bots move, anyone they walked into is pushed
  out, walls first; a member that would crush someone into a wall is pushed
  back instead and the line waits. Lone CRS still walk through protesters. Every
  2 s, any free protester touching a shield is shoved 7 m/s away from the line
  without damage (sent as `shove` and `impulse` events); the third shove in a
  row floors them. The line breaks for good when 8 HP of hits (melee, pavés)
  land on its members within 3 s, when 2 members are stunned or floored at
  once, or when 2 free protesters (1 if only one is free) stand behind it for
  2 s; its members then chase like the others and are not replaced when taken
  out. Only `formation` is synced on `Crs` (shield raised); slots and timers
  stay on the server. Pavés are not blocked by shields: they hit, stun and
  count towards the break.
- Round loop (#12): `state.phase` is `waiting` (the lobby screen; #14 adds
  the archetype pick there), `marching` or `ended`; the reset between rounds
  is a server step, not a phase. `timeLeft` (whole seconds), `progress`
  (0..100, the free protester furthest down the street) and `result` are the
  only other synced fields. Each tick while marching: the street steps, then
  progress and waves, then the outcome, checked win first (enough free
  protesters in the Préfecture zone, from the players in the room right now),
  then the wipe, then the timer. The street freezes while `ended`: every input
  is ignored. `round:end` carries the result, the time taken and per-player
  numbers (arrests, rescues, knockdowns, props broken, CRS taken out) once;
  they are not in Schema. A player who joins mid-round starts at the rear of
  the cortège and counts towards the win threshold at once. In dev builds,
  P jumps into the Préfecture and T cuts the timer to 10 s (`debug:round`,
  refused in production, which also has a `hold` action for scripted tests).
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
