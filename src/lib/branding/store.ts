/**
 * Module-level subscription store for the active tenant's branding row.
 *
 * Replaces the React context that BrandingContext used to wrap the app
 * with - one source of truth, side-effect-free for non-React callers,
 * with a tiny pub/sub for the React reader hook.
 *
 * Cache: localStorage keyed by company_id. Read for instant first paint
 * before the database round-trip resolves; never read across tenants.
 */
import type { BrandingRow } from "./applyBranding";

type Listener = (row: BrandingRow | null) => void;

const listeners = new Set<Listener>();
let current: BrandingRow | null = null;

export function getBrandingRow(): BrandingRow | null {
  return current;
}

export function setBrandingRow(row: BrandingRow | null): void {
  current = row;
  listeners.forEach((l) => l(row));
}

export function subscribeBranding(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const cacheKey = (companyId: string) => `cms.branding.${companyId}`;

export function readBrandingCache(companyId: string): BrandingRow | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(companyId));
    return raw ? (JSON.parse(raw) as BrandingRow) : null;
  } catch {
    return null;
  }
}

/** Find a previously visited tenant's public brand without waiting for auth. */
export function readBrandingCacheForSlug(slug: string): BrandingRow | null {
  if (typeof window === "undefined" || !slug) return null;
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith("cms.branding.")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const row = JSON.parse(raw) as BrandingRow;
      if (row.slug === slug) return row;
    }
  } catch {
    /* Storage is optional; auth and the workspace remain usable without it. */
  }
  return null;
}

export function writeBrandingCache(row: BrandingRow, slug?: string | null): void {
  if (typeof window === "undefined" || !row.id) return;
  try {
    const cached = { ...row, slug: slug || row.slug || null };
    window.localStorage.setItem(cacheKey(row.id), JSON.stringify(cached));
  } catch {
    /* quota; noop */
  }
}

export function clearBrandingCache(companyId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(cacheKey(companyId));
  } catch {
    /* noop */
  }
}
