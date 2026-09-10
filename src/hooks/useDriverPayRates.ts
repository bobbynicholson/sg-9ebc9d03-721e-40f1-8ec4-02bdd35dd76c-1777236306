/**
 * useDriverPayRates - DRV-C (driver deep audit, DRV-9)
 *
 * One canonical hook for "what does this driver get paid". Pre-fix,
 * /team-portal/driver/dashboard.tsx (lines 96-107) and
 * /team-portal/driver/routes.tsx (lines 68-79) each ran the same
 * three-step effect: getCompanyDefaults + getDriverProfile +
 * resolveEffectiveRates -> setPayRates. Two pages meant two fetches
 * per session and two places to keep in sync.
 *
 * Returns the resolved rates plus a `loading` flag so the caller
 * can show skeletons while the rates land. Null when the user is
 * not signed in / has no company - matches the previous useState
 * default.
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  driverPayService,
  resolveEffectiveRates,
  type DriverPayRates,
} from "@/services/driverPayService";

export function useDriverPayRates(): {
  payRates: DriverPayRates | null;
  loading: boolean;
} {
  const { user } = useAuth();
  const [payRates, setPayRates] = useState<DriverPayRates | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.id || !user?.company_id) {
      setPayRates(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [defaults, profile] = await Promise.all([
          driverPayService.getCompanyDefaults(user.company_id),
          driverPayService.getDriverProfile(user.id),
        ]);
        if (!cancelled) setPayRates(resolveEffectiveRates(profile, defaults));
      } catch (e) {
        if (!cancelled) {
          console.warn("[useDriverPayRates] resolve failed:", e);
          setPayRates(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, user?.company_id]);

  return { payRates, loading };
}
