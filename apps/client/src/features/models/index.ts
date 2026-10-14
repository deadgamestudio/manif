/*
 * Jordan's 3D models in the game (#28): loading, copies, clips, skin colour,
 * preloading. Import from 3D code only (components under the <Canvas>): it
 * brings three.js along, which must stay out of the entry chunk
 * (vite.config.ts checks it).
 */
export { ARCHETYPE_BODIES, MODELS, bodyUrlFor, modelUrls, type ModelGroup } from "./assets.ts";
export { isGltfSettled, loadGltf, peekGltf, useGltf, type GLTF } from "./loader.ts";
export {
  cloneMaterials,
  cloneSkinned,
  cloneStatic,
  disposeMaterials,
  fitToBox,
  modelBounds,
  useOwnMaterials,
  useSkinnedModel,
  useStaticModel,
  type Vec3,
} from "./instances.ts";
export { clipsOf, useClips, type ClipSet } from "./clips.ts";
export { bareClipName, findClip } from "./clipNames.ts";
export { Animator, useAnimator, type LoopOptions, type OnceOptions } from "./animator.ts";
export { applySkin, skinMaterial, skinPalette } from "./palette.ts";
export { SKIN_CELL } from "./palettePixels.ts";
export { getPoseOwner, setPoseOwner, type PoseOwner } from "./poseOwner.ts";
export { preloadModels, roundPreloadGroups } from "./preload.ts";
