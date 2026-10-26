# User and page loading audit

Date: 2026-10-26
Scope: authenticated Next.js workspace pages. Tenant URLs may prefix the listed paths with `/{company_slug}`. Exact access remains controlled by `src/lib/authGuards.ts` and `src/middleware.ts`.

## User types and page access

| User type | Page families |
|---|---|
| `super_admin` | Platform admin pages below, tenant admin pages, role portals, `/super-admin/admin/dashboard`, `/account/*`, and `/order/[id]`. |
| `owner`, `company_admin` | Tenant admin pages below, kitchen, driver, shopping, cleaning, waiter and client portal views allowed by the role map, `/account/*`, and `/order/[id]`. |
| `admin` | The admin subset in `ROLE_ROUTES[ADMIN]`, team portal views and `/order/[id]`. |
| `region_admin` | Branch-scoped admin subset in `ROLE_ROUTES[REGION_ADMIN]`, team portal views and `/order/[id]`. |
| `sales_admin` | Sales, client, quote and order admin subset in `ROLE_ROUTES[SALES_ADMIN]`, plus `/order/[id]`. |
| `kitchen_manager` | Kitchen and cleaning portals, `/team-portal/general/job-progress`, kitchen team/schedule/settings admin pages, `/account/*`, and `/order/[id]`. |
| `kitchen_staff` | Kitchen and cleaning portals, `/team-portal/general/job-progress`, `/account/*`, and `/order/[id]`. |
| `shopping_staff` | Shopping portal, `/team-portal/general/job-progress`, `/account/*`, and `/order/[id]`. |
| `driver` | Driver portal, `/team-portal/general/job-progress`, `/account/*`, and `/order/[id]`. |
| `waiter` | Waiter and driver portals, `/team-portal/general/job-progress`, `/account/*`, and `/order/[id]`. |
| `cleaning_manager` | Cleaning portal, cleaning team/schedule admin pages, `/team-portal/general/job-progress`, `/account/*`, and `/order/[id]`. |
| `cleaning_staff` | Cleaning portal, `/team-portal/general/job-progress`, `/account/*`, and `/order/[id]`. |
| `client` | Client portal and `/order/[id]` (client view). |

## Page inventory

`/admin/*` pages are tenant pages unless the path begins `/admin/platform`.

**Tenant admin:**

`/admin/ai-brain`, `/admin/ai-brain/access`, `/admin/audit-logs`, `/admin/calendar`, `/admin/cashflow-dashboard`, `/admin/cleaning-schedule`, `/admin/clients`, `/admin/client-search`, `/admin/company-profile`, `/admin/contacts`, `/admin/daily-operations`, `/admin/dashboard`, `/admin/dispatch`, `/admin/dispatch-queue`, `/admin/document-imports`, `/admin/driver-management`, `/admin/driver-schedule`, `/admin/driver-settlement`, `/admin/email-settings`, `/admin/email-templates`, `/admin/equipment`, `/admin/equipment-damages`, `/admin/event-profitability`, `/admin/exceptions`, `/admin/financial-dashboard`, `/admin/fixed-costs`, `/admin/hr-solutions`, `/admin/integrations`, `/admin/integrations/embed`, `/admin/integrations/embed/[id]`, `/admin/integrations/embed/new`, `/admin/inventory`, `/admin/inventory-recipes`, `/admin/inventory-tracking`, `/admin/invoices`, `/admin/kitchen-duty-tracking`, `/admin/kitchen-schedule`, `/admin/kitchen-settings`, `/admin/kitchen-settlement`, `/admin/kitchen-staff`, `/admin/leads`, `/admin/leads/new`, `/admin/live-operations`, `/admin/menu`, `/admin/messaging-templates`, `/admin/money-health`, `/admin/notifications`, `/admin/notification-settings`, `/admin/offering`, `/admin/onboarding`, `/admin/onboarding/clients`, `/admin/onboarding/import`, `/admin/onboarding/imports`, `/admin/onboarding/receipts`, `/admin/order-assignments`, `/admin/orders`, `/admin/orders/[id]/ticket`, `/admin/orders/delivery-sheet`, `/admin/outsource-providers`, `/admin/outsource-providers/[id]`, `/admin/outstanding-balances`, `/admin/package`, `/admin/packages`, `/admin/packages/[id]`, `/admin/payables`, `/admin/payment-gateways`, `/admin/public-holidays`, `/admin/quotes`, `/admin/quotes/[id]`, `/admin/quotes/new`, `/admin/recurring-invoices`, `/admin/refunds`, `/admin/regions`, `/admin/reviews`, `/admin/route-planning`, `/admin/settings`, `/admin/shopping`, `/admin/staff`, `/admin/staff-hours`, `/admin/stock`, `/admin/subscription`, `/admin/suppliers`, `/admin/suppliers/[id]`, `/admin/tax-purchases`, `/admin/teams`, `/admin/teams/cleaning`, `/admin/teams/drivers`, `/admin/teams/kitchen`, `/admin/teams/shopping`, `/admin/tracking`, `/admin/users`, `/admin/vehicles`, `/admin/wages`, `/admin/white-label`.

**Platform admin:**

`/admin/platform`, `/admin/platform/audit-logs`, `/admin/platform/cms-blog`, `/admin/platform/cms-pages`, `/admin/platform/company-database`, `/admin/platform/currency-monitoring`, `/admin/platform/dashboard`, `/admin/platform/financial-dashboard`, `/admin/platform/messaging-templates`, `/admin/platform/payment-issues`, `/admin/platform/pricing-management`, `/admin/platform/running-todo`, `/admin/platform/settings`, `/admin/platform/subscription-management`, `/admin/platform/tax-rules`, `/admin/platform/tech-costs`, `/admin/platform/tenant-health`, `/admin/platform/trial-management`, `/admin/platform/user-management`.

**Kitchen:**

`/team-portal/kitchen`, `/team-portal/kitchen/calendar`, `/team-portal/kitchen/dashboard`, `/team-portal/kitchen/duty`, `/team-portal/kitchen/handovers`, `/team-portal/kitchen/management`, `/team-portal/kitchen/menu`, `/team-portal/kitchen/notifications`, `/team-portal/kitchen/orders/[id]/ticket`, `/team-portal/kitchen/prep-list`, `/team-portal/kitchen/production`, `/team-portal/kitchen/settings`, `/team-portal/kitchen/stock`, `/team-portal/kitchen/today`.

**Driver:**

`/team-portal/driver`, `/team-portal/driver/calendar`, `/team-portal/driver/dashboard`, `/team-portal/driver/deliveries`, `/team-portal/driver/earnings`, `/team-portal/driver/notifications`, `/team-portal/driver/routes`, `/team-portal/driver/schedule`, `/team-portal/driver/tracking`.

**Shopping:**

`/team-portal/shopping`, `/team-portal/shopping/alerts`, `/team-portal/shopping/buy-list`, `/team-portal/shopping/dashboard`, `/team-portal/shopping/inventory`, `/team-portal/shopping/invoices`, `/team-portal/shopping/kitchen-demand`, `/team-portal/shopping/notifications`, `/team-portal/shopping/orders`, `/team-portal/shopping/receipts`, `/team-portal/shopping/restock`, `/team-portal/shopping/settings`, `/team-portal/shopping/suppliers`.

**Cleaning:**

`/team-portal/cleaning`, `/team-portal/cleaning/damage`, `/team-portal/cleaning/dashboard`, `/team-portal/cleaning/equipment`, `/team-portal/cleaning/handovers/[id]`, `/team-portal/cleaning/management`, `/team-portal/cleaning/notifications`, `/team-portal/cleaning/schedules`, `/team-portal/cleaning/settings`, `/team-portal/cleaning/supplies`, `/team-portal/cleaning/tasks`, `/team-portal/cleaning/workflows`.

**Waiter:** `/team-portal/waiter`, `/team-portal/waiter/dashboard`, `/team-portal/waiter/notifications`.

**Client:** `/client-portal`, `/client-portal/billing`, `/client-portal/dashboard`, `/client-portal/feedback`, `/client-portal/my-orders`, `/client-portal/notifications`, `/client-portal/profile`, `/client-portal/quotes`, `/client-portal/tracking`, and `/client/subscription-invoices`.

**Shared:** `/account/achievements`, `/account/settings`, `/team-portal/general/job-progress`, and `/order/[id]`.

Tenant route wrappers also exist at `/{company_slug}/admin/dashboard` and `/{company_slug}/admin/users`.

## Loading work completed

- Shared app authentication and the common loading screen were already optimized in this task: duplicate session hydration is suppressed, independent profile membership reads run together, and the route transition uses the branded loading screen.
- The global assistant now loads as a separate chunk across the app and the pages that mount it. Its speech and response-rendering code no longer belongs to those pages' initial shared bundle.
- Driver dashboard: active assignment rows, directly assigned orders, and the completed-today count now load concurrently. The order query selects only fields used by the dashboard.
- Client dashboard: orders, quotes, unpaid invoice summary, and paid invoice lookup now load concurrently after tenant/client identity resolves. Ratings remain a dependent second read because they need the loaded order IDs.
- Waiter dashboard: attendance and the legacy service-order lookup now start together; attendance-linked orders still load after their IDs are known.
- Cleaning dashboard: equipment and active-cleaning unit counts now load together.
- Admin stock: seven independent first-stage reads (low stock, bookings, hire-ins, demand outlook, event orders, transactions, and wastage) now load together. Dependent event/item name lookups remain after those source rows resolve.
- Kitchen duty: active and recent shift lists now load together.
- Staff directory: `getAllUsers` now returns an empty list when tenant identity is missing, preventing an unscoped profiles read.
- Admin Teams Hub: profile and shift reads start together; kitchen, driver, shopping, cleaning, hire-in, and risk metrics now run in parallel within their independent groups. The user-department lookup remains dependent on the loaded profile IDs.
- Admin orders: the order list becomes visible as soon as its primary query resolves while amount history and timeline details continue. The automation-log rows used by the timeline are reused for the status chips instead of fetched twice.
- Admin quotes: the quote list becomes visible before optional follow-up and email status data finishes. Expiring stale quotes runs as a background consistency task, and the two quote enrichments run together.
- Admin invoices: invoice rows and company payment-term settings load together; amount-change history no longer holds the invoice list behind it.
- Admin regions: each branch's monthly order projection now supplies the exact monthly count, revenue, and radius / operating-hour checks, removing two repeated order queries and a second network wait per branch.
- Platform company database: the main list uses a narrow company projection and appears before platform-wide user/order count enrichment. The company details lookup fetches only the profile fields shown in its modal.
- Inventory demand views: inventory and shopping request only the demand-view fields they render; public holidays also use a narrow projection.

These reduce serial network waits by request dependency, not by measured wall-clock time. The existing local all-role check log records Supabase DNS `ENOTFOUND` for most roles, so current live timing and live role-page verification could not be established in this environment.

## Admin coverage and measurement limits

The source scan covered all 113 `.tsx` files under `src/pages/admin`, including tenant and platform routes, and compared their route families with `ROLE_ROUTES` and middleware guards. The full route inventory above keeps the tenant, platform, staff, client, and shared page families discoverable; access remains determined by the existing guards. The scan focused on initial-load query waterfalls, duplicate reads, broad projections, request fan-out, and whether page-level loading waited for optional enrichment.

The admin dashboard, calendar, menu, contacts, kitchen schedule, and stock pages already start their independent first-stage reads together or use bounded date windows. Other admin pages that load a single settings row, a small configuration table, or dependent record details were left unchanged where broadening or rewriting the fetch would risk changing results.

The platform company database still has one backend-shaped cost: its batched user/order enrichment reads `company_id` rows across all companies to calculate per-company totals. The list now renders before those counts finish, but reducing that payload needs a server-side aggregate (for example, a grouped RPC or API query) rather than a safe client-only rewrite. This pass did not add a migration or change the live database.

These are source-level optimizations, not live timing claims. The existing all-role local check could not reach Supabase because DNS returned `ENOTFOUND` for the configured project. Page-specific real-user timings and live data verification therefore remain unavailable in this environment; the optimizations preserve tenant filters and existing role guards.
