/**
 * DI-C (admin-dispatch audit, 2026-05-19) - /admin/dispatch
 * route alias for /admin/order-assignments.
 *
 * The AdminNav labels the surface "Dispatch" but the route was
 * /admin/order-assignments - confusing in the URL bar + bookmarks
 * + when sharing links between team members. The actual page is
 * the dispatch queue, not a generic "order assignments" lookup.
 *
 * This alias re-exports the same default component so /admin/dispatch
 * and /admin/order-assignments both resolve to the dispatch queue.
 * The nav still points at /admin/order-assignments to avoid
 * link-rot in shipped emails / external bookmarks - a follow-up
 * PR can flip the nav target once a redirect rule is added to
 * next.config (so old bookmarks land on the new canonical URL).
 */
export { default } from "./order-assignments";
