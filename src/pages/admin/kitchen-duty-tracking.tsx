import { useEffect } from "react";
import { useRouter } from "next/router";

/**
 * Admin entry point for kitchen duty tracking.
 *
 * History:
 *   - Original build: placeholder div ("Kitchen Duty Tracking Content").
 *   - First fix: redirect to /team-portal/kitchen/duty (the staff
 *     clock-in surface). But that bounced admins INTO the
 *     kitchen-staff portal lens, which was the wrong context for an
 *     admin looking to see who's clocked in.
 *   - Phase 3b kitchen sweep: redirect to /admin/kitchen-schedule
 *     instead. That's the dispatcher's weekly grid with late/missed
 *     badges, which is the actual job an admin clicking the
 *     kitchen_clock_in notification wants to do.
 *
 * New notifications produced by kitchenDutyService link directly at
 * /admin/kitchen-schedule. This redirect remains to catch existing
 * notification rows already in the database (180-day notification
 * retention). Once the next retention sweep clears the old rows,
 * this file can be deleted.
 */
export default function KitchenDutyTrackingRedirect() {
  const router = useRouter();
  useEffect(() => {
    // Preserve any querystring (shiftId is the common one).
    const { shiftId, ...rest } = router.query as Record<string, string>;
    const qs = new URLSearchParams();
    if (shiftId) qs.set("shiftId", shiftId);
    for (const [k, v] of Object.entries(rest)) {
      if (typeof v === "string") qs.set(k, v);
    }
    const suffix = qs.toString();
    router.replace(`/admin/kitchen-schedule${suffix ? `?${suffix}` : ""}`);
  }, [router]);
  return null;
}