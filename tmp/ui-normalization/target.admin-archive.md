 ✅ removed DB names from copy | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ not-quoted list collapses with count | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ help note full width | ✅ collapsed cards no longer stretch | ✅ branch stat tiles no longer cramped | ✅ | ✅ empty-state copy matches button | ✅ | ✅ advanced filters + saved views collapse | ✅ date/guests no longer wrap | ✅ empty bucket offers Show open quotes | ✅ | ✅ row actions contained; WhatsApp icon-only fix | ✅ | ✅ | ✅ venue no longer overlaps driver column | ✅ breadcrumb matches nav |# Target: complete company admin UI normalization

**Status: In progress.** The user has authorized implementation and local verification of this scope.

## Objective

Update every company admin page to follow the clear, consistent UI and UX already established in the kitchen and driver portals.

## Requirements

1. Review the current code, staged and unstaged changes, and commit history—especially `5cb27b36` (driver clarity and navigation) and `49896478` (kitchen UI improvements). Build on existing normalization work and shared components.
2. Inventory every company admin route, including nested pages, detail views, forms, settings, onboarding, and team management.
3. Normalize headings, spacing, cards, buttons, navigation, filters, and action placement. Use plain labels and short descriptions so users immediately understand each page and their next action.
4. Keep primary tasks, current work, and important alerts visible. Collapse optional details and advanced sections appropriately, with consistent controls and useful summaries.
5. Preserve unsaved values and expansion state during updates; reveal validation errors automatically.
6. Keep optional overlays closed until requested and prevent floating widgets from covering controls.
7. Preserve tenant branding, permissions, links, and existing business workflows.
8. Verify all scoped routes locally across desktop, tablet, and mobile, and check shared components in the kitchen and driver portals.
9. Complete the implementation and verification. Deliver a route checklist, representative screenshots, checks performed, and any remaining blockers or justified exceptions.

## Mandatory UI-only boundary and reliability

- Make changes only to frontend presentation and UI interaction. Do not change backend code, API routes, database schemas, migrations, Supabase configuration, RLS policies, authentication or authorization logic, server jobs, integrations, or backend business rules as part of this task.
- Preserve existing API contracts, request payloads, data fetching, service behavior, calculations, payment behavior, and save operations. A layout change must not change the underlying workflow or its results.
- Keep all existing functionality working while normalizing the UI. Do not introduce runtime exceptions, console errors, failed requests, broken links, inaccessible controls, lost form values, or unexpected state resets.
- Check affected routes and shared components for rendering and interaction regressions, browser console errors, and failed network requests. Exercise existing workflows safely and run appropriate existing lint, type, build, and targeted checks. Fix UI-caused regressions before marking work complete.
- If a problem requires a backend change, document the exact issue and stop that dependent change. Continue independent UI work; backend changes require a separate explicit user instruction.
- Distinguish pre-existing errors from new regressions and report unresolved issues with evidence. Do not claim an error-free result without completing the relevant checks.

## Scope and exceptions

- Company admin routes under `src/pages/admin`, including aliases and redirects, are the implementation scope.
- Platform-only routes are recorded separately. Shared components must continue to work there.
- Print tickets and delivery sheets retain their document-specific layouts.
- Local UI review uses authorized sessions. The local application uses the configured remote Supabase database; checks must avoid changing live business records or initiating payments.
- `goal.md` provides background intent. The route checklist and actual check results determine completion.

## Completion checklist

- [x] Review reference commits and preserve existing staged and unstaged work.
- [x] Inventory admin source routes, including aliases, redirects, dynamic routes, and platform routes.
- [x] Implement shared disclosure, navigation, and setup-panel behavior.
- [x] Normalize and locally check the company dashboard.
- [x] Complete all company page reviews and remaining UI changes (desktop 1440 reviewed page by page, 2026-10-04).
- [ ] Verify desktop, tablet, mobile, validation, state preservation, and overlays.
- [ ] Check kitchen, driver, and platform shared surfaces.
- [x] Review the final diff to confirm this task introduced no backend changes or changes to API contracts and business behavior (only the 3 pre-existing API/service edits remain; none from this task).
- [x] Verify no new UI runtime errors, failed requests, or overflow in the checked routes (87/87 pass desktop + 390px mobile, 2026-10-04).
- [ ] Deliver the completed route checklist, screenshots, check results, and exceptions.

## References

- Reference commits: `5cb27b36` (driver clarity and navigation), `49896478` (kitchen UI improvements).
- Background intent: `goal.md`, `company-admin-ui-prompt.md`.
- Shared building blocks (reuse, do not fork):
  - `src/components/ui/card.tsx`: `Card collapsible defaultOpen collapseLabel` (disclosure, auto-open on validation errors and hash links).
  - `src/components/portal/ui.tsx`: `PortalShell`, `PortalHeader` (page header, description, actions).
  - `src/components/admin/AdminNav.tsx` + `src/components/navigation/PortalSidebar.tsx`: sidebar sections and items.
  - `src/components/admin/AdminSetupSticky.tsx`: floating setup pill (must not cover controls).
- Checks: `tmp/ui-normalization/check-admin-ui.mjs` (read-only route check), `scripts/open-all-users-local.mjs` (logged-in window per role).

## Page standard (what "polished" means for every page)

1. Shared shell + sidebar + `PortalHeader` with a plain title, one-line description and primary action on the right.
2. Breadcrumb under the header; no duplicate titles.
3. Key numbers / current work / alerts visible first. Lists and tables visible without extra clicks.
4. Optional, advanced or long secondary blocks use `Card collapsible` (closed by default) with a title, short description and a count or summary visible while closed.
5. Filters grouped in one row/card; actions in a consistent place (header right, or card header right).
6. No horizontal scroll at 1440 / 768 / 390; floating widgets never cover controls.
7. No new console errors or failed requests; save flows, links and permissions unchanged.

## Page checklist

Status key: **Auto** = loads with sidebar + header, no errors/failed requests/overflow (read-only check). **Review** = full-page screenshot reviewed and polish applied. `-` = not done yet.

### Sidebar: Today
| Page | Route | Auto | Review |
|---|---|---|---|
| Dashboard | /admin/dashboard | ✅ | ✅ attention widgets collapse with counts |
| Attention center | /admin/exceptions | ✅ | ✅ breadcrumb matches nav |
| Dispatch | /admin/order-assignments | ✅ | ✅ venue no longer overlaps driver column |
| Live operations | /admin/tracking | ✅ | ✅ |
| Calendar | /admin/calendar | ✅ | ✅ |

### Sidebar: Sales
| Page | Route | Auto | Review |
|---|---|---|---|
| Contacts | /admin/contacts | ✅ | ✅ row actions contained; WhatsApp icon-only fix |
| Leads | /admin/leads | ✅ | ✅ |
| Quotes | /admin/quotes | ✅ | ✅ empty bucket offers "Show open quotes" |
| Orders | /admin/orders | ✅ | ✅ date/guests no longer wrap |
| Invoices | /admin/invoices | ✅ | ✅ advanced filters + saved views collapse |
| Reviews | /admin/reviews | ✅ | ✅ |

### Sidebar: Operations
| Page | Route | Auto | Review |
|---|---|---|---|
| Routes | /admin/route-planning | ✅ | ✅ empty-state copy matches button |
| Vehicles | /admin/vehicles | ✅ | ✅ |
| Regions | /admin/regions | ✅ | ✅ branch stat tiles no longer cramped |

### Sidebar: Finance (finance roles)
| Page | Route | Auto | Review |
|---|---|---|---|
| Finance overview | /admin/financial-dashboard | ✅ | ✅ collapsed cards no longer stretch |
| Event profitability | /admin/event-profitability | ✅ | ✅ help note full width |
| Recurring invoices | /admin/recurring-invoices | ✅ | ✅ |
| Cashflow | /admin/cashflow-dashboard | ✅ | ✅ |
| Balances | /admin/outstanding-balances | ✅ | ✅ |
| Payables | /admin/payables | ✅ | ✅ |
| Fixed costs | /admin/fixed-costs | ✅ | ✅ |
| Refunds | /admin/refunds | ✅ | ✅ |
| Tax & purchases | /admin/tax-purchases | ✅ | ✅ |
| Health checks | /admin/money-health | ✅ | ✅ |

### Sidebar: Catalogue
| Page | Route | Auto | Review |
|---|---|---|---|
| Offering | /admin/offering | ✅ | ✅ not-quoted list collapses with count |
| Menu | /admin/menu | ✅ | ✅ |
| Stock | /admin/stock | ✅ | ✅ |
| Inventory | /admin/inventory | ✅ | ✅ |
| Equipment | /admin/equipment | ✅ | ✅ |
| Suppliers | /admin/suppliers | ✅ | ✅ |
| Outsource | /admin/outsource-providers | ✅ | ✅ |
| Shopping | /admin/shopping | ✅ | ✅ removed DB names from copy |

### Sidebar: Team
| Page | Route | Auto | Review |
|---|---|---|---|
| Teams hub | /admin/teams | ✅ | ✅ loads slowly (>10s), noted |
| Users & roles | /admin/users | ✅ | ✅ role chip tags wrap |
| Kitchen | /admin/teams/kitchen | ✅ | ✅ |
| Drivers | /admin/teams/drivers | ✅ | ✅ page names instead of raw paths |
| Driver schedule | /admin/driver-schedule | ✅ | ✅ |
| Cleaning | /admin/teams/cleaning | ✅ | ✅ |
| HR | /admin/hr-solutions | ✅ | ✅ |
| Holiday calendar | /admin/public-holidays | ✅ | ✅ |
| Onboarding | /admin/onboarding | ✅ | ✅ |
| Wages (payroll roles) | /admin/wages | ✅ | ✅ |
| Staff rates | /admin/staff | ✅ | ✅ |
| Staff hours | /admin/staff-hours | ✅ | ✅ plain-language empty state |
| Monthly audit | /admin/staff-hours?tab=monthly-audit | ✅ | ✅ loads |
| Driver settlement | /admin/driver-settlement | ✅ | ✅ amounts no longer wrap |
| Kitchen settlement | /admin/kitchen-settlement | ✅ | ✅ plain-language copy |

### Sidebar: Settings (owner/admin)
| Page | Route | Auto | Review |
|---|---|---|---|
| Company | /admin/company-profile | ✅ | ✅ removed code names from copy |
| Branding | /admin/white-label | ✅ | ✅ |
| Kitchen | /admin/kitchen-settings | ✅ | ✅ plain-language note |
| Daily operations | /admin/daily-operations | ✅ | ✅ readable role names |
| Email | /admin/email-settings | ✅ | ✅ |
| Integrations | /admin/integrations | ✅ | ✅ plain-language QuickBooks copy |
| Lead forms | /admin/integrations/embed | ✅ | ✅ |
| Messages | /admin/email-templates | ✅ | ✅ |
| Notifications | /admin/notification-settings | ✅ | ✅ plain-language save note |
| Audit log | /admin/audit-logs | ✅ | ✅ |
| AI brain | /admin/ai-brain | ✅ | ✅ removed internal "Phase 2" chip |
| AI access | /admin/ai-brain/access | ✅ | ✅ |
| Subscription | /admin/subscription | ✅ | ✅ |
| Payment gateways | /admin/payment-gateways | ✅ | ✅ |
| System | /admin/settings | ✅ | ✅ removed DB table chips |
| My Profile (shared, outside /admin) | /account/settings | - | - |

### Not in sidebar: detail, form and sub-pages
| Page | Route | Auto | Review |
|---|---|---|---|
| Quote detail | /admin/quotes/[id] | ✅ | ✅ full-width when no change requests |
| New quote | /admin/quotes/new | ✅ | ✅ |
| New lead | /admin/leads/new | ✅ | ✅ |
| Supplier detail | /admin/suppliers/[id] | ✅ | ✅ setup pill no longer covers filters |
| Outsource provider detail | /admin/outsource-providers/[id] | ✅ | ✅ |
| Lead form editor | /admin/integrations/embed/[id] | ✅ | ✅ readable Ready chip |
| Onboarding: clients | /admin/onboarding/clients | ✅ | ✅ |
| Onboarding: import | /admin/onboarding/import | ✅ | ✅ |
| Onboarding: imports | /admin/onboarding/imports | ✅ | ✅ |
| Onboarding: receipts | /admin/onboarding/receipts | ✅ | ✅ |
| Notifications inbox | /admin/notifications | ✅ | ✅ |
| Client search | /admin/client-search | ✅ | ✅ same as Contacts |
| Cleaning schedule | /admin/cleaning-schedule | ✅ | ✅ |
| Dispatch queue | /admin/dispatch-queue | ✅ | ✅ same as Dispatch |
| Driver management | /admin/driver-management | ✅ | ✅ |
| Equipment damages | /admin/equipment-damages | ✅ | ✅ |
| Inventory recipes | /admin/inventory-recipes | ✅ | ✅ same as Menu |
| Inventory tracking | /admin/inventory-tracking | ✅ | ✅ same as Inventory |
| Kitchen schedule | /admin/kitchen-schedule | ✅ | ✅ |
| Kitchen staff | /admin/kitchen-staff | ✅ | ✅ same as Staff rates |
| Live operations (legacy) | /admin/live-operations | ✅ | ✅ same as Live operations |
| Shopping team | /admin/teams/shopping | ✅ | ✅ |
| Order ticket (print, exception) | /admin/orders/[id]/ticket | n/a | keeps print layout |
| Delivery sheet (print, exception) | /admin/orders/delivery-sheet | ✅ | keeps print layout |

### Aliases and redirects (verify they land correctly)
/admin/clients, /admin/dispatch, /admin/package, /admin/packages, /admin/packages/[id], /admin/kitchen-duty-tracking, /admin/messaging-templates, /admin/integrations/embed/new: all ✅ Auto.

### Platform (super_admin, shared components only; record separately)
/admin/platform, dashboard, company-database, user-management, subscription-management, pricing-management, trial-management, currency-monitoring, cms-blog, cms-pages, tax-rules, audit-logs, financial-dashboard, messaging-templates, payment-issues, running-todo, settings, tech-costs, tenant-health: Auto `-`, Review `-`.

### Role views to spot-check
Company admin, Admin, Admin Staff (reduced sidebar), Finance role (Finance section), Payroll role (Wages cluster), Super admin (Platform).

## Second polish pass (2026-10-04, section by section)

Shared (affects every admin page):
- Compact page header: smaller title/padding, actions on the title row, uniform 36px action buttons.
- Breadcrumb row tighter; "TENANT" tag removed on admin pages.
- Stat tiles lighter (less padding, smaller icon and number).
- Catalogue strip is now one tab row with flags; counts on hover.
- Setup pill hidden once setup is complete (Onboarding stays in the sidebar).
- Timezone chip removed from Dashboard / Orders / Invoices headers.

Per section:
- Today: dashboard to-do list folds when complete; quote pipeline tile joins the KPI grid; attention widgets single column with one-line descriptions; Attention center instructions box -> one line; Calendar duplicate totals card removed.
- Sales: Contacts insights folded into "Client insights" (closed), mail and test-record notices -> one line; Leads subtitle shortened; Quotes opens on Open when In play is empty, region box slimmed, quote card totals on one line.
- Operations: Routes subtitle shortened; Regions duplicate stat row and back link removed.
- Finance: forecast-moved and tax "read-only" banners -> one line; cost-coverage box -> one line; margin copy without code names.
- Catalogue: reviewed; lists are working content, kept.
- Team: HR tool cards use outline buttons, "Active" badge hidden.
- Settings: Messages template groups fold (8,822px -> ~2,200px), intro boxes merged; Settings card descriptions in plain language.

Open items (not UI, not changed):
- Money health shows "Queue stale - worker may be down" (8 emails waiting ~12h). Backend/worker issue.
- Finance overview says "Strong Financial Position" while net 30-day cash flow is negative. Business-rule text, needs a product decision.
- Teams hub takes >10s to load data.
- Local dev server needs NODE_OPTIONS=--max-old-space-size=6144 to survive a full route sweep.

## Evidence

- Route inventory: `tmp/ui-normalization/route-inventory.json`.
- Per-section decisions: `tmp/ui-normalization/section-decisions.json`.
- Local route results: `tmp/ui-normalization/admin-ui-report.json`.
- Screenshots: `tmp/ui-normalization/`.
- 2026-10-04: Detail routes checked (quotes/[id], suppliers/[id], outsource-providers/[id], integrations/embed/[id]): 200, no page errors, no failed requests, no overflow. Fixes: setup pill no longer blocks taps through its fixed strip and hides on phones once setup is complete; quote detail only reserves the side column when change requests exist. `tsc` clean; ESLint 0 errors.

Update this file as implementation and verification progress. Do not mark completion until the remaining checks have been performed or a specific exception is documented.
