/**
 * ActiveTenantContext -- super_admin-only "which catering company am I
 * looking at right now?" state.
 *
 * Tenant admins (company_admin / admin / owner) are pinned to their
 * profile.company_id and never need this. For super_admin (Skylight
 * staff) browsing the platform, every tenant-scoped page (Driver
 * Management, Financial Dashboard, Orders, etc.) needs to know which
 * catering company's data to show. Without this context, super_admin
 * either gets empty pages (no company_id) or has to pick on every
 * page (annoying).
 *
 * Strategy:
 *   - Provider fetches the list of companies once on mount (super_admin
 *     only).
 *   - Active selection is persisted in sessionStorage so a refresh
 *     keeps the same tenant in view.
 *   - Pages call useActiveTenant() and either read activeId for their
 *     own data fetches or render the picker themselves.
 *
 * For tenant admins this context is essentially a no-op: companies
 * stays empty, activeId is null, picker is hidden.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "active-tenant-id";

export interface TenantOption {
  id: string;
  name: string;
}

interface ActiveTenantContextValue {
  /** True when the current user is super_admin and the picker matters. */
  isSuperAdmin: boolean;
  /** All catering companies the super_admin can switch to. Empty for tenant admins. */
  companies: TenantOption[];
  /** Currently selected company id. Null when super_admin hasn't picked yet, or when caller is a tenant admin (use profile.company_id). */
  activeId: string | null;
  /** Convenience -- the full row for activeId. */
  active: TenantOption | null;
  /** Setter -- super_admin only, persists to sessionStorage. */
  setActiveId: (id: string | null) => void;
  /** Loading flag for the initial companies fetch. */
  loading: boolean;
}

const ActiveTenantContext = createContext<ActiveTenantContextValue | null>(null);

export function ActiveTenantProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth() as any;
  const role = (profile?.active_role || profile?.role || "") as string;
  const isSuperAdmin = role === "super_admin";

  const [companies, setCompanies] = useState<TenantOption[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Hydrate the picked tenant from sessionStorage on mount so a page
  // refresh doesn't blank the picker.
  useEffect(() => {
    if (!isSuperAdmin) return;
    if (typeof window === "undefined") return;
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) setActiveIdState(saved);
  }, [isSuperAdmin]);

  // Pull the company list. Super_admin only; tenant admins skip.
  useEffect(() => {
    if (!isSuperAdmin) {
      setCompanies([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("companies")
          .select("id, company_name")
          .is("deleted_at", null)
          .order("company_name", { ascending: true });
        if (cancelled) return;
        if (error) {
          console.warn("ActiveTenantContext load companies failed:", error.message);
          setCompanies([]);
          return;
        }
        const list: TenantOption[] = (data || []).map((r: any) => ({
          id: String(r.id),
          name: String(r.company_name || "(unnamed)"),
        }));
        setCompanies(list);
        // If we hydrated an id from sessionStorage but the company is
        // gone (deleted, demo cleaned up, etc.), clear it.
        if (activeId && !list.some((c) => c.id === activeId)) {
          setActiveIdState(null);
          if (typeof window !== "undefined") sessionStorage.removeItem(STORAGE_KEY);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // We deliberately don't include activeId here -- the cleanup logic
    // is one-shot on companies refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  const setActiveId = useCallback((id: string | null) => {
    setActiveIdState(id);
    if (typeof window === "undefined") return;
    if (id) sessionStorage.setItem(STORAGE_KEY, id);
    else sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const active = useMemo<TenantOption | null>(
    () => (activeId ? companies.find((c) => c.id === activeId) || null : null),
    [activeId, companies],
  );

  const value: ActiveTenantContextValue = useMemo(
    () => ({ isSuperAdmin, companies, activeId, active, setActiveId, loading }),
    [isSuperAdmin, companies, activeId, active, setActiveId, loading],
  );

  return <ActiveTenantContext.Provider value={value}>{children}</ActiveTenantContext.Provider>;
}

/**
 * Read the active tenant context. Safe to call from anywhere -- if the
 * provider isn't mounted (shouldn't happen in our app but defensive),
 * returns a no-op shape so pages don't crash.
 */
export function useActiveTenant(): ActiveTenantContextValue {
  const ctx = useContext(ActiveTenantContext);
  if (!ctx) {
    return {
      isSuperAdmin: false,
      companies: [],
      activeId: null,
      active: null,
      setActiveId: () => {},
      loading: false,
    };
  }
  return ctx;
}

/**
 * Helper: resolves the company_id a page should use for data fetches.
 * For super_admin, uses the picked tenant. For tenant admins, uses
 * profile.company_id. Returns null if neither is available (page
 * should render an empty / picker prompt state).
 */
export function useScopedCompanyId(): string | null {
  const { isSuperAdmin, activeId } = useActiveTenant();
  const { profile } = useAuth() as any;
  if (isSuperAdmin) return activeId;
  return profile?.company_id || null;
}
