import { useCallback, useEffect, useState } from "react";

/**
 * A persisted view captures the filter + search state so a user can jump
 * back to a frequent slice with one click. Stored in localStorage scoped by
 * companyId, so the views don't leak across tenants on a shared browser.
 */
export interface SavedView {
  id: string;
  name: string;
  tab: "all" | "below_reorder" | "out" | "expiring";
  search: string;
  createdAt: string;
}

const storageKey = (companyId: string | null | undefined) =>
  `inventory_views_${companyId ?? "anon"}`;

export function useInventoryViews(companyId: string | null | undefined) {
  const [views, setViews] = useState<SavedView[]>([]);

  // Hydrate from localStorage on mount / when companyId changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey(companyId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setViews(parsed);
      } else {
        setViews([]);
      }
    } catch {
      setViews([]);
    }
  }, [companyId]);

  const persist = useCallback((next: SavedView[]) => {
    setViews(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey(companyId), JSON.stringify(next));
    } catch (e) {
      console.warn("Could not persist views:", e);
    }
  }, [companyId]);

  const addView = useCallback((name: string, snapshot: Omit<SavedView, "id" | "name" | "createdAt">) => {
    const view: SavedView = {
      id: Math.random().toString(36).slice(2, 10),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      ...snapshot,
    };
    persist([...views, view]);
    return view;
  }, [views, persist]);

  const removeView = useCallback((id: string) => {
    persist(views.filter(v => v.id !== id));
  }, [views, persist]);

  return { views, addView, removeView };
}
