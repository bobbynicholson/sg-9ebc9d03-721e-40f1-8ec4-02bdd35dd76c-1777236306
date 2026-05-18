/**
 * /team-portal/kitchen/orders/[id]/ticket - Wave 70.18
 *
 * Kitchen-portal entry point for the same kitchen ticket page that
 * lives at /admin/orders/[id]/ticket. Re-exports the admin module
 * so there's zero duplication.
 *
 * Why: the middleware gates /admin/* to ADMIN_PORTAL_ROLES only;
 * kitchen_staff users get redirected with "unauthorized" if they
 * try to open the admin URL even though the page's own
 * ProtectedRoute allowlist includes KITCHEN_STAFF. By mounting
 * the same component under /team-portal/kitchen/* (which the
 * middleware allows for kitchen_staff + admins), every kitchen
 * user - real chefs and admins view-switching as kitchen - can
 * open the ticket without hitting the middleware deny.
 *
 * Bobby's reality: clicked from the kitchen Today page, got
 * Access denied. Now: routes to this kitchen-portal-namespaced
 * URL and the middleware lets it through.
 */
export { default } from "@/pages/admin/orders/[id]/ticket";
