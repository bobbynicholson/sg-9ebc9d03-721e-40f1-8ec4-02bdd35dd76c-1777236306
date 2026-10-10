import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Whether the company has enough service-area settings to compose that email. */
export function useServiceAreaEmailAvailability(companyId: string | null | undefined): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setAvailable(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("companies")
          .select("dispatch_settings")
          .eq("id", companyId)
          .maybeSingle();
        if (error) throw error;
        let dispatch: any = data?.dispatch_settings || {};
        if (typeof dispatch === "string") dispatch = JSON.parse(dispatch);
        const configured = Array.isArray(dispatch.serviceAreas)
          && dispatch.serviceAreas.some((area: unknown) => typeof area === "string" && !!area.trim());
        if (!cancelled) setAvailable(configured);
      } catch (error) {
        console.warn("[service-area-email] company settings could not be loaded:", error);
        if (!cancelled) setAvailable(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  return available;
}
