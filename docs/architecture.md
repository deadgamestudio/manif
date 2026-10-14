# How it works

Design notes on the server and the main game systems: what is synced, what
stays on the server, and the order things happen in a tick. Written as each
system landed (issue numbers in brackets); the code is the reference when the
two disagree. For what each mechanic feels like in play, see
[gameplay.md](gameplay.md).

## The basics

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

## Lobbies and the connection

- Lobbies are private Colyseus rooms: `client.create()` makes one, and the
  lobby code is its `roomId`, joined with `client.joinById()`. Nothing uses
  `joinOrCreate`, so strangers never land in a lobby. An empty room is
  disposed, so its code stops working.
- `net.ts` holds at most one room and connects only on Create or Join (or on
  load when an invite link is opened by someone who already has a saved name).
  Concurrent create/join calls share one attempt, so double clicks and React
  StrictMode can't create ghost players.

## Systems

- Knockback (#2): a body walks from its input and also carries a server-only
  knockback velocity that hits add to and drag brings to zero. A hard hit
  knocks it down (synced `down` flag) for a moment: input is ignored, then it
  gets up with a short immunity. Each hit is broadcast as an `impulse` event so
  clients tip the avatar the right way. In dev builds, K / J / L in the street
  trigger a debug knockback (the server accepts it only when `NODE_ENV=development`).
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
  id); position and type come from the level. The shops are the exception
  (#83): the server generates them at each round reset (`generateShops`) and
  syncs each one whole (kind, side, place, width, depth, height, look seed),
  and every side builds the same collision box from it (`shopFootprint`). A
  broken prop switches to its broken collision shape (none for bins and
  shops) on the next tick.
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
