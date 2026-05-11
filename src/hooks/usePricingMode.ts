/**
 * usePricingMode -- single source of truth for whether the tenant
 * enters prices inc-VAT or ex-VAT.
 *
 * Every price input across menu items, equipment, inventory cost
 * etc. should call this hook and use the returned `mode` + `label`
 * so the form copy stays consistent with the math elsewhere.
 *
 * Loads from companies.pricing_includes_vat once on mount per
 * companyId. Default is `ex` for back-compat with tenants that
 * existed before the flag.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { vatLabel } from "@/lib/vatMath";

export interface PricingMode {
  mode: "inc" | "ex";
  /** Suffix label for form fields: "(inc VAT)" or "(ex VAT)". */
  label: string;
  /** True until the company row has resolved. UI can render either
   *  state without flicker since the default is the same as the
   *  most common stored value (ex), but guards exist for code paths
   *  that explicitly need to wait. */
  ready: boolean;
}

export function usePricingMode(): PricingMode {
  const { profile } = useAuth() as any;
  const companyId: string | null = profile?.company_id ?? null;

  const [includesVat, setIncludesVat] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setIncludesVat(false);
      setReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("companies")
          .select("pricing_includes_vat")
          .eq("id", companyId)
          .maybeSingle();
        if (cancelled) return;
        setIncludesVat((data as any)?.pricing_includes_vat === true);
      } catch {
        // Default to ex-VAT on any failure. Better to under-charge
        // (operator sees ex-VAT label and types ex-VAT) than to
        // over-charge by mislabelling.
        if (!cancelled) setIncludesVat(false);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const mode: "inc" | "ex" = includesVat ? "inc" : "ex";
  return { mode, label: vatLabel(mode), ready };
}
