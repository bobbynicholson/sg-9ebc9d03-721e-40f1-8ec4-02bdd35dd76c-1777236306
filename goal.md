# GOAL: Responsive-design audit across ALL admin pages

Verify every admin-facing page renders responsively (no layout breakage) at
mobile / tablet / desktop widths, for all three admin audiences:
- **super_admin** (platform) — `/admin/platform/*`
- **company_admin** and **admin** — `/{slug}/admin/*` (tenant: spit-braai-delivery)

"Responsive" here = the page must NOT overflow the viewport horizontally, and
no element may be wider than the viewport (the dominant responsive bug class:
fixed widths, min-w on grids/tables, un-wrapped rows). Verified by measuring
`documentElement.scrollWidth` vs `innerWidth` and flagging offending elements
at each breakpoint.

## Viewports
- Mobile:  390 x 844  (iPhone 12/13/14)
- Tablet:  768 x 1024 (iPad portrait)
- Desktop: 1440 x 900 (laptop)

## Method (loop engineering)
1. `scripts/responsive-audit.mjs` loads each page once as the right role,
   resizes through the 3 viewports, and records horizontal overflow + the
   worst offending elements per breakpoint. Output: `responsive-report.json`.
2. Read the report, fix the worst offenders (usually: drop/relax `min-w-[..]`,
   add `overflow-x-auto` wrappers on tables/wide rows, `flex-wrap`, `max-w-full`,
   responsive grid cols).
3. Re-run the audit for the fixed pages, confirm clean, mark done here.
4. Loop until every page passes at all 3 viewports.

## Definition of done
Every page below shows `overflow: none` at mobile, tablet, AND desktop, or a
documented, justified exception (e.g. a data table that is intentionally
horizontally scrollable inside its own `overflow-x-auto` container — that is
PASS, since the page body itself does not overflow).

## Status legend
`[ ]` pending  `[~]` in progress  `[x]` pass (or fixed + reverified)  `[!]` fail (needs fix)

---

## Platform pages (super_admin)  — /admin/platform/*
- [x] /admin/platform/dashboard
- [x] /admin/platform/company-database
- [x] /admin/platform/user-management
- [x] /admin/platform/subscription-management
- [x] /admin/platform/pricing-management
- [x] /admin/platform/trial-management
- [x] /admin/platform/currency-monitoring
- [x] /admin/platform/financial-dashboard
- [x] /admin/platform/tenant-health
- [x] /admin/platform/tech-costs
- [x] /admin/platform/messaging-templates
- [x] /admin/platform/cms-blog
- [x] /admin/platform/cms-pages
- [x] /admin/platform/tax-rules
- [x] /admin/platform/audit-logs
- [x] /admin/platform/settings
- [x] /admin/platform/running-todo

## Company admin pages (company_admin / admin) — /{slug}/admin/*
_Today / dispatch / sales / operations_
- [x] /admin/dashboard
- [x] /admin/dispatch
- [x] /admin/live-operations
- [x] /admin/calendar
- [x] /admin/contacts
- [x] /admin/leads
- [x] /admin/quotes
- [x] /admin/orders
- [x] /admin/invoices
- [x] /admin/reviews
- [x] /admin/route-planning
- [x] /admin/vehicles
- [x] /admin/regions
- [x] /admin/tracking
- [x] /admin/order-assignments
- [x] /admin/dispatch-queue

_Finance_
- [x] /admin/financial-dashboard
- [x] /admin/recurring-invoices
- [x] /admin/cashflow-dashboard
- [x] /admin/outstanding-balances
- [x] /admin/payables
- [x] /admin/fixed-costs
- [x] /admin/refunds
- [x] /admin/tax-purchases
- [x] /admin/money-health

_Catalogue_
- [x] /admin/offering
- [x] /admin/menu
- [x] /admin/stock
- [x] /admin/inventory
- [x] /admin/equipment
- [x] /admin/suppliers
- [x] /admin/outsource-providers
- [x] /admin/shopping
- [x] /admin/packages

_Team_
- [x] /admin/teams
- [x] /admin/users
- [x] /admin/teams/kitchen
- [x] /admin/teams/drivers
- [x] /admin/teams/cleaning
- [x] /admin/teams/shopping
- [x] /admin/driver-schedule
- [x] /admin/hr-solutions
- [x] /admin/public-holidays
- [x] /admin/onboarding
- [x] /admin/wages
- [x] /admin/staff
- [x] /admin/staff-hours
- [x] /admin/driver-settlement
- [x] /admin/kitchen-settlement
- [x] /admin/kitchen-schedule
- [x] /admin/cleaning-schedule
- [x] /admin/kitchen-duty-tracking

_Settings_
- [x] /admin/company-profile
- [x] /admin/white-label
- [x] /admin/kitchen-settings
- [x] /admin/email-settings
- [x] /admin/integrations
- [x] /admin/integrations/embed
- [x] /admin/email-templates
- [x] /admin/notification-settings
- [x] /admin/audit-logs
- [x] /admin/subscription
- [x] /admin/settings
- [x] /admin/payment-gateways
- [x] /admin/notifications

---

## Iteration log
(append per loop iteration: what was audited, what failed, what was fixed)

### Iteration 1 (2026-07-04) — COMPLETE
Ran scripts/responsive-audit.mjs for both groups at mobile(390) / tablet(768) / desktop(1440).
- Platform (super_admin): 17 pages, **0 overflow failures**.
- Company (company_admin/admin): 65 pages, **0 overflow failures**.
- /admin/live-operations + /admin/tracking returned http=no-response (live-GPS
  keeps networkidle from settling) but rendered real content with 0 overflow at
  all breakpoints, re-verified separately. PASS.

RESULT: all 82 admin pages are responsive at every breakpoint. No fixes required.
The loop converged on iteration 1 with nothing to fix.
