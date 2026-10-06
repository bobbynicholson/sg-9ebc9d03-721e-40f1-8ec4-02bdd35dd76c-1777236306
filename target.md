# Target: polished UI for every role portal

**Status: Complete (2026-10-06): remaining-pages pass done, not yet committed.** One standard for every role: the company admin pages plus the kitchen and driver portals are the reference. Each portal below follows the same page standard and the same UI-only boundary.

## All role portals (categorised)

| Role / portal | Pages | Status | Section |
|---|---|---|---|
| Company admin | `/admin/*` (sidebar sections Today, Sales, Operations, Finance, Catalogue, Team, Settings + sub-pages) | ✅ complete, committed | Completed targets |
| Kitchen (reference) | dashboard, duty, prep-list, production, stock, menu, calendar, notifications, settings, management; redirects: index, today, handovers, orders/[id]/ticket | ✅ reference (`49896478`) | - |
| Driver (reference) | dashboard, routes, deliveries, calendar, earnings, notifications; redirects: index, schedule, tracking | ✅ reference (`5cb27b36`) | - |
| Shopping | dashboard, buy-list, orders, kitchen-demand, restock, inventory, suppliers, invoices, receipts, notifications, settings; redirects: index, alerts | ✅ standard pass committed (`01cc70ab`); ⏳ deep UX pass in progress | Shopping portal; Shopping + Cleaning deep UX pass |
| Cleaning | dashboard, management, tasks, equipment, damage, supplies, schedules, workflows, notifications, settings, handovers/[id]; redirect: index | ✅ standard pass committed (`6686e468`); ⏳ deep UX pass in progress | Cleaning portal; Shopping + Cleaning deep UX pass |
| Waiter / server | dashboard, notifications; redirect: index | ✅ complete (2026-10-06) | Remaining pages pass, R2 |
| Shared team page | /team-portal/general/job-progress | ✅ complete (2026-10-06) | Remaining pages pass, R3 |
| Shared account pages | /account/settings (the "Profile" link in every sidebar), /account/achievements | ✅ complete (2026-10-06) | Remaining pages pass, R3 |
| Client | /client-portal: dashboard, my-orders, quotes, billing, tracking, notifications, profile; redirects: index, feedback; plus /client/subscription-invoices | ✅ complete (2026-10-06) | Remaining pages pass, R4 |
| Platform (super admin) | /admin/platform/* (17 pages + index redirect), /super-admin | ✅ complete (2026-10-06); /super-admin/admin/dashboard unreachable (open item) | Remaining pages pass, R5 |
| Customer-facing links (no sidebar) | /q/[token], /p/accept/[token], /pay/i/[token], /pay/invoice/[id], /order/[id], /c/account, /c/order/[id], /u/[token], /[company_slug]/order/[id] | ✅ complete (2026-10-06); proposal accept not checkable (no token) | Remaining pages pass, R6 |
| Sidebar + header chrome (all portals) | PortalSidebar and every *Nav, PortalHeader hero, PageWorkbench breadcrumb, PortalRoleSwitchBar | ✅ complete (2026-10-06) | Remaining pages pass, R1 |

Out of scope (not role portals): marketing pages (/, /features*, /pricing, /eu, /uk, /us, /blog, /contact, /demo, /security, /support, /terms*, /privacy, /page/[slug]), sign-up and subscription checkout, auth screens. Only /auth/select-role is checked, because multi-role staff land on it.

### Page standard (every portal)

1. Portal page shell: sidebar, hero header with a plain title, one-line purpose and actions on the right, breadcrumb using the sidebar's page names.
2. The current task and key numbers first: stat tiles with an icon and a one-line hint (1 per row on phones, 2 on tablet, up to 4 on desktop).
3. Optional, advanced or long sections fold away (`Card collapsible` or the kitchen filter-bar pattern), closed by default, showing a count or summary while closed.
4. Filters grouped in one bar; long filter sets fold away with an "N filters active" summary.
5. Plain language: no database names, internal codes, "Wave" notes or developer wording.
6. No sideways scroll at 1440 / 768 / 390; floating widgets never cover controls.
7. UI only: no backend, API, schema, RLS, auth or business-rule changes; every save, status and permission behaves exactly as before.

# Remaining pages pass (2026-10-06)

**Status: Complete (2026-10-06), not yet committed.** Earlier passes marked waiter, job-progress and client as done without a checklist, and never reviewed platform, account or customer-facing pages, or the sidebar/header chrome as its own thing. This pass covers all of them with the same page standard, the same UI-only boundary and the same evidence as the cleaning and shopping passes.

## Order of work

R1 chrome first (it shows on every page), then R2 waiter, R3 shared pages, R4 client, R5 platform, R6 customer-facing links. Each group: baseline check -> screenshot review -> polish -> after check -> record results here.

## How each page is checked

- **Auto**: `node tmp/ui-normalization/check-portal-ui.mjs --only <group> --tag <before|after>` at 1440 / 768 / 390. Pass = loads with sidebar + header, not denied, 0 page errors, 0 failed requests, 0 sideways overflow.
- **Review**: desktop + phone screenshots read against the page standard; polish applied and re-checked.
- **Sidebar**: active item highlighted, sidebar name = page title = breadcrumb name, mobile drawer opens and every link lands on a real page, collapse works, role switch shows the right portals.
- **Read-only, always**: checks never click save/send/accept/pay. R6 public pages stamp records on load (`/q/[token]` sets `viewed_at`; accept, pay and unsubscribe POST), so their check blocks every non-GET request and only uses tokens read from the database, never created.

Write audit (2026-10-06): GET handlers behind these pages (`/api/public/quotes/[token]/get`, `/catalogue`, `/pdf`, `/api/public/invoices/[token]/get`, `/pdf`) only read. Writes on load are all POSTs (`/view` stamps `viewed_at`; `/api/client-tokens/validate|view|account` call `client_view_*` RPCs), so blocking non-GET keeps the check read-only. `/pay/invoice/[id]` server-side code only reads and redirects.

## R1 - Sidebar and header chrome (every portal)

| Item | Where | Check | Status |
|---|---|---|---|
| Shared sidebar | `src/components/navigation/PortalSidebar.tsx` | desktop expanded + collapsed, mobile drawer, footer, bell, theme switch, no overlap with page at lg/xl | ✅ compact role picker removed from the expanded desktop header (the labelled one sits right below it); title no longer truncates ("Waiter ..." -> "Waiter Portal") |
| Active item | `src/lib/navActiveMatcher.ts` (all sidebars) | one active item per page | ✅ fixed: links with a `#section` (waiter "Service today", "Clock") never matched, so the waiter sidebar had no active item. Hash now ignored for the path match; tie goes to the matching hash, else the first listed. New test `navActiveMatcher.test.ts` (5 cases) |
| Portal sidebars | WaiterNav, ClientNav, PlatformNav, AdminNav (+ kitchen/driver on shared pages) | names match the page H1; one active item | ✅ platform hero titles renamed to sidebar names (Companies, Users, Subscriptions, Trials, Company health, Activity log, Revenue, Pricing, Running to-do) |
| Hero header | `PortalHeader` | title, one-line purpose, actions on the right | ✅ added to Achievements, Subscription invoices, Job progress (was plain header) |
| Breadcrumb | `PageWorkbench` | uses sidebar names | ✅ Client (Bookings, Live tracking), Platform (all 17), Team (Job progress), Order (Order details) label maps; "Workspace / General" and "Order / Order" gone; admin area chip "Tenant" -> "Company" |
| Role switch | `PortalRoleSwitchBar` | one switcher per screen; not sticky | ✅ was three on one screen (header icon, sidebar pill, page card). Card now phones/tablets only (hidden at lg where the sidebar shows the labelled picker), slimmer, no longer sticky |
| Summary band | `PortalOverview` (client portal) | tiles readable at 1440 | ✅ heading now sits above the tiles; side-by-side gave each tile ~135px and truncated every label and hint. Description wraps to 2 lines instead of 1 |
| Sidebar offset | `Layout.tsx` PortalLayout + each *PageShell | content clears the sidebar | ✅ incl. /account/*, /client/subscription-invoices (now PortalLayout) |
| Floating widgets | assistant launcher | never covers a control | ✅ launcher icon-only on platform, client and account pages too (the pill covered a Users delete button and the Pricing EUR field) |
| Platform owner sidebar | `PlatformNav` + shared pieces | desktop expanded / collapsed, phone drawer, page inside a folded section | ✅ (2026-10-06, second round) "Quick search" now a full-width bar (wrapper was inline-flex; same fix in the admin sidebar); Ctrl K hint hidden in phone drawers (they have a search box); phone quick actions fit (Companies · Businesses, Users · Accounts, Health · At risk - "Subscrip..." / "Plans + billi..." were cut off); subtitle "CateringMS internal" -> "CateringMS" |
| Empty role row | `PortalSidebar` | no empty strips | ✅ the role-switch row rendered for single-role accounts too, leaving an empty bordered strip under the header in every single-role portal (platform, shopping, ...); now only for multi-role accounts |
| Current page visible | `PortalSidebar` + `useNavScrollRestore` | active item on screen on load | ✅ on pages in lower sections (e.g. Tax rules under Money) the active item sat below the fold, expanded or collapsed. Active link now has `aria-current="page"` and the rail (never the page) scrolls just enough to show it |

Accepted, not changed: mobile top bar still truncates long titles ("Waiter Por...") for multi-role staff; the compact role icon there is the only switcher on pages without the strip (the drawer has none).

## R2 - Waiter portal (`waiter.demo@spitbraaidelivery.co.za`)

| Page | Route | Auto | Review |
|---|---|---|---|
| Dashboard | /team-portal/waiter/dashboard | ✅ | ✅ "Service today" now highlighted; duplicate switch card gone on desktop |
| Notifications | /team-portal/waiter/notifications | ✅ | ✅ alerts older than 14 days fold away (closed, "Older than 14 days (20) · 20 unread"): 3210 -> 1074px desktop, 5292 -> 1437px phone. Unread = brand left edge (was all-pink cards); priority chip only for High/Urgent with stale downgrade |
| Index (redirect) | /team-portal/waiter | ✅ lands on Service today | n/a |

## R3 - Shared pages (opened from more than one portal)

| Page | Route | Opened as | Auto | Review |
|---|---|---|---|---|
| Job progress | /team-portal/general/job-progress | kitchen | ✅ | ✅ hero header, plain subtitle, "Team / Job progress", statuses capitalised |
| Account settings | /account/settings | admin, kitchen, driver, waiter, client | ✅ | ✅ right sidebar for every role; "Profile" / "My Profile" highlighted. Names differ slightly (admin sidebar "My Profile", page "Account settings") - left, admin sidebar was signed off |
| Achievements | /account/achievements | admin, kitchen, waiter | ✅ | ✅ rebuilt on the portal standard: hero, 3 stat tiles with hints, cards; 50-row point history folds (opens itself for `?highlight=points`); top 10 hides 0-point people (it ranked 10 people on 0) |
| Order document | /order/[id], /[company_slug]/order/[id] | admin, kitchen | ✅ | ✅ "Order / Order details". Page auto-scrolls to the viewer's section by design, which makes full-page screenshots look offset - real viewport checked, fine |

## R4 - Client portal (`universalsportmags23@gmail.com`)

| Page | Route | Auto | Review |
|---|---|---|---|
| Dashboard | /client-portal/dashboard | ✅ | ✅ hero icon always shown; duplicate logo + company name row removed (logo is in the sidebar) |
| Quotes | /client-portal/quotes | ✅ | ✅ "Quote history is organised by decision state" -> "Nothing waiting for your answer"; plain description |
| Bookings | /client-portal/my-orders | ✅ | ✅ breadcrumb "Bookings" (was "My Orders"); tiles no longer truncate |
| Live tracking | /client-portal/tracking | ✅ | ✅ breadcrumb "Live tracking" |
| Billing | /client-portal/billing | ✅ | ✅ tiles no longer truncate |
| Notifications | /client-portal/notifications | ✅ | ✅ |
| Profile | /client-portal/profile | ✅ | ✅ "Remove photo" button ran off the card on phones - row now wraps |
| Feedback (redirect) | /client-portal/feedback | ✅ | n/a |
| Index (redirect) | /client-portal | ✅ lands on Dashboard | n/a |
| Subscription invoices | /client/subscription-invoices | ✅ | ✅ was two stacked H1s on the old layout with the client sidebar; now PortalLayout (sidebar follows the viewer's role - the page is for company admins), hero header, readable status, wraps on phones. Not linked from any sidebar (left as is) |

## R5 - Platform admin (`bobby@skylight-digital.co.za`)

| Page | Route | Auto | Review |
|---|---|---|---|
| Dashboard | /admin/platform/dashboard | ✅ | ✅ months "2026-04" -> "Apr 2026"; "tenants" -> companies; "Recent activity"; 1 tile per row on phones |
| Company health | /admin/platform/tenant-health | ✅ | ✅ title; hints no longer quote `onboarding_completed_at` / `payment_gateways row`; "No online payments" |
| Payment issues | /admin/platform/payment-issues | ✅ | ✅ |
| Activity log | /admin/platform/audit-logs | ✅ | ✅ action codes shown as words (`quote_accepted` -> "Quote accepted", `cron.x-y` -> "Scheduled job: x y", `pii_access_view` -> "Viewed personal details"); raw code kept as tooltip; plain subtitle |
| Companies | /admin/platform/company-database | ✅ | ✅ title; ", South Africa" with blank city fixed |
| Users | /admin/platform/user-management | ✅ | ✅ title, plain subtitle, "In a company" |
| Subscriptions | /admin/platform/subscription-management | ✅ | ✅ title; "suspended" -> "Suspended"; "Monthly MRR" -> "Monthly revenue" |
| Trials | /admin/platform/trial-management | ✅ | ✅ title |
| Revenue | /admin/platform/financial-dashboard | ✅ | ✅ title, statuses capitalised, 1 tile per row on phones |
| Pricing | /admin/platform/pricing-management | ✅ | ✅ title; assistant no longer covers the EUR field |
| Tech costs | /admin/platform/tech-costs | ✅ | ✅ chips/hints say company; footer no longer quotes a source file path. Tooltips left technical (engineering calculator) |
| Currency | /admin/platform/currency-monitoring | ✅ | ✅ |
| Tax rules | /admin/platform/tax-rules | ✅ | ✅ `non_deductible` / `not_claimable` / `non_allowed` shown as words; category code moved to a tooltip; "Deductible" green (was brand red); title + plain subtitle |
| Pages | /admin/platform/cms-pages | ✅ | ✅ (one mid-run crash was hot reload from editing during the check; clean load verified) |
| Blog | /admin/platform/cms-blog | ✅ | ✅ |
| Platform emails | /admin/platform/messaging-templates | ✅ | ✅ |
| Platform settings | /admin/platform/settings | ✅ | ✅ "config keys loaded / documented tunables" -> "N settings"; raw `app_config.*` line removed |
| Running to-do | /admin/platform/running-todo | ✅ | ✅ groups fold (closed, with "N cards · done/total · %"): 8999 -> 2647px. Fixed: Expand all did nothing (cards ignored the bulk state) |
| Index (redirect) | /admin/platform | ✅ lands on Dashboard | n/a |
| Super admin entry | /super-admin | ✅ lands on platform Dashboard | n/a |
| Super admin dashboard (old) | /super-admin/admin/dashboard | ⚠️ 404 | middleware sends every /super-admin path to /admin/platform, so this page file is unreachable; the assistant catalogue still lists it (see open items) |

## R6 - Customer-facing links (no sidebar)

Checked with `node tmp/ui-normalization/check-public-ui.mjs`: every non-GET request aborted and counted (`blockedWrites`), tokens read with SELECTs only.

| Page | Route | Auto | Review |
|---|---|---|---|
| Quote | /q/[token] | ✅ | ✅ phone header fixed: title broke mid-word ("RJ WEDD INGS") and the company name slid under the status pill - header column now full width on phones, pill wraps below; reference kept on one line |
| Proposal accept | /p/accept/[token] | - | not checked: no outsource assignment with an accept token exists, and creating one would be a write |
| Client login short link | /p/[slug] -> /[company_slug]/client/login | ✅ | n/a |
| Client login | /[company_slug]/client/login | ✅ | ✅ |
| Pay invoice | /pay/i/[token] | ✅ | ✅ "Balance still to pay (100%)" next to "Partially paid" fixed (kept within 1-99% while part-paid); payment method in words, "via other" dropped |
| Pay invoice (legacy redirect) | /pay/invoice/[id] -> /pay/i/[token] | ✅ | n/a |
| Customer account | /c/account | ✅ | ✅ no-access state only (data is POST-only) - clear and calm |
| Customer order | /c/order/[id] | ✅ | ✅ no-access state only (same reason) |
| Unsubscribe | /u/[token] | ✅ | ✅ |
| Role picker | /auth/select-role | ✅ | ✅ |

## Completion checklist

- [x] R1 chrome checked in every portal; fixes recorded.
- [x] R2-R6 every page Auto ✅ and Review ✅ (or a recorded reason).
- [x] `tsc` 0 errors; ESLint 0 errors and no new warnings (changed files 121 -> 120); Jest 88/88 suites, 701 tests; production build 199/199 pages (`NEXT_DIST_DIR=.next-verify`).
- [x] Before/after screenshots: `tmp/ui-normalization/portals-remaining-before/`, `portals-remaining-mid/`, `portals-remaining-after/`, `public-before/`, `public-after/`.
- [x] Open (non-UI) items listed below, nothing changed for them.

Check tooling changes: `check-portal-ui.mjs` now waits until loading text is gone (up to 45s more) and flags `STILL-LOADING` - the first baseline "passed" platform pages that were still on a spinner; R3 account entries added. New: `check-public-ui.mjs` (R6, writes blocked), `probe-page.mjs` (one page, writes blocked, prints errors + final URL).

## Open items (not UI)

- `/client/subscription-invoices` guard lists super admin / company admin / admin only, but the client demo account opened it without an access-denied screen. Needs an auth check (not changed - auth is out of scope).
- Demo account waiter.demo shows "Kitchen Staff" as its role badge while working as Waiter (same role-data mismatch as cleaning.manager.demo).
- Job progress lists two identical "Automated Email Flow Test" orders (test data).
- Pricing "Where these prices go live" lists /pricing, /us/pricing, /uk/pricing but not /eu/pricing although EUR prices are set - content/config question.
- Dev server hit Next's memory threshold mid-check and did not restart; restarted with `NODE_OPTIONS=--max-old-space-size=8192`.
- `/super-admin/admin/dashboard` is unreachable (middleware rewrites `/super-admin*` to `/admin/platform*`, giving a 404), but the assistant's page catalogue still offers it as "Super admin dashboard". Fix is either removing the page file or a routing change - both outside this UI-only pass. The catalogue entry can't just be repointed: the coverage test requires an entry per page file.

# Shopping + Cleaning deep UX pass (2026-10-06)

**Status: In progress.** The 2026-10-05 passes brought both portals up to the page standard. This pass goes further for the people who use them all day: every page should be easy to read at a glance, quick to act on (especially on a phone) and consistent and attractive, using the kitchen portal as the reference. Same UI-only boundary as everywhere: no API, schema, RLS, auth or business-rule changes; every save, status and permission behaves exactly as before; checks never change live records.

## Users

- **Shopping staff** - `shopping@spitbraaidelivery.co.za` (Shopping Sarah): works the buy list, shops, files receipts, restocks.
- **Cleaning staff** - `cleaning@spitbraaidelivery.co.za` (Cleaning Lisa): today's jobs, equipment, damage, supplies.
- **Cleaning manager** - `cleaning.manager.demo@spitbraaidelivery.co.za`: everything above plus team, schedules, workflows, settings.

## Deep UX standard (on top of the page standard)

1. **First screen answers "what do I do now?"** - one clear primary action, the current state, today's numbers. Nothing important below the fold on a phone.
2. **One visual language** - kitchen-reference hero, tiles with icon + one-line hint, the same status colours everywhere (green = fine, amber = needs attention, red = urgent, slate = info), consistent chips and buttons.
3. **Scannable lists** - what it is on the left, status chip, the action on the right; readable dates ("Mon 6 Oct"), money as "R 1 234.50"; no raw codes, no "par", no lowercase status values.
4. **Phone-first for staff** - tap targets at least 40px, primary action reachable without hunting, cards instead of wide tables at 390, nothing hidden behind the assistant button.
5. **Fewer words, no repeats** - no heading that repeats the hero, no explanation that repeats an empty state; advanced or long parts fold away with a count.
6. **Helpful empty and done states** - say what is fine and offer the next useful action.

## How it is checked

- Baseline + after: `node tmp/ui-normalization/check-portal-ui.mjs --only shopping,cleaning,cleaning-manager --tag deep-before|deep-after` (1440 / 768 / 390; errors, failed requests, overflow, still-loading).
- Each page reviewed at desktop and phone against D1-D6; findings and fixes recorded below.
- `tsc`, ESLint (no new warnings), Jest, production build.

## Shopping pages

| Page | Route | Before | After | Findings / changes |
|---|---|---|---|---|
| Today | /team-portal/shopping/dashboard | ⏳ | ⏳ | |
| Buy list | /team-portal/shopping/buy-list | ⏳ | ⏳ | |
| Active shop | /team-portal/shopping/orders | ⏳ | ⏳ | |
| Kitchen demand | /team-portal/shopping/kitchen-demand | ⏳ | ⏳ | |
| Restock | /team-portal/shopping/restock | ⏳ | ⏳ | |
| Inventory | /team-portal/shopping/inventory | ⏳ | ⏳ | |
| Suppliers | /team-portal/shopping/suppliers | ⏳ | ⏳ | |
| Spend | /team-portal/shopping/invoices | ⏳ | ⏳ | |
| Receipts | /team-portal/shopping/receipts | ⏳ | ⏳ | |
| Notifications | /team-portal/shopping/notifications | ⏳ | ⏳ | |
| Settings | /team-portal/shopping/settings | ⏳ | ⏳ | |
| Sidebar + phone drawer | ShoppingNav | ⏳ | ⏳ | |

## Cleaning pages

| Page | Route | Users | Before | After | Findings / changes |
|---|---|---|---|---|---|
| Dashboard | /team-portal/cleaning/dashboard | staff, manager | ⏳ | ⏳ | |
| Tasks | /team-portal/cleaning/tasks | staff, manager | ⏳ | ⏳ | |
| Schedules | /team-portal/cleaning/schedules | staff, manager | ⏳ | ⏳ | |
| Supplies | /team-portal/cleaning/supplies | staff, manager | ⏳ | ⏳ | |
| Equipment | /team-portal/cleaning/equipment | staff, manager | ⏳ | ⏳ | |
| Damage | /team-portal/cleaning/damage | staff, manager | ⏳ | ⏳ | |
| Workflows | /team-portal/cleaning/workflows | staff, manager | ⏳ | ⏳ | |
| Notifications | /team-portal/cleaning/notifications | staff, manager | ⏳ | ⏳ | |
| Settings | /team-portal/cleaning/settings | staff, manager | ⏳ | ⏳ | |
| Team management | /team-portal/cleaning/management | manager | ⏳ | ⏳ | |
| Sidebar + phone drawer | CleaningNav | staff, manager | ⏳ | ⏳ | |

## Completion checklist

- [ ] Baseline screenshots for every page above (desktop + phone).
- [ ] Every page reviewed against D1-D6 and polished; findings recorded.
- [ ] After check: every page loads, 0 errors, 0 failed requests, 0 overflow at 1440 / 768 / 390.
- [ ] `tsc` 0 errors, ESLint no new warnings, Jest all pass, production build passes.

## Progress (2026-10-06, paused at usage limit)

Baseline (`portals-deep-before/`): all 23 pages load, 0 errors, 0 failed requests, 0 overflow. Done so far (tsc clean, no new lint warnings, Jest 701/701):
- Sidebar mode badge (shopping, cleaning, and kitchen - same bug) was red text on the red rail; now amber / sky / solid tones that read on any rail.
- Shopping Today: "Next up" card with the actions moved above the numbers, amber when stock is low; title "Today".
- Buy list: chip "At minimum" (matches tile + filter), names wrap, plain hints, "All to buy", 2-up tiles on phones.
- Inventory phone view: folded categories like desktop instead of a flat ~9600px list; 40px Adjust / History buttons.
- Active shop: "Nothing being shopped right now" card with Open Buy list; auto-list note in plain words; completed = green.
- Restock "have 1 · min 1"; tile rows 2-up on phones across shopping pages; "par" wording removed (nav, quick actions, supplies).
- Cleaning: titles match sidebar (Today, Damages, Supplies, Schedule plan, Workflows, Manage team, Equipment); handover columns coloured by status, no tall empty columns; event times "00:28"; notifications folded by alert type; Equipment "Good" green, tile icons, quieter "How to clean"; Supplies names wrap; completed = green on Tasks / Schedules / Spend.
- Team controls card (cleaning + kitchen manager, admin Teams): neutral card, tiles with icons and hints.

After-check (`deep-after.log`, `portals-deep-after/`): all 23 pages load, 0 errors, 0 failed requests, 0 overflow at 1440/768/390. Inventory phone 9638 -> 1590px, cleaning notifications phone 3599 -> 1126px, shopping Today phone 1631 -> 1387px.

Left: review Tasks, Schedules, Damages, Workflows, Settings, Suppliers, Spend, Receipts, Kitchen demand, shopping Notifications/Settings and both phone drawers against D1-D6, then production build and fill the tables above.

## Open items (not UI)

- cleaning.manager.demo shows role "waiter" on the roster (role data).

# Cleaning portal

**Status: Complete (2026-10-05), committed in `6686e468`.**

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
