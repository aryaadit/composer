// Module-level external store factory for `useSyncExternalStore`.
//
// React's `useSyncExternalStore` requires a *stable* reference between calls
// when the underlying value hasn't changed, otherwise it tears or loops. This
// factory holds a cached snapshot keyed by a stable string and only recomputes
// when the key changes — letting components subscribe to localStorage-backed
// state without churn. Use one store instance per logical piece of state.

export interface CachedStore<T> {
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  subscribe: (cb: () => void) => () => void;
  /** Invalidate the cached key so the next read pulls fresh data, then notify subscribers. */
  notify: () => void;
}

export function createCachedStore<T>(
  compute: () => T,
  keyOf: (value: T) => string,
  serverSnapshot: T
): CachedStore<T> {
  let cached: T = serverSnapshot;
  let cachedKey = "";
  const listeners = new Set<() => void>();

  return {
    getSnapshot() {
      if (typeof window === "undefined") return serverSnapshot;
      const fresh = compute();
      const key = keyOf(fresh);
      if (key !== cachedKey) {
        cached = fresh;
        cachedKey = key;
      }
      return cached;
    },
    getServerSnapshot() {
      return serverSnapshot;
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    notify() {
      cachedKey = "";
      listeners.forEach((cb) => cb());
    },
  };
}
