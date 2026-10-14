/**
 * A module fetched on demand (#88), as a tiny store React can read without
 * suspending: `load()` starts the download (the lobby calls it early, so Start
 * isn't held up), and once it has arrived the screen renders it in the same
 * frame. React.lazy would suspend for a tick even with the chunk already there.
 *
 * A failed download stays failed: after a deploy, an old tab asks for a chunk
 * whose name no longer exists, and only a reload gets the new one.
 */
export type LazyState<T> = { status: "idle" | "loading" } | { status: "ready"; module: T } | { status: "failed" };

export function lazyModule<T>(importer: () => Promise<T>) {
  let state: LazyState<T> = { status: "idle" };
  const listeners = new Set<() => void>();
  const set = (next: LazyState<T>) => {
    state = next;
    for (const l of listeners) l();
  };

  return {
    /** Start the download, once. Safe to call on every render. */
    load(): void {
      if (state.status !== "idle") return;
      set({ status: "loading" });
      importer().then(
        (module) => set({ status: "ready", module }),
        (err: unknown) => {
          console.warn("[lazy] chunk failed to load", err);
          set({ status: "failed" });
        },
      );
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot(): LazyState<T> {
      return state;
    },
  };
}
