/**
 * Resolves every kitchen origin a company can deliver from.
 *
 * For multi-branch operations (Spit Braai CPT, JHB, etc) the
 * operator picks which kitchen the delivery leaves from when
 * building a quote -- distance + delivery fee come from there.
 *
 * Returns:
 *   * kitchens -- list of available origins. Each has id, name,
 *     lat, lng, address. The HQ entry has id='hq' as a stable
 *     marker (it isn't a regions row, it's the companies fallback).
 *   * loading -- true until both reads finish.
 *
 * Filtering rules:
 *   * Regions must be is_active = true
 *   * Regions must have BOTH lat and lng set (otherwise distance
 *     can't be computed -- a kitchen with no coordinates would
 *     just produce 0km / R0 fees, confusing).
 *   * Company HQ falls in only when companies.headquarters_lat AND
 *     headquarters_lng are set. Without them, the HQ entry is
 *     dropped.
 *   * If a tenant has only one usable origin, you'll get a list of
 *     length 1 -- callers can render "From {name}" instead of a
 *     picker.
 *   * If zero usable origins, kitchens is empty -- caller surfaces
 *     a "Set your kitchen address on Company profile" nudge.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface KitchenOption {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  source: "region" | "hq";
}

export function useCompanyKitchens(companyId: string | null | undefined) {
  const [kitchens, setKitchens] = useState<KitchenOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) {
      setKitchens([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      const out: KitchenOption[] = [];

      // 1. Active branch regions with coords
      const { data: regions, error: regionsError } = await supabase
        .from("regions")
        .select("id, name, code, city, address, lat, lng, is_active")
        .eq("company_id", companyId)
        .eq("is_active", true);
      if (regionsError) {
        console.error("[useCompanyKitchens] regions fetch failed:", regionsError);
      }

      for (const r of regions || []) {
        const lat = (r as any).lat;
        const lng = (r as any).lng;
        if (typeof lat === "number" && typeof lng === "number") {
          out.push({
            id: (r as any).id,
            name: (r as any).name || (r as any).code || "Branch",
            lat,
            lng,
            address: (r as any).address || (r as any).city || null,
            source: "region",
          });
        }
      }

      // 2. Company HQ as a fallback origin -- always included when
      //    coords are set so a single-branch tenant has at least
      //    one option, and a multi-branch tenant can pick "Main"
      //    when none of the named branches fit.
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .select("company_name, address_line1, city, headquarters_lat, headquarters_lng")
        .eq("id", companyId)
        .maybeSingle();
      if (companyError) {
        console.error("[useCompanyKitchens] companies fetch failed:", companyError);
      }

      const hqLat = (company as any)?.headquarters_lat;
      const hqLng = (company as any)?.headquarters_lng;
      if (typeof hqLat === "number" && typeof hqLng === "number") {
        // Avoid duplicating: if a region already shares the HQ coords,
        // skip the HQ entry. Catches single-branch tenants whose
        // region was seeded from the HQ pin.
        const overlap = out.some(
          (k) => Math.abs(k.lat - hqLat) < 0.0001 && Math.abs(k.lng - hqLng) < 0.0001,
        );
        if (!overlap) {
          out.push({
            id: "hq",
            name: out.length === 0
              ? ((company as any)?.company_name || "Main kitchen")
              : "Main kitchen (HQ)",
            lat: hqLat,
            lng: hqLng,
            address: [
              (company as any)?.address_line1,
              (company as any)?.city,
            ].filter(Boolean).join(", ") || null,
            source: "hq",
          });
        }
      }

      if (!cancelled) {
        setKitchens(out);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [companyId]);

  return { kitchens, loading };
}
