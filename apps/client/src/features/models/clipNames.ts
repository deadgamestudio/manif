/**
 * Clip names (#28), pure. Jordan's batches name clips two ways:
 * production-v1 prefixes them with the asset (`crs__repos`,
 * `protester-cgt__revendication`), the newer batches use bare names (`idle`,
 * `seize`). The game always asks by the bare name.
 */

/** `crs__repos` → `repos`; `idle` → `idle`. */
export function bareClipName(raw: string): string {
  const i = raw.lastIndexOf("__");
  return i >= 0 ? raw.slice(i + 2) : raw;
}

/**
 * Indexes clips from several libraries by bare name. The first library that
 * has a name wins, so pass them in order of preference.
 */
export function indexClips<T extends { name: string }>(libraries: readonly (readonly T[])[]): Map<string, T> {
  const byName = new Map<string, T>();
  for (const clips of libraries) {
    for (const clip of clips) {
      const name = bareClipName(clip.name);
      if (!byName.has(name)) byName.set(name, clip);
    }
  }
  return byName;
}

/** The clip called `name` (bare or prefixed), if the set has it. */
export function findClip<T>(clips: ReadonlyMap<string, T>, name: string): T | undefined {
  return clips.get(bareClipName(name));
}
