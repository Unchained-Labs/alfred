"use client";

import * as React from "react";

/*
 * Per-browser scratch state: an unsent code draft, how many hints you have
 * read. Things that should survive a reload but mean nothing to anyone else
 * and belong to no account.
 *
 * It is an external store read through useSyncExternalStore rather than state
 * hydrated in an effect, for two reasons. The server has no localStorage, so
 * the first render has to be the fallback and then converge — an effect that
 * calls setState to do that is the pattern React's own lint rules reject, and
 * it renders the wrong value for a frame. And a store means two components
 * reading the same key stay in step.
 *
 * Every access is wrapped: storage throws outright in a private window with
 * site data blocked, and a draft is never worth taking the page down for.
 */

const cache = new Map<string, string>();
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function read(key: string, fallback: string): string {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  let value = fallback;
  try {
    value = window.localStorage.getItem(key) ?? fallback;
  } catch {
    // Storage unavailable. The fallback is correct, it just will not persist.
  }
  // Cached so getSnapshot returns a stable value — React calls it often and
  // compares by identity.
  cache.set(key, value);
  return value;
}

function write(key: string, value: string) {
  cache.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // In-memory only for this page. Still better than losing what was typed.
  }
  for (const listener of listeners) listener();
}

/**
 * A string that persists in this browser. Returns the fallback on the server
 * and on the first client render, then the stored value.
 */
export function useStoredValue(key: string, fallback: string) {
  const value = React.useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback,
  );

  const set = React.useCallback(
    (next: string) => {
      write(key, next);
    },
    [key],
  );

  const clear = React.useCallback(() => {
    cache.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to clear.
    }
    for (const listener of listeners) listener();
  }, [key]);

  return [value, set, clear] as const;
}

/** The same thing for a counter — how many hints have been revealed. */
export function useStoredCount(key: string) {
  const [raw, setRaw] = useStoredValue(key, "0");
  const parsed = Number.parseInt(raw, 10);
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  const set = React.useCallback((next: number) => setRaw(String(next)), [setRaw]);
  return [value, set] as const;
}
