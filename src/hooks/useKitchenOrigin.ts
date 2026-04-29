/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { NavOrigin } from "@/lib/driverNavigation";

/**
 * Resolves the right kitchen to use as the navigation origin for a given
 * driver. Priority:
 *   1. Driver's region (profiles.region_id) -- per-branch kitchen
 *   2. Company HQ (companies.headquarters_lat / address_line1)
 *
 * Multi-branch operations (Spit Braai = CPT + JHB, etc) get accurate
 * "from kitchen" routing per branch instead of one shared HQ.
 */
export function useKitchenOrigin(userId?: string | null, companyId?: string | null) {
  const [origin, setOrigin] = useState<NavOrigin | null>(null);
  const [source, setSource] = useState<"region" | "company" | null>(null);

  useEffect(() => {
    if (!userId || !companyId) {
      setOrigin(null);
      setSource(null);
      return;
    }
    let cancelled = false;

    (async () => {
      // Try region first
      const { data: profile } = await supabase
        .from("profiles")
        .select("region_id")
        .eq("id", userId)
        .maybeSingle();

      if (profile?.region_id) {
        const { data: region } = await supabase
          .from("regions")
          .select("address, city, province_state, postal_code, lat, lng")
          .eq("id", profile.region_id)
          .maybeSingle();
        if (!cancelled && region && (region.lat != null || region.address)) {
          const parts = [region.address, region.city, region.province_state, region.postal_code].filter(Boolean);
          setOrigin({
            lat: region.lat ?? null,
            lng: region.lng ?? null,
            address: parts.length > 0 ? parts.join(", ") : null,
          });
          setSource("region");
          return;
        }
      }

      // Fall back to company HQ
      const { data: company } = await supabase
        .from("companies")
        .select("address_line1, city, state_province, postal_code, headquarters_lat, headquarters_lng")
        .eq("id", companyId)
        .maybeSingle();
      if (cancelled || !company) return;
      const parts = [company.address_line1, company.city, company.state_province, company.postal_code].filter(Boolean);
      setOrigin({
        lat: company.headquarters_lat ?? null,
        lng: company.headquarters_lng ?? null,
        address: parts.length > 0 ? parts.join(", ") : null,
      });
      setSource("company");
    })();

    return () => { cancelled = true; };
  }, [userId, companyId]);

  return { origin, source };
}
