/**
 * Global region filter for admin views.
 *
 * Multi-branch operators want a single dropdown that scopes every list
 * (orders, quotes, leads, clients, dashboard) to one branch at a time.
 * RLS already restricts WHAT they can see; this filter narrows it
 * further on the client so a company_admin running 3 branches can sit
 * on "JHB only" without losing read access to CPT.
 *
 * Behaviour:
 *   - Single-branch tenants: filter is hidden, value stays "all".
 *   - Multi-branch tenants: dropdown lists every region row with coords
 *     plus an "All branches" option. Selection persists in
 *     localStorage per-tenant so reload doesn't reset.
 *   - Pages opt in by reading `regionFilterId` from the hook and
 *     adding `.eq("region_id", id)` to their queries when it's set.
 *     They MUST also accept null rows (legacy / company-wide) when the
 *     filter is "all" -- a region_id IS NULL row should never disappear
 *     just because someone scoped to a branch.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyKitchens, type KitchenOption } from "@/hooks/useCompanyKitchens";
import { isCrossBranchAdmin } from "@/lib/authGuards";
import { UserRole } from "@/types/app";

interface RegionFilterValue {
  /** Currently selected region id, or null when "all branches". */
  regionFilterId: string | null;
  /** True while the kitchens list is loading. */
  loading: boolean;
  /** All kitchen origins available to the current tenant. */
  options: KitchenOption[];
  /** True when the dropdown should be shown (more than one origin). */
  hasMultipleBranches: boolean;
  /** Setter -- pass null to clear back to "all". */
  setRegionFilterId: (id: string | null) => void;
}

const RegionFilterCtx = createContext<RegionFilterValue | null>(null);

const storageKey = (companyId: string | null | undefined) =>
  companyId ? `cms.regionFilter.${companyId}` : "cms.regionFilter._anon";

export function RegionFilterProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth() as any;
  const companyId = user?.company_id ?? null;
  const { kitchens, loading } = useCompanyKitchens(companyId);

  // Only "real" regions can be used as a filter -- the HQ fallback is a
  // virtual origin that maps to NULL region_id, so picking it would be
  // identical to "all" and just confuses people.
  //
  // For role-scoped admins (region_admin, branch staff) the dropdown
  // is further narrowed to the branches assigned on their profile via
  // regions_covered or region_id. Cross-branch roles see everything.
  const options = useMemo(() => {
    const realRegions = kitchens.filter((k) => k.source === "region");
    const role = (profile?.role as UserRole) ?? null;
    if (!role || isCrossBranchAdmin(role)) return realRegions;
    const covered: string[] = Array.isArray(profile?.regions_covered) ? profile.regions_covered : [];
    const primary: string | null = profile?.region_id ?? null;
    if (covered.length > 0) return realRegions.filter((r) => covered.includes(r.id));
    if (primary) return realRegions.filter((r) => r.id === primary);
    return realRegions; // unscoped legacy user -- preserve current behaviour
  }, [kitchens, profile?.role, profile?.regions_covered, profile?.region_id]);
  const hasMultipleBranches = options.length > 1;

  const [regionFilterId, setRegionFilterIdState] = useState<string | null>(null);

  // Hydrate from localStorage once we know the company.
  useEffect(() => {
    if (typeof window === "undefined" || !companyId) return;
    try {
      const raw = window.localStorage.getItem(storageKey(companyId));
      if (raw && raw !== "all") setRegionFilterIdState(raw);
      else setRegionFilterIdState(null);
    } catch {
      setRegionFilterIdState(null);
    }
  }, [companyId]);

  // Auto-clear if the saved id no longer matches any current option
  // (region was deleted / deactivated). Without this the user would see
  // empty lists with no way to recover.
  useEffect(() => {
    if (!regionFilterId) return;
    if (loading) return;
    if (!options.some((o) => o.id === regionFilterId)) {
      setRegionFilterIdState(null);
    }
  }, [regionFilterId, options, loading]);

  const setRegionFilterId = (id: string | null) => {
    setRegionFilterIdState(id);
    if (typeof window !== "undefined" && companyId) {
      try {
        window.localStorage.setItem(storageKey(companyId), id || "all");
      } catch { /* noop */ }
    }
  };

  return (
    <RegionFilterCtx.Provider
      value={{
        regionFilterId,
        loading,
        options,
        hasMultipleBranches,
        setRegionFilterId,
      }}
    >
      {children}
    </RegionFilterCtx.Provider>
  );
}

export function useRegionFilter(): RegionFilterValue {
  const v = useContext(RegionFilterCtx);
  if (!v) {
    // Fail soft: pages outside the provider get a no-op shape so they
    // don't crash. Common case is the public client portal under /c/
    // where region filtering has no meaning.
    return {
      regionFilterId: null,
      loading: false,
      options: [],
      hasMultipleBranches: false,
      setRegionFilterId: () => {},
    };
  }
  return v;
}
