import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// CLI-B (client deep audit, CLI-10): unified tenant-scoped client-id
// lookup. Dashboard, billing, my-orders, tracking and quotes were all
// resolving "every clients row this user owns under this tenant"
// independently. The bug: billing used `.in("client_id", clientIds)`
// only, while dashboard / tracking / my-orders used a UNION with
// `client_email.ilike <email>` to catch orders / quotes / invoices
// booked under the customer's email BEFORE they signed up.
//
// Result was that pre-signup invoices were invisible on /billing even
// though their parent orders showed on /dashboard. This hook is the
// canonical resolver: it returns the clients row ids plus an
// `applyTenantClientFilter` helper that composes the same union the
// dashboard uses, so every caller filters identically.
//
// Why a hook not a service: we already cache via React state inside
// pages, and the queries are tenant + user keyed so the dependency
// graph aligns with effects more cleanly than a singleton would.

interface UseTenantClientIdsResult {
  /** Every clients.id this user owns under the given tenant. */
  clientIds: string[];
  /** clients.id this user owns scoped to tenant; `null` while loading. */
  loading: boolean;
  /**
   * Apply the canonical union filter to a supabase query builder.
   * Covers the three legitimate states:
   *   1. clientIds match (sign-up linked)
   *   2. client_email ilike (orphan row from caterer pre-signup)
   *   3. neither (no data - caller should short-circuit)
   * The supplied builder's chainable methods are not strongly typed
   * across versions; we cast to `any` once at the boundary so callers
   * get a clean typed builder back.
   */
  applyTenantClientFilter: <T>(
    builder: T,
    email: string | null | undefined,
    emailColumn?: string,
  ) => T;
}

export function useTenantClientIds(
  userId: string | null | undefined,
  tenantCompanyId: string | null | undefined,
): UseTenantClientIdsResult {
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!userId || !tenantCompanyId) {
      setClientIds([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", userId)
        .eq("company_id", tenantCompanyId);
      if (cancelled) return;
      if (error) {
        console.error("[useTenantClientIds] clients fetch failed:", error);
        setClientIds([]);
      } else {
        setClientIds(((data as { id: string }[]) || []).map((r) => r.id));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, tenantCompanyId]);

  const applyTenantClientFilter = <T>(
    builder: T,
    email: string | null | undefined,
    emailColumn = "client_email",
  ): T => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = builder as any;
    if (clientIds.length > 0 && email) {
      return b.or(`client_id.in.(${clientIds.join(",")}),${emailColumn}.ilike.${email}`);
    }
    if (clientIds.length > 0) {
      return b.in("client_id", clientIds);
    }
    if (email) {
      return b.ilike(emailColumn, email);
    }
    // Neither - return the builder unmodified so the caller can detect
    // the empty-input case and short-circuit before .select().
    return b;
  };

  return { clientIds, loading, applyTenantClientFilter };
}
