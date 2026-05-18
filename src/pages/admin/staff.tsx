/**
 * /admin/staff - the company-wide staff hub.
 *
 * Same component as /admin/kitchen-staff, just routed at the unified
 * URL so 'all staff' has its own home in the nav. The page shows
 * department filter chips at the top so the operator can drill into
 * Kitchen / Cleaning / Shopping etc, but the underlying data, form
 * and actions are identical - one canonical kitchen_staff_members
 * table backs every department, with a `departments` array on each
 * row driving which duty boards each person appears on.
 *
 * Keeping the kitchen-staff route alive too so existing links from
 * /team-portal/kitchen and the kitchen tablet still resolve.
 */
export { default } from "./kitchen-staff";
