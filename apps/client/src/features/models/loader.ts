/**
 * Loads Jordan's GLBs (#28): one GLTFLoader for the whole game and one
 * download per URL, shared by every component that asks for it.
 *
 * Nothing suspends: `useGltf` returns null until the file has arrived (or for
 * good if it failed), and the caller keeps drawing its placeholder meanwhile.
 * The game never waits on a model.
 *
 * The returned GLTF is shared: never add it to the scene or change its
 * materials. Take an instance with `cloneStatic` / `cloneSkinned`
 * (instances.ts) or the `useStaticModel` / `useSkinnedModel` hooks.
 */
import { useSyncExternalStore } from "react";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createCache } from "./cache.ts";

export type { GLTF };

const loader = new GLTFLoader();
const cache = createCache<GLTF>((url) => loader.loadAsync(url), "GLB");

/** Start downloading `url` (once), and get its promise. Rejects if it fails; the failure is already logged. */
export function loadGltf(url: string): Promise<GLTF> {
  return cache.load(url);
}

/** The model if it has arrived, else null. Never starts a download. */
export function peekGltf(url: string): GLTF | null {
  return cache.get(url);
}

/** True once `url` has either arrived or failed. */
export function isGltfSettled(url: string): boolean {
  return cache.settled(url);
}

export const subscribeModels = cache.subscribe;

/**
 * The model at `url`, or null while it loads or if it failed (keep the
 * placeholder). Starts the download on first use. Pass null to ask for nothing.
 */
export function useGltf(url: string | null): GLTF | null {
  // The cache handles the rejection itself, so not catching here leaves nothing unhandled.
  if (url) void cache.load(url);
  return useSyncExternalStore(cache.subscribe, () => (url ? cache.get(url) : null));
}
