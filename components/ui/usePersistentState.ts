"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "persistent-state";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** A per-browser preference stored in localStorage (falls back to the default). */
export function usePersistentState<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (v: T) => void] {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener("storage", cb);
    window.addEventListener(EVENT, cb);
    return () => {
      window.removeEventListener("storage", cb);
      window.removeEventListener(EVENT, cb);
    };
  }, []);
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const value = raw != null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const set = useCallback(
    (v: T) => {
      try {
        localStorage.setItem(key, v);
      } catch {}
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}
