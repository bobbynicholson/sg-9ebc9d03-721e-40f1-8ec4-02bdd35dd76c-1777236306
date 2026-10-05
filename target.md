# Target: polished UI for every role portal

**Status: In progress (2026-10-05).** One standard for every role: the company admin pages plus the kitchen and driver portals are the reference. Each portal below follows the same page standard and the same UI-only boundary.

## All role portals (categorised)

| Role / portal | Pages | Status | Section |
|---|---|---|---|
| Company admin | `/admin/*` (sidebar sections Today, Sales, Operations, Finance, Catalogue, Team, Settings + sub-pages) | ✅ complete, committed | Completed targets |
| Kitchen (reference) | dashboard, duty, prep-list, production, stock, menu, calendar, notifications, settings, management; redirects: index, today, handovers, orders/[id]/ticket | ✅ reference (`49896478`) | - |
| Driver (reference) | dashboard, routes, deliveries, calendar, earnings, notifications; redirects: index, schedule, tracking | ✅ reference (`5cb27b36`) | - |
| Shopping | dashboard, buy-list, orders, kitchen-demand, restock, inventory, suppliers, invoices, receipts, notifications, settings; redirects: index, alerts | ✅ complete, committed (`01cc70ab`) | Shopping portal |
| Cleaning | dashboard, management, tasks, equipment, damage, supplies, schedules, workflows, notifications, settings, handovers/[id]; redirect: index | ✅ complete, not yet committed | Cleaning portal |
| Waiter / server | dashboard, notifications; redirect: index | ✅ complete | Waiter portal |
| Shared team page | /team-portal/general/job-progress | ✅ reviewed | Waiter portal |
| Client | /client-portal: dashboard, my-orders, quotes, billing, tracking, notifications, feedback, profile | ✅ reviewed | Client portal |
| Platform (super admin) | /admin/platform/* | shared components only | - |

### Page standard (every portal)

1. Portal page shell: sidebar, hero header with a plain title, one-line purpose and actions on the right, breadcrumb using the sidebar's page names.
2. The current task and key numbers first: stat tiles with an icon and a one-line hint (1 per row on phones, 2 on tablet, up to 4 on desktop).
3. Optional, advanced or long sections fold away (`Card collapsible` or the kitchen filter-bar pattern), closed by default, showing a count or summary while closed.
4. Filters grouped in one bar; long filter sets fold away with an "N filters active" summary.
5. Plain language: no database names, internal codes, "Wave" notes or developer wording.
6. No sideways scroll at 1440 / 768 / 390; floating widgets never cover controls.
7. UI only: no backend, API, schema, RLS, auth or business-rule changes; every save, status and permission behaves exactly as before.

# Cleaning portal

**Status: Complete (2026-10-05), not yet committed.**

## Objective

Make every cleaning-team page clear, calm and quick to use for cleaners and cleaning managers, matching the polished company admin, kitchen and driver portals: plain words, the current job first, optional detail folded away, and nothing broken.

## Who uses it

- **Cleaning staff** (`cleaning@spitbraaidelivery.co.za`): see today's jobs, clean and verify equipment, report damage, check supplies.
- **Cleaning manager** (`cleaning.manager.demo@...`): everything above plus the team, schedules, workflows and settings.
- **Admins** visiting the cleaning portal.

## Requirements

1. Inventory every route under `src/pages/team-portal/cleaning` and the shared components in `src/components/cleaning` and `src/components/navigation/CleaningNav.tsx`.
2. Each page: shared shell + header, one-line purpose, the main task visible first, optional sections collapsible with a count or summary, filters in one row, actions in a consistent place.
3. Plain language: no database names, internal codes or "Wave" notes in the UI.
4. Works at 1440 / 768 / 390 widths with no sideways scroll; floating widgets never cover controls.
5. Keep every existing workflow, permission and data write exactly as it is.

## Mandatory UI-only boundary and reliability

- Frontend presentation and interaction only. No backend, API, database, migration, RLS or auth changes unless a broken UI flow cannot be fixed otherwise - then stop and report.
- Preserve data fetching, saves, statuses and role access. Layout changes must not change results.
- No new runtime errors, console errors, failed requests or lost form values. Verify with the read-only route check, TypeScript, lint, tests and a production build.
- Checks never change live records (the local app uses the live database).

## Page checklist

Status key: **Auto** = loads with shell + header, no errors / failed requests / overflow. **Review** = screenshot reviewed and polish applied.

| Page | Route | Users | Auto | Review |
|---|---|---|---|---|
| Dashboard | /team-portal/cleaning/dashboard | staff, manager | ✅ | ✅ work-first order (counts, queue, inspections), compact empty states, duplicate title + link strip removed |
| Team management | /team-portal/cleaning/management | manager | ✅ | ✅ missed clock-outs shown as "Clocked in since…" instead of hundreds of hours |
| Tasks | /team-portal/cleaning/tasks | staff, manager | ✅ | ✅ |
| Equipment | /team-portal/cleaning/equipment | staff, manager | ✅ | ✅ "How to clean" link labelled, condition capitalised |
| Damage | /team-portal/cleaning/damage | staff, manager | ✅ | ✅ |
| Supplies | /team-portal/cleaning/supplies | staff, manager | ✅ | ✅ OK shown green (was brand red), "par" -> "min" |
| Schedules | /team-portal/cleaning/schedules | staff, manager | ✅ | ✅ plain subtitle |
| Workflows | /team-portal/cleaning/workflows | manager | ✅ | ✅ categories folded by default (3321 -> 1033px), "SOP" removed from UI |
| Notifications | /team-portal/cleaning/notifications | staff, manager | ✅ | ✅ readable type labels, repeated reminders grouped (4815 -> 1990px) |
| Settings | /team-portal/cleaning/settings | staff, manager | ✅ | ✅ removed "replacement_cost" / "par" jargon |
| Handover detail | /team-portal/cleaning/handovers/[id] | staff, manager | ✅ | ✅ not-found state checked (no live handovers exist) |
| Index (redirect) | /team-portal/cleaning | all | ✅ | n/a |

## Completion checklist

- [x] Inventory routes and shared components.
- [x] Review and polish every page above (desktop 1440 as manager + cleaner, mobile 390).
- [x] Shared components checked on admin Teams > Cleaning and Teams > Kitchen.
- [x] TypeScript 0 errors, lint clean, 663/663 tests, production build 199/199 pages.
- [x] Read-only route check: 21 page loads, no errors or overflow.
- [x] Results recorded below.

## Open items (not UI)

- Demo account cleaning.manager.demo has role cleaning_staff and active role waiter, so the portal switch shows "Waiter / Server". Fix in Users & roles.
- Two staff have clock-ins weeks old (missed clock-outs); now flagged on screen, need clocking out.
- Equipment list includes test data ("E2E Hire-In Chafing Dish").

## Shopping portal (2026-10-05)

Same page standard and UI-only boundary, applied to `/team-portal/shopping/*` with the kitchen portal (`49896478`) as the visual reference. No API, schema or business-rule changes.

| Page | Route | Auto (1440 / 768 / 390) | Review |
|---|---|---|---|
| Today | /team-portal/shopping/dashboard | ✅ | ✅ kitchen workspace layout when no list: stat tiles, status card with actions, low stock alerts |
| Buy list | /team-portal/shopping/buy-list | ✅ | ✅ tile hints explain each status |
| Active shop | /team-portal/shopping/orders | ✅ | ✅ readable dates and grouped amounts, tile icons + hints, 1-col tiles on phone |
| Kitchen demand | /team-portal/shopping/kitchen-demand | ✅ | ✅ create button only when something is short; footnote no longer repeats empty state |
| Restock | /team-portal/shopping/restock | ✅ | ✅ grouped amounts |
| Inventory | /team-portal/shopping/inventory | ✅ | ✅ filters fold away like kitchen Stock |
| Suppliers | /team-portal/shopping/suppliers | ✅ | ✅ filters fold away; "Unknown" contact hidden; "Pay in N days"; neutral active count |
| Spend | /team-portal/shopping/invoices | ✅ | ✅ filters fold away; readable dates; tile icons + hints |
| Receipts | /team-portal/shopping/receipts | ✅ | ✅ plain-language intro |
| Notifications | /team-portal/shopping/notifications | ✅ | ✅ kitchen inbox summary band; readable type chips |
| Settings | /team-portal/shopping/settings | ✅ | ✅ plain-language "Coming soon" copy |
| Alerts (redirect) | /team-portal/shopping/alerts | ✅ | lands on Buy list |

Shared, shopping-scoped: breadcrumb uses sidebar names (Today, Active shop, Spend); assistant launcher is icon-only so it no longer covers row actions; `ShoppingFilterBar` (kitchen filter pattern, keeps the chat anchor); "Nothing to buy" sidebar hint.

Checks: `tmp/ui-normalization/check-portal-ui.mjs --only shopping` - 12/12 load, 0 page errors, 0 failed requests, 0 overflow at 1440/768/390. `tsc` clean, ESLint 0 errors, Jest 80/80 suites. Screenshots: `tmp/ui-normalization/portals-before/` and `portals-after/`.

Open items (not UI, not changed):
- Buy list (database view) and Restock/Inventory use different "low" rules, so Buy list can show 0 while Restock shows 10 below par. Needs a product decision.
- The sidebar "All stocked" strip follows the Buy list, so it reads "all stocked" while Restock lists items below par.

## Evidence

- Screenshots: `tmp/ui-normalization/cleaning/`.

## Completed targets

- **Company admin UI normalization** (2026-10-04/05): every admin page in the sidebar plus sub-pages reviewed and polished in two passes; order, quote, profile and contacts redesigns; AI client importer. Committed to `main` (`10b2cb7c`, `e5eae3d9`, `24c16310`). Full checklist archived at `tmp/ui-normalization/target.admin-archive.md`.
