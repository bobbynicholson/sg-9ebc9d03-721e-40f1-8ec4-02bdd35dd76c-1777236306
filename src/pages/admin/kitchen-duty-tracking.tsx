import { useEffect } from "react";
import { useRouter } from "next/router";

/**
 * Admin entry point for kitchen duty tracking. The previous build
 * shipped a placeholder div ("Kitchen Duty Tracking Content"); the
 * real duty roster + clock-in surface lives in the kitchen portal.
 * Redirect there rather than maintain a stub that lies to whoever
 * lands on it from AdminNav / Cmd+K.
 */
export default function KitchenDutyTrackingRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/team-portal/kitchen/duty");
  }, [router]);
  return null;
}