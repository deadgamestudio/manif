# MANIF — 3D asset delivery (#28)

First art pass for review and later integration. No player renderer, physics, collision, networking or homepage imports are changed by this delivery.

## Files

- `apps/client/public/models/manif/<batch>/`: self-contained GLB files and effect/interface textures, served on demand. No code loads these assets yet.
- `assets/manif/sources/<batch>/`: matching editable Blender sources. Presentation scenes, ZIPs, frame sequences and automatic `.blend1` backups are excluded.
- `assets/manif/reports/<batch>/`: original export manifests, Blender reimport reports and French handoff notes. Historical reports describe their own batch, not the latest game state.
- `catalog.json`: URL, matching source, SHA-256, file size, triangle count and clip names for every GLB.
- `previews/`: character and crowd review images.

209 GLB files across 19 batches, 19.0 MB of GLB data. These include repeated bodies with different clips and separate states, not that many unique designs.

## Which batch to use

Start with `production-v1` for the base inventory. Its embedded character clips are early drafts. Use `animations-manifestants-v03` for the 19 core youth motions and v04 for the five additional motions; v04 does not contain the v03 set. Police, firefighter and BRAV packs provide their role motions. BAC reuses the exact protester appearance plus the separately attached armband.

`animations-trainage-v01` provides two-ankle dragging. `animations-saisies-v02` adds collar/arm/single-leg holds; `animations-trainage-v02` supplies their ground-dragging pairs. Preserve the offsets in `pairs.json` and synchronize each pair. Most locomotion clips are in place. `van-entry-seated` is an exception: displacement is authored in the hips; do not apply it twice.

`fourgon-v02` adds an actual rear interior and articulated doors. Open doors extend beyond the closed collision box. The water-cannon, complementary roles, roofs, alleys and van-entry sequence are **later** concepts, not new v1 gameplay commitments.

## Conventions and limits

Meters, glTF Y-up, +Z forward. Character pivots are at the feet; attachment effects/UI have attachment-centered pivots. Shared humanoid rig: 19 bones, hips root, hand and overhead sockets. Skin uses palette cell 6 (zero based), independent of role. The client must implement recoloring; it is not randomized by these files. Accessories may use additional meshes/materials, so not every assembled character is one draw call.

The Blender reports check geometry, weights, rest skeletons, durations, finite animated coordinates and loop seams where applicable. Paired-grab reports check wrist target distances, not full surface collision. The same CRS animation was applied to a protester and firefighter without retargeting in Blender. These are not engine compatibility or gameplay tests.

Effects are prototypes: opaque 3D puffs or transparent-background sprite atlases; emission, opacity fades, water collisions and pooling remain engine work. UI bars/rings are fixed reference states, not dynamic widgets. Armband visibility, thrown-object release, door control and interaction events need explicit controller wiring.

The review crowd has 8 players, 30 police and 2 firefighters, about 152k asset triangles and 283 material groups before instancing. It uses frozen poses, excludes presentation ground geometry, and does not establish FPS or actual draw calls. Shadow/transparency passes can add cost.

## Still open in #28

Runtime integration, retarget/controller checks, hand/foot/seat contact polish, collision and ragdoll mapping, network synchronization, recoloring, instancing, memory/loading/GPU measurements, final camera readability, rotating wheels and water-cannon driver, archetype-flavored idle motions, victory scene and optional dodge trail. The issue checklist is intentionally untouched.

Do not treat merging this asset inventory as acceptance of all #28 criteria. The original French batch notes include additional placement/event details; their references to local preview scenes are historical and those scenes are not included here.
