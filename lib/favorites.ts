"use client";

// Client-side favorites store: which fixtures the user has starred. Persisted
// in localStorage (SSR-safe — no window access at module scope), no Convex
// needed so it works fully signed-out. `useFavorites()` keeps every mounted
// component in sync: a custom event covers same-tab listeners (the native
// `storage` event only fires in *other* tabs), and the native `storage` event
// covers cross-tab.

import { useCallback, useEffect, useState } from "react";

const KEY = "golazo.favorites.v1";
const SYNC_EVENT = "golazo:favorites";

function readIds(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === "number") : [];
  } catch {
    return [];
  }
}

function writeIds(ids: number[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* localStorage unavailable (private mode / quota) — favorites just won't persist */
  }
  window.dispatchEvent(new Event(SYNC_EVENT));
}

/** SSR-safe: returns [] on the server or when localStorage is unavailable. */
export function getFavorites(): number[] {
  return readIds();
}

/** True if a fixture is currently favorited. */
export function isFavorite(id: number): boolean {
  return readIds().includes(id);
}

/** Toggle a fixture's favorite state and persist it. Returns the new list. */
export function toggleFavorite(id: number): number[] {
  const current = readIds();
  const next = current.includes(id) ? current.filter((f) => f !== id) : [...current, id];
  writeIds(next);
  return next;
}

export interface FavoritesApi {
  favorites: Set<number>;
  toggle: (id: number) => void;
  isFav: (id: number) => boolean;
}

/**
 * React hook mirroring the localStorage favorites store. Starts empty (so
 * server and first client render match, avoiding hydration mismatches), then
 * hydrates from localStorage on mount and stays in sync with any other
 * `useFavorites()` instance — same tab or another one.
 */
export function useFavorites(): FavoritesApi {
  const [favorites, setFavorites] = useState<Set<number>>(new Set());

  useEffect(() => {
    setFavorites(new Set(readIds()));
    const sync = () => setFavorites(new Set(readIds()));
    window.addEventListener(SYNC_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SYNC_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = useCallback((id: number) => {
    setFavorites(new Set(toggleFavorite(id)));
  }, []);

  const isFav = useCallback((id: number) => favorites.has(id), [favorites]);

  return { favorites, toggle, isFav };
}
