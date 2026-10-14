/**
 * DIAGNOSTICS (#59, MANIF_DIAG=1 only): where ids matching `match` are still
 * keys, in any Map, Set or MapSchema reachable from `root` within `depth`
 * property hops. The room passes itself and "a bot id no longer playing", so
 * a per-id map that `removePlayer` forgot shows up by name in the log,
 * including private maps inside a feature, without each feature exposing one.
 */
export function leftovers(root: object, match: (key: string) => boolean, ignore: readonly object[] = [], depth = 3): Map<string, number> {
  const out = new Map<string, number>();
  // `ignore`: what the diagnostics keep themselves (the list of past bot ids), never a leftover.
  const seen = new Set<object>(ignore);
  const visit = (value: unknown, path: string, left: number) => {
    if (value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    const keyed = value as { keys?: unknown; size?: unknown };
    if (typeof keyed.keys === "function" && typeof keyed.size === "number") {
      let n = 0;
      for (const k of (keyed.keys as () => Iterable<unknown>).call(value)) if (typeof k === "string" && match(k)) n++;
      if (n > 0) out.set(path, n);
    }
    if (left <= 0 || Array.isArray(value)) return;
    for (const [k, v] of Object.entries(value)) visit(v, path ? `${path}.${k}` : k, left - 1);
  };
  visit(root, "", depth);
  return out;
}
