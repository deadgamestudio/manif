/**
 * A cache of downloads by URL, as a tiny store React can read without
 * suspending (the same idea as app/lazyModule.ts, keyed by URL). Kept free
 * of three.js so it is testable on its own; loader.ts plugs GLTFLoader in.
 *
 * - `load(url)` starts the download once and returns its promise; every
 *   later call returns the same promise.
 * - A failed download is logged once and stays failed: no retry loop on a
 *   missing file. The caller keeps showing its placeholder.
 * - `get(url)` is the value once it has arrived, else null (still loading,
 *   failed or never asked for), and `settled(url)` tells loaded-or-failed
 *   apart from still-loading.
 */
export type Entry<T> = { status: "loading"; promise: Promise<T> } | { status: "ready"; promise: Promise<T>; value: T } | { status: "failed"; promise: Promise<T> };

export function createCache<T>(fetcher: (url: string) => Promise<T>, label = "model") {
  const entries = new Map<string, Entry<T>>();
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const l of listeners) l();
  };

  function load(url: string): Promise<T> {
    const known = entries.get(url);
    if (known) return known.promise;
    const promise = fetcher(url);
    entries.set(url, { status: "loading", promise });
    promise.then(
      (value) => {
        entries.set(url, { status: "ready", promise, value });
        notify();
      },
      (err: unknown) => {
        console.warn(`[models] ${label} failed to load: ${url}`, err);
        entries.set(url, { status: "failed", promise });
        notify();
      },
    );
    return promise;
  }

  return {
    load,
    get(url: string): T | null {
      const e = entries.get(url);
      return e?.status === "ready" ? e.value : null;
    },
    settled(url: string): boolean {
      const s = entries.get(url)?.status;
      return s === "ready" || s === "failed";
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
