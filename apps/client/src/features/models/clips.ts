/**
 * Clip libraries (#28). Every character shares one rig, so the clips of one
 * file drive any body: load the libraries (MODELS.clipLibraries, or a police
 * file's own clips) and hand the set to an Animator.
 *
 * A ClipSet maps bare clip names (`idle`, `seize`, `repos` for
 * `crs__repos`) to clips. AnimationClips are only data: one set serves every
 * character, never clone them.
 */
import { useMemo, useSyncExternalStore } from "react";
import type { AnimationClip } from "three";
import { indexClips } from "./clipNames.ts";
import { isGltfSettled, loadGltf, peekGltf, subscribeModels, type GLTF } from "./loader.ts";

export type ClipSet = ReadonlyMap<string, AnimationClip>;

const perGltf = new WeakMap<GLTF, ClipSet>();

/** The clips inside one loaded file, by bare name. */
export function clipsOf(gltf: GLTF): ClipSet {
  let set = perGltf.get(gltf);
  if (!set) {
    set = indexClips([gltf.animations]);
    perGltf.set(gltf, set);
  }
  return set;
}

/**
 * The clips of several files, merged by bare name (the first file that has a
 * name wins). Null until every file has arrived or failed; a failed file just
 * adds nothing. Starts the downloads.
 *
 *   const clips = useClips([MODELS.clipLibraries.protesterCore, MODELS.clipLibraries.protesterExtra]);
 */
export function useClips(urls: readonly string[]): ClipSet | null {
  for (const url of urls) void loadGltf(url);
  // A string, so React compares it by value: one letter per file, l(oading), r(eady) or f(ailed).
  const signature = useSyncExternalStore(subscribeModels, () =>
    urls.map((u) => (peekGltf(u) ? "r" : isGltfSettled(u) ? "f" : "l")).join(""),
  );
  // Stands for `urls` in the memo (a caller often passes a new array each render).
  const key = urls.join("|");
  return useMemo(() => {
    if (signature.includes("l")) return null;
    return indexClips(key.split("|").map((u) => peekGltf(u)?.animations ?? []));
  }, [signature, key]);
}
