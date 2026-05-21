import { useEffect } from "react";
import { useRouter } from "next/router";

/**
 * /team-portal/shopping/alerts - DEPRECATED.
 *
 * The original page rendered inventory_demand_outlook as a passive
 * status table. Wave 70.30 replaced it with the action-driven
 * /team-portal/shopping/buy-list (checkboxes, bulk-add, sticky footer
 * action bar). The /alerts route was kept to preserve bookmarks.
 *
 * Phase 3d cleaning sweep: the static-fallback nav still pointed
 * "Buy list" at /alerts, so the canonical surface was effectively
 * orphaned from the primary nav action. Re-pointed the nav + admin
 * link to /buy-list and collapsed this page to a redirect stub.
 * Anyone landing here from a stale bookmark gets bounced to the
 * canonical page within one tick.
 *
 * Slated for deletion in a follow-up once 60 days have passed and
 * the bookmark traffic to /alerts is effectively zero.
 */
export default function ShoppingAlertsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/team-portal/shopping/buy-list");
  }, [router]);
  return null;
}
