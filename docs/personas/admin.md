# Admin persona - UX decisions

**Audit date:** 2026-05-21
**Auditor:** Phase 3a admin sweep (Wave 80)
**Scope:** Every page under `src/pages/admin/**` excluding `platform/*` (super-admin / cross-tenant; out of scope for the tenant-admin persona). Driver, Kitchen, Cleaning, Shopping, Client, Owner each have their own sub-phase.

This is the canonical reference for what each admin page is for, why it exists, and what the next change should preserve. If you're about to refactor, redesign, or delete an admin page, read the relevant section first.

---

## 1. Who admin is

For the tenant-admin persona, "admin" means a single human - usually the owner of a small catering business, sometimes a dedicated operations manager - who is responsible for the entire daily flow:

- Confirming the day's orders are staffed, on-route, and on-time.
- Triaging leads + quotes + customer messages.
- Managing money: invoices, refunds, payables, cashflow.
- Keeping kitchen, drivers, and cleaning teams in sync.
- Catalogue work: menu, equipment, suppliers, regions.

Admin uses the system **every day** and often **on a phone** (at an event, between deliveries, in a moving vehicle). Polish on the high-traffic flows matters more than completeness on edge-case settings pages.

`super_admin` is a separate persona (cross-tenant ops). It owns `src/pages/admin/platform/**` and is intentionally out of scope here.

---

## 2. Page inventory

93 pages total. 11 under `platform/*` (super-admin), 82 for tenant-admin.

### 2.1 Daily-driver pages (top 10 by traffic)

These are the pages a working admin hits multiple times a day. Polish lands here first.

| URL | Job-to-be-done |
|---|---|
| `/admin/dashboard` | First open of the day. Live metrics, alerts, "Today's Pulse" widget rack. |
| `/admin/orders` | Source of truth for order status, full filter + bulk-action surface. |
| `/admin/order-assignments` | Dispatch lane. Assign drivers to orders for tomorrow. |
| `/admin/tracking` | Live map. Today's jobs in flight. |
| `/admin/contacts` | CRM inbox - next-action-sorted client list. |
| `/admin/leads` | Active pipeline. Quote conversion focus. |
| `/admin/financial-dashboard` | Weekly business health check. |
| `/admin/kitchen-schedule` | Weekly kitchen roster, late/missed clock-in badges. |
| `/admin/invoices` | Payment status + overdue tracking. |
| `/admin/cashflow-dashboard` | 30-day forecast. The "can we pay?" question. |

### 2.2 Page clusters (grouped by job, not by URL)

**Orders / dispatch**: orders, order-assignments, dispatch, tracking, route-planning, calendar, orders/delivery-sheet, driver-management, driver-schedule.

**Pipeline / sales**: leads/, quotes/, contacts, client-search, clients (redirect to contacts), packages/.

**Money**: financial-dashboard, cashflow-dashboard, invoices, payables, refunds, payment-gateways, recurring-invoices, fixed-costs, tax-purchases, wages, staff, staff-hours, driver-settlement, kitchen-settlement.

**Catalogue**: offering, menu, stock, inventory, inventory-tracking, inventory-recipes, equipment, suppliers/, outsource-providers/, shopping.

**People**: teams/, kitchen-staff, kitchen-schedule, kitchen-settings, driver-management, driver-schedule, cleaning-schedule, hr-solutions, users, onboarding/.

**Settings**: settings, company-profile, regions, public-holidays, email-settings, email-templates, messaging-templates, notification-settings, integrations, integrations/embed, white-label, smoke-test, audit-logs.

**Platform (super-admin only)**: platform/dashboard, platform/company-database, platform/user-management, platform/subscription-management, platform/pricing-management, platform/trial-management, platform/currency-monitoring, platform/cms-blog, platform/cms-pages, platform/tax-rules, platform/audit-logs, platform/financial-dashboard, platform/tech-costs, platform/settings, platform/running-todo, platform/tenant-health.

### 2.3 Duplicate / overlapping clusters - audit verdicts

**Inventory (4 pages: `stock`, `inventory`, `inventory-tracking`, `inventory-recipes`)** - **KEEP ALL**. Stock is morning triage ("what's low?"), inventory is pantry-level detail, inventory-tracking owns mutations (receive stock, cycle count), inventory-recipes is menu-to-ingredients reference. No true duplication.

**Kitchen (6 pages)** - **REMOVE the nav surface to `kitchen-duty-tracking`** (Section 3.2). The five remaining cover distinct jobs: weekly roster (`kitchen-schedule`), staff CRUD (`kitchen-staff`), config (`kitchen-settings`), pay (`kitchen-settlement`), landing hub (`teams/kitchen`).

**Driver (4 pages)** - **KEEP ALL**. Roster (`driver-management`), schedule grid (`driver-schedule`), pay (`driver-settlement`), landing hub (`teams/drivers`).

**Cleaning (2 pages)** - **KEEP BOTH**. Schedule + landing hub.

**Dashboards (3 pages)** - **KEEP ALL**. `dashboard` is operational, `financial-dashboard` is health, `cashflow-dashboard` is forecasting. Three distinct mental models.

**Messaging / email (3 pages)** - **KEEP ALL**. `email-settings` is provider config (SMTP / Gmail OAuth / Mailchimp), `email-templates` is lifecycle automation, `messaging-templates` is the full template editor across email + WhatsApp.

**Clients / contacts (3 pages)** - **KEEP ALL**. `clients` is a defensive redirect to `contacts`. `client-search` is global search. `contacts` is the CRM inbox.

**Onboarding (5 entries)** - **DEFER**. There's a routing conflict between `pages/admin/onboarding.tsx` (progress dashboard) and `pages/admin/onboarding/index.tsx` (7-step wizard) - both claim `/admin/onboarding`. In Next.js Pages Router the literal file wins, making the wizard at `/index.tsx` unreachable directly. But middleware redirects new tenants to `/admin/onboarding`, which means the redirect resolves to the progress dashboard, not the wizard. This is subtle enough that fixing it deserves its own change with explicit testing of the new-tenant signup flow - flagged for a follow-up.

---

## 3. Phase 3a changes

### 3.1 REMOVED - `/admin/job-progress-overview` redirect stub

`src/pages/admin/job-progress-overview.tsx` was a 10-line `router.replace("/admin/orders")` redirect. The nav entry (`AdminNav.tsx` Operations group) and the Command Palette entry (`CommandPalette.tsx` go-job-prog) pointed users at it, which made the IA pretend there was a "Job progress" feature when there isn't one - admin just lands on the orders table. The fan-out across `orders`, `dispatch`, `tracking` already covers the same intent properly.

- Deleted `src/pages/admin/job-progress-overview.tsx`.
- Removed the nav entry from `AdminNav.tsx` Operations group.
- Removed the Command Palette entry `go-job-prog`.

### 3.2 REMOVED - "Duty tracking" tile on the kitchen team landing page

`src/pages/admin/teams/kitchen.tsx` had a tile pointing at `/admin/kitchen-duty-tracking`, which is itself a redirect to the kitchen portal (`/team-portal/kitchen/duty`). Admin doesn't want the kitchen-staff view of who's clocked in - admin wants the dispatcher view (which late shifts need a phone call, who hasn't started yet). That view already exists at `/admin/kitchen-schedule` (weekly grid with late/missed badges).

- Updated the kitchen team landing tile to point at `/admin/kitchen-schedule` and re-labelled it "Schedule + clock-ins".
- Kept `src/pages/admin/kitchen-duty-tracking.tsx` (the redirect stub) because existing notifications produced by `kitchenDutyService.ts` link to it. Removing the file would 404 those notification clicks until every existing row is rewritten.

### 3.3 Documented - 82-page inventory, top-10 daily-driver list, IA structure

This document. New file at `docs/personas/admin.md`. Sets the agenda for follow-up sub-phases (empty-state sweep, mobile audit, IA tweaks) so they can land as focused PRs without re-deriving the inventory each time.

---

## 4. Information architecture

Current nav (`AdminNav.tsx`):

```
TODAY (4)       - Dashboard, Dispatch, Live ops, Calendar
PIPELINE (6)    - Contacts, Leads, Quotes, Orders, Packages, Client search
OPERATIONS (4)  - Plan routes, Vehicles, Regions, Public holidays   [-1 after 3.1]
MONEY (10)      - Financial, Cashflow, Invoices, Payables, Fixed costs, Refunds,
                  Wages, Staff, Staff hours, Driver settlement, Tax (gated)
CATALOGUE (8)   - Offering, Menu, Stock, Inventory, Equipment, Suppliers,
                  Outsource, Shopping
PEOPLE (7)      - Teams hub, Full team, Kitchen, Drivers, Cleaning,
                  HR solutions, Onboarding
SETTINGS (12)   - Company profile, Branding, Kitchen rules, Email, Integrations,
                  Lead forms, Messaging templates, Lifecycle emails,
                  Notifications, Audit log, Smoke test, System (gated)
PLATFORM (11)   - super_admin only, cross-tenant
```

**IA observations - deferred to follow-up phases:**

- **MONEY has 10 items.** Payroll concerns (Wages, Staff, Staff hours, Driver settlement) overlap with PEOPLE. A cleaner split would move payroll under a PEOPLE > Payroll sub-cluster, freeing MONEY for pure financial focus. Defer to the People persona phase so the split lands with that phase's other people-flow polish.
- **SETTINGS has 12 items.** Kitchen rules is operational (lead time, BCEA thresholds) not configuration; arguably belongs as a tab inside the Kitchen team landing page. Defer to the Kitchen persona phase.
- **Audit log is buried last in SETTINGS.** Acceptable for the persona that rarely uses it, but if compliance becomes a daily concern it surfaces in the wrong place. Defer.

---

## 5. Empty / loading / error state quality - assessment

Spot-check across the top 10 daily-driver pages. Verdict per page on a 3-state scale: **good** (clear copy + CTA + retry), **passable** (state exists, basic copy), **bad** (no state or wrong state).

| Page | Loading | Empty | Error |
|---|---|---|---|
| `dashboard` | passable (skeleton tiles) | good (no-orders-today copy) | bad (silent on widget failure) |
| `orders` | good | passable | passable |
| `order-assignments` | passable | passable | passable |
| `tracking` | passable | passable | bad (map-load failures swallowed) |
| `contacts` | passable | good | passable |
| `leads` | good | good | passable |
| `financial-dashboard` | passable | bad (no-data state unclear) | bad |
| `kitchen-schedule` | passable | passable | passable |
| `invoices` | good | passable | passable |
| `cashflow-dashboard` | passable | bad (zero-data renders as zeros) | bad |

The pattern: ops pages (orders, leads, contacts) are well-covered. Money pages (financial, cashflow) have weaker zero-data + error handling because they're used less and broken-state bug reports trickle in slower. These are the targets for the follow-up empty-state sweep.

**Follow-up scoped to a separate PR**: harden the loading/empty/error states on `dashboard`, `tracking`, `financial-dashboard`, `cashflow-dashboard`. Single shared error boundary for widget failures; "no data yet" copy with CTA-to-set-up for first-tenant cases.

---

## 6. Mobile audit - assessment

Quick visual pass with the browser dev-tools mobile viewport on the top 10 pages.

| Page | Mobile rating | Notes |
|---|---|---|
| `dashboard` | Good | Tiles stack, KPI strip readable |
| `orders` | Good | Table card-stack at < md |
| `order-assignments` | Passable | Drag-drop falls back to tap-pick, but the layout cramps |
| `tracking` | Passable | Map dominates; side panel becomes a sheet |
| `contacts` | Good | Inbox layout designed mobile-first |
| `leads` | Good | Card-stack |
| `financial-dashboard` | Passable | Charts overflow at narrow widths |
| `kitchen-schedule` | Bad | Weekly grid does not collapse; horizontal scroll required |
| `invoices` | Good | Table card-stack |
| `cashflow-dashboard` | Passable | Bars overflow |

**Follow-up scoped to a separate PR**: redesign `kitchen-schedule` for mobile (day-picker swap of week grid) and add `overflow-x-auto` containment on the chart pages so they don't trigger page-level horizontal scroll.

---

## 7. Open follow-ups

Tracked here so each lands as a focused PR with its own scope.

1. **Empty/loading/error sweep on money-pages**: `dashboard`, `tracking`, `financial-dashboard`, `cashflow-dashboard`.
2. **Mobile redesign for `kitchen-schedule` weekly grid + chart-overflow containment.**
3. **Onboarding routing conflict** - `pages/admin/onboarding.tsx` shadows `pages/admin/onboarding/index.tsx`. Resolve with explicit new-tenant signup test.
4. **MONEY -> PEOPLE/Payroll split** during the People persona phase.
5. **Kitchen rules -> Kitchen team Settings tab** during the Kitchen persona phase.
