/**
 * Fetching the models ahead of need (#28), most urgent first, without ever
 * holding anything up: the game draws placeholders until each model is in.
 */
import { MODELS, modelUrls } from "./assets.ts";
import { loadGltf } from "./loader.ts";

/**
 * Downloads `groups` in order: every file of a group at once, the next group
 * when the previous one has finished (loaded or failed). Files already
 * cached cost nothing, so calling it again (a player joined) is cheap.
 * Returns at once.
 */
export function preloadModels(groups: readonly (readonly string[])[]): void {
  void (async () => {
    for (const group of groups) {
      await Promise.allSettled(group.map((url) => loadGltf(url)));
    }
  })();
}

/**
 * The preload order of a round:
 * 1. `bodies` (the players' own, from `bodyUrlFor`), the protester clip libraries and what protesters wear (tiny);
 * 2. the police, their vans and the BAC reveal;
 * 3. the props, scenery and throwables;
 * 4. everything else: the other bodies (a disguised BAC can wear any of
 *    them), the pompier, the grab and drag clips, the effects and markers.
 * A file in two groups is fetched once, with the first.
 */
export function roundPreloadGroups(bodies: readonly string[]): string[][] {
  const groups = [
    [...bodies, MODELS.clipLibraries.protesterCore, MODELS.clipLibraries.protesterExtra, ...modelUrls("accessories")],
    [...modelUrls("police"), MODELS.clipLibraries.bacReveal],
    [...modelUrls("props"), ...modelUrls("scenery"), ...modelUrls("throwables")],
    [...modelUrls("characters"), ...modelUrls("clipLibraries"), ...modelUrls("effects"), ...modelUrls("ui")],
  ];
  const seen = new Set<string>();
  return groups.map((group) => {
    const fresh = group.filter((url) => !seen.has(url));
    for (const url of fresh) seen.add(url);
    return [...new Set(fresh)];
  });
}
