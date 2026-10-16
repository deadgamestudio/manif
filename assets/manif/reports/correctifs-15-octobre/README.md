# Asset corrections after the integration review

44 revised/new GLBs, with editable Blender sources in the matching batch. The previous batches remain available. Active URLs are in `features/models/assets.ts`.

- Wider 0.5 s sprint cycles (four youth profiles); the common clip library drives all compatible bodies. Target authored speed 4.4 m/s, so 6 m/s plays at about 1.36x.
- 0.5 s ground-drag cycles for collar, arm and leg pairs, targeting 2.4 m/s; the live game uses the collar pair. Pair offsets are unchanged. Shield stays on the free arm.
- 0.75 s standing-to-ground bridge, distinct from grabbing someone already lying down. Relative placement interpolates between the standing and ground offsets. This is authored animation, not a physical takedown/contact solver.
- Moluchan: brown jacket, grey hair, scarf, and idle/walk megaphone pose on the shared skeleton. Megaphone remains a separately attached existing prop.
- Upstream LBD launcher, muzzle and recoil integration from #100 are preserved; the redundant prototype is excluded.
- Amber marker above the local captured player's server-selected van.
- Blue van palette and left-hand driver socket; fire truck reduced uniformly to roughly 5.2 m length; wider bins; distinct burning-state soot; lighter pavement source (the newer procedural pavements on main remain in use).
- Forecourt stone bases and railings aligned to shared collision boxes. Front approach stays open.
- New sign-less storefront and broken opening modules are supplied for reuse. Procedural shops keep their width-specific fronts and signs; the new modules are not substituted wholesale over variable doorways.

Existing bus shelter/stall fitting and throwable readability multipliers remain in the client. The overhead carried clip deliberately retains its hips-centred attachment convention.

Validation: all 44 delivered GLBs reimported in Blender, finite mesh coordinates, 19-bone character rigs. The JSON report records mesh counts, bounds and clip names. This does not certify all contacts, retargeting combinations or frame rates. In-game review is still required before merge.

## Verification on current main (16 October 2026)

Rebased onto f7fbd4f, preserving the newer launcher, pavements, façades, archetype recolouring and lobby portraits. Build, typecheck and lint passed. Client: 371 passed. Shared: 778 passed, including the new forecourt approach/collision test. Server: 123 passed, 2 pre-existing Windows failures in score storage (directory permissions and EBUSY cleanup). Root test command remains red for those failures.

Local browser smoke test: lobby and round start, movement, Moluchan spawn, grab/debug interaction; no browser console errors captured. This is not exhaustive multiplayer, animation-contact or performance validation. Review the 0.75 s transition and shield clearance in normal play before merging.
