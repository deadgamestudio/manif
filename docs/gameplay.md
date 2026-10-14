# How the game plays

The long version of the README's "How a round goes": every mechanic as it
works today, with the issue that added it. The numbers live in
`packages/shared/src/<feature>/constants.ts`; if this page and the code
disagree, the code wins.

## The street, swinging and hopping

So far: a monorepo, a homepage where you pick a name and create or join a
private lobby by code or invite link, a lobby screen where the host starts the
march, and a long street (start zone at one end, the Préfecture at the other)
with walls and obstacles the server collides players against, with names above
the players walking it, synced through the server. Players swing (left
click) to smash breakable props: bins, bus shelters, shops and cars. The
shops are big storefronts built into the facades, laid out afresh with a new
mix of kinds every round (the lobby already shows the next round's street).
Space hops (#45): half a second in the air to get over a wheelie bin or a CRS
lying in the street (not over cars, walls or a shield line), and a baton swing
that lands while you are in the air misses. A grab still gets you. A short
cooldown keeps it from being spammed. On a phone it is the Sauter button.

## CRS, dodging, rescues and pavés

CRS riot police bots chase the nearest protester, hit them with batons, grab
them and drag them to the police vans; protesters can hit them back, or dodge
(Shift) with a short burst of speed that has a 3 s cooldown. A teammate being
dragged away can be rescued: hold E next to them for a second (or floor the CRS
holding them) and they are free, with a moment of grab immunity. Pavés lie in
the street and fall out of broken bus shelters, shops and cars: press E
next to one to pick it up, then click to throw it towards the mouse.
A pavé floors and stuns the CRS it hits, which drops whoever it was dragging,
and lands on the ground again wherever it stops.

## Other things to throw (#15)

Other things to throw (#15): smash a market stall for tomatoes (a tomato on a
CRS's visor makes it stumble and miss its swings for a few seconds, and is
gone), pick up a dog poo from the pavement (the CRS it hits stinks: it backs
off and the others keep away from it; walk on one and you slip and fall, CRS
too, unless you hop over it), or grab a parked trottinette (heavy: you walk
slower and can't hop, but thrown it bowls over up to four CRS in a row, then
lies there for the next throw).

## Throwing teammates (#11)

Teammates can be thrown too: press E next to a free teammate to lift them
overhead (no asking), walk a bit slower, and click to throw them towards the
mouse. They fly flailing over bins and fallen CRS, bowl over the CRS they hit
(which drops whoever it was dragging) and smash props, then lie in a heap and
get up. Not thrown within 3 s, they wriggle free; a carrier who is hit or
grabbed drops them at once. E again puts them down.

## Shield lines (#6)

Further down, CRS shield lines stand across the street: a wall of shields that
advances slowly towards the cortège once it comes close, blocks protesters and
shoves whoever leans on it. Hit it hard enough in a short time, or get behind
it, and it breaks up into ordinary chasing CRS.

## Tear gas

CRS also lob tear gas canisters at bunches of protesters (a lone CRS, or the
middle member of a shield line, over the shields): the canister flies for a
second, stops at the first wall, and leaves a green-grey cloud for 8 s.
Protesters inside cough, lose HP slowly and walk slower; it wears off half a
second after stepping out (a dodge is not slowed: dive out). Gas never goes
through walls, and overlapping clouds don't stack.

## Fire (#16)

Bins and cars burn (#16): hold E next to one for a second to light it (shop
windows and bus shelters don't burn). A burning prop slowly loses its HP for up
to 30 s, then stays there charred, still in the way, and never burns again.
After 8 s a fire can spread to a bin or car within 3 units, at most 6 fires at
once. Anyone who walks into the flames, protester or CRS, gets their bum set on
fire for 4 s: they flail, run faster and lose HP, unless a teammate pats them
out (hold E next to them). CRS path around fires, and a shield line stops or
splits when one is in its way.

## Pompiers (#17)

Pompiers put the fires out (#17). About 10 s after something starts burning, a
fire truck drives down the side street nearest the fire and parks behind its
barrier (never in the cortège); two pompiers get off, each takes the nearest
fire it can actually reach that nobody else is on, and hoses it until it is
out. Their water also puts out anyone on fire and pushes back whoever stands in
the jet, protesters and CRS alike. With no fire left they get back on and the
truck leaves; a second truck comes only if fires keep burning for a long time.
Pompiers are on nobody's side: they never hit or grab anyone, CRS never grab
them, and protesters can knock them over (any hit floors one) but never hurt
them. Now and then a pompier's hose drifts "by accident" onto a CRS standing by
its fire.

## Rounds, waves and other police units (#12, #13)

Each lobby plays rounds (#12): the host starts a march with an 8-minute timer
and a progress bar from the start to the Préfecture. Get at least half the
cortège (rounded up) free into the Préfecture forecourt at the same time to
win; run out of time, or get everyone arrested at once (2+ players), and you
lose. CRS reinforcements arrive in waves as the cortège advances, and further
down other police units join in (#13): a BAC in plain clothes slips into the
back of the cortège looking exactly like a protester, walks along for a while,
then sidles up to someone, pulls on its orange armband and grabs them (hit it
first and it gives itself away; two hits and it's down); BRAV-M motorbike
duos charge in, the passenger hops off, whacks someone and they ride off
(a pavé, a thrown teammate or three quick hits knock both riders off, and the
bike skids away). An end
screen shows the result and a few joke awards for 10 s, then the street resets
and everyone is back on the lobby screen for the next round.

## Archetypes (#14)

On the lobby screen each player picks an archetype (#14), locked for the whole
march: manifestant·e lambda (the default, plain stats), bobo gaucho, mec de
cité, gilet jaune, black bloc, syndicaliste CGT, étudiant·e or retraité·e. Each
has a look (clothes colour and a placeholder prop) and passive modifiers: speed,
HP, how long a CRS drag lasts, rescue time, damage to props, throw range, dodge
cooldown, how keen the CRS are to chase you, and two auras (the CGT slowly heals
teammates nearby, a bobo filming makes nearby grabs last longer). The numbers
are one table in `packages/shared/src/archetype/constants.ts`; the looks are
`apps/client/src/features/archetype/archetypeVisuals.tsx`. Players who join
mid-march are the default until the next lobby.

## Score and leaderboard (#41)

Every useful action scores (#41), counted by the server only: taking a CRS out,
rescuing a teammate, breaking a prop, splatting a CRS, lighting a fire, the
CGT's heals, and a bonus for everyone when the round is won (more for those
standing in the Préfecture); an arrest costs points (never below 0). Each
action is capped per round so it can't be farmed. Your score is in the round
HUD, in the Tab board and on the end screen, which ranks the players by it. At
the end of a round (never when you leave mid-round, never after a dev-only
debug action) it is added to your lasting total, shown on the leaderboard in
the lobby. There are no accounts: the total belongs to an anonymous token the
server gives your browser on the first visit (kept in `localStorage` beside
your name), so clearing site data or switching devices starts again at 0.

## Bot protesters (#59)

Bots fill the empty seats (#59). When the host presses Start, bot protesters
join until the cortège has 8 (the host can turn this off in the lobby, with
"Compléter avec des bots"). They get a funny name, a random archetype and a
"BOT" chip on their name tag, walk with the crowd near the leading human, and
now and then hit a CRS that is dragging someone, throw a pavé, hop a bin or
dive out of gas, or pull a grabbed teammate free. They are weaker than a
player of the same archetype (slower to react, slower to walk, softer and
slower swings, sloppy throws, only some of their chances taken) and much
weaker than a CRS. The CRS chase them, but a human first at a similar
distance. They never count for the win or the wipe (only humans do), never get
an award, and never bank a score. A human joining mid-march takes the place of
the bot furthest back; at the end of the march every bot leaves.
