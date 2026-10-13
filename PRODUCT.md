# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Groups of friends, 2 to 8 per lobby. One of them picks a name, creates a private lobby and drops the invite link in a group chat; the others tap it, often on a phone, and land straight in the lobby. They play short, chaotic rounds together for a laugh: the session is the hangout, not a grind.

## Product Purpose

manif is a free, browser-based multiplayer game about the French street protest. Players are protesters marching down a long street to the Préfecture while CRS riot police (server bots) chase, baton, grab and drag them to the vans. The group wins when at least half the cortège reaches the Préfecture free before the timer runs out.

Success is a group that laughs, replays "one more march", and shares the link with the next group.

## Positioning

A party game built on a ritual every French player recognises: the manif, with its CRS, lacrymos, pavés, shield lines, bus shelters and Préfecture. The humour comes from that shared cultural knowledge, which a generic brawler can't copy. No install, no account: a link is enough to play.

## Operating Context

- Entry is almost always an invite link (`/?lobby=<code>`) opened from a messaging app; link previews (Open Graph, invite page with `noindex`) are part of the experience.
- Play happens on desktop (keyboard + mouse) and on phones (touch joystick and buttons), in the browser.
- Rounds: lobby (host starts) → march with a timer and a progress bar → win/lose end screen with joke awards → back to the lobby.
- Server-authoritative multiplayer (Colyseus); production at https://manif.bazlab.si.

## Capabilities and Constraints

- Language: **French only**. The humour, names, slang and UI copy are French; no translation is planned.
- Free, no account. A player is a name saved in the browser. Lasting identity and scoring (#41) are an open decision.
- Gameplay in place: melee and breakable props, pavés and throwables, dodge, hop, rescue, tear gas, fire, CRS bots with shield lines and waves, ragdoll knockdowns, round loop. Planned: more throwables, police unit types, pompiers, playable archetypes, throwing teammates.
- Max 8 players per lobby.
- 3D art: all models are placeholders (primitives) until Jordan, who owns 3D asset modeling, delivers real assets. Never invent or import 3D assets.

## Brand Commitments

- Name: **manif**.
- Tone: goofy, physical, slapstick. Fun beats realism. Getting hurt looks funny, not grim: exaggerated knockback, floppy falls, comic arrests. **No blood, no gore.**
- **Satire, not a side.** The game pokes fun at the manif ritual as a whole: protesters, police and the street furniture are all part of the joke. No real politicians, parties, unions or named real events.
- Voice: familiar spoken French, tutoiement, inclusive forms where natural ("invité·e", "camarade"), playful slang ("panier à salade", "kof kof"). Default player names are funny French characters (`randomDefaultName`).

## Evidence on Hand

- Share image rendered from the real game: `apps/client/public/og/og.png` (tagline "On lâche rien. Sauf les pavés.").
- No testimonials, player counts, press or reviews exist. Don't fabricate any.

## Product Principles

1. **One link to play.** Anything between the invite and the street (accounts, installs, long menus) costs players; keep the path to the march short on desktop and phone.
2. **Slapstick over simulation.** When realism and a laugh disagree, the laugh wins, and pain is never graphic.
3. **Laugh at the ritual, don't take sides.** Satire targets the shared absurdity of the manif, not a camp.
4. **Play together.** Mechanics should reward helping teammates (rescue, patting out fires, throwing a friend) as much as fighting.
5. **Readable chaos.** The screen can be wild, but the state that decides a round (who's grabbed, the timer, the progress, the gas) must stay legible at a glance.
