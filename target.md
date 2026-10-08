# Working rules (apply to every item below - strictly)

Full rules: `CLAUDE.md` (loaded automatically every session).

1. **One item at a time.** Work only on the item asked for; don't change anything else. Note other problems and report them; don't fix them unasked.
2. **Never break existing features.** Everything that works today must still work after the change. Check every place shared code is used; run the type check and tests before reporting done.
3. **Frontend vs backend.** Frontend work changes the backend only when the item can't work without it (and says why); backend work changes the frontend only when needed (and says why).
4. **Live data and releases.** Checks against the live database are read-only unless the user agrees. Code that needs a migration ships after the migration is applied. Commit only your own files.
5. **Clear button names.** Every button and link says exactly what it does, in plain words ("Email client", "Record payment"); disabled buttons say why; two buttons side by side never sound alike.

# Target: polished UI for every role portal

**Status (2026-10-07): deep UX pass committed (`fb1c4fe2`); clarity + look round for platform owner, cleaning and shopping complete, not yet committed.** One standard for every role: the company admin pages plus the kitchen and driver portals are the reference. Each portal below follows the same page standard and the same UI-only boundary.

## All role portals (categorised)

| Role / portal | Pages | Status | Section |
|---|---|---|---|
| Company admin | `/admin/*` (sidebar sections Today, Sales, Operations, Finance, Catalogue, Team, Settings + sub-pages) | ✅ complete, committed | Completed targets |
| Kitchen (reference) | dashboard, duty, prep-list, production, stock, menu, calendar, notifications, settings, management; redirects: index, today, handovers, orders/[id]/ticket | ✅ reference (`49896478`) | - |
| Driver (reference) | dashboard, routes, deliveries, calendar, earnings, notifications; redirects: index, schedule, tracking | ✅ reference (`5cb27b36`) | - |
| Shopping | dashboard, buy-list, orders, kitchen-demand, restock, inventory, suppliers, invoices, receipts, notifications, settings; redirects: index, alerts | ✅ standard pass committed (`01cc70ab`); ✅ deep UX pass (2026-10-07) | Deep UX pass: platform owner, cleaning, shopping |
| Cleaning | dashboard, management, tasks, equipment, damage, supplies, schedules, workflows, notifications, settings, handovers/[id]; redirect: index | ✅ standard pass committed (`6686e468`); ✅ deep UX pass (2026-10-07) | Deep UX pass: platform owner, cleaning, shopping |
| Waiter / server | dashboard, notifications; redirect: index | ✅ complete (2026-10-06) | Remaining pages pass, R2 |
| Shared team page | /team-portal/general/job-progress | ✅ complete (2026-10-06) | Remaining pages pass, R3 |
| Shared account pages | /account/settings (the "Profile" link in every sidebar), /account/achievements | ✅ complete (2026-10-06) | Remaining pages pass, R3 |
| Client | /client-portal: dashboard, my-orders, quotes, billing, tracking, notifications, profile; redirects: index, feedback; plus /client/subscription-invoices | ✅ complete (2026-10-06) | Remaining pages pass, R4 |
| Platform (super admin) | /admin/platform/* (17 pages + index redirect), /super-admin | ✅ standard pass (2026-10-06); ✅ deep UX pass (2026-10-07); /super-admin/admin/dashboard unreachable (open item) | Remaining pages pass, R5; Deep UX pass: platform owner, cleaning, shopping |
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

# Clarity + look round: platform owner, cleaning, shopping (2026-10-07, round 2)

**Status: Complete (2026-10-07), not yet committed.** Asked for: every page more polished, easier to understand and more attractive. This round goes back over the pages the first deep pass marked "no change" and adds a visual layer shared by all three portals. Same UI-only boundary: no API, schema, RLS, auth or business-rule changes; every save and permission works as before.

## Look (all three portals)

- **Coloured stat tiles.** `StatTile` takes an optional `tone` (good / warn / bad / info / brand): tinted icon bubble + thin top accent. Neutral when unset, so other portals are unchanged. Applied to 60+ tiles by meaning: green = healthy (Active, Paying, Available, Resolved, Shipped), sky = info (Trial, Pending, In progress), amber = needs attention (Low, At minimum, Short, Open reports), red = urgent (Out of stock, Expired, Blocked, Cancelled).
- **Every tile has an icon and a one-line hint** (Running to-do, Damages, Supplies, Task board were bare).
- **Tiles two per row on phones** everywhere (Users, Dashboard, Revenue, Company health, Payment issues, Pages, Currency, Running to-do, Restock stacked one per row).

## Platform owner

| Page | Change |
|---|---|
| Activity log | rebuilt as a feed grouped by day ("Today", "Yesterday", "Sat 4 Oct 2026" + count); each event is one sentence (time · who · what · on what) with the company under it; raw details, record id and IP behind "Show details"; the 8-character record ids are gone from the row. Desktop 3025 -> ~2500px |
| Pricing | the same caption ("Monthly subscription pricing across all markets") and the long helper ("Auto: ZAR 999 x 3 / 18.5 = USD 162 (approximate; ZAR is authoritative)") under every field -> "Suggested from ZAR: USD 162"; "Auto-Calculate" -> "Recalculate from ZAR"; "See your COGS at this price" -> "See costs and margin"; plain subtitle |
| Platform emails | "writes a row at `email_templates.company_id IS NULL`", "tenant", "registry", "Not yet wired" replaced with plain words ("Shared by every company", "Not sent yet"); email descriptions say "company" not "tenant" |
| Platform settings | "Import row cap" -> "Most rows per import"; "Public origin URL" -> "Website address", both with plain explanations |
| Users | on phones, role, status and company show under each name (their columns were off-screen, so the phone list showed names only) |
| Pages | tile hints in plain words ("Every website page", "Show a picture when shared") |
| Running to-do | tiles with icons + hints; "Todo" -> "To do" |

## Cleaning

| Page | Change |
|---|---|
| Today | tiles toned (Available green, In use / Cleaning sky, Damaged amber) |
| Equipment | list grouped under category headings with item counts ("1 item" / "N items") (Bain-Marie, Crockery, ...) instead of repeating the category on every row; flat list while searching |
| Supplies, Damages, Task board | tile icons + tones |

## Shopping

| Page | Change |
|---|---|
| Today | low-stock alerts amber (red only for out of stock) - matched the Buy list; was all red |
| Buy list, Restock, Inventory, Kitchen demand, Spend, Suppliers | tiles toned |

## Checks

- Full read-only check (`deep3-after.log`, `portals-deep3-after/`): shopping 12/12, cleaning 9/9 + manager 1/1, platform 19/19 load with 0 page errors and 0 sideways overflow at 1440 / 768 / 390. Platform API pages first showed 401s; re-run with a fresh session they were clean (`deep3-platform.log`, `r3/fresh-*`) - a stale cached sign-in in the check tooling, not the app. The dev server stalled near the end of that re-run; the last pages were re-checked separately, clean.
- `tsc` 0 errors; ESLint 0 errors and no new warnings (per-file counts equal to `HEAD` for every changed file; caught and fixed a JSX comment that would have rendered as text in Equipment); Jest 793/793 tests (only the unrelated scratch suite `tmp/pdfs/render-payment-pdfs.test.ts` fails to parse); production build 199/199 pages (`NEXT_DIST_DIR=.next-verify`).
- New helper: `tmp/ui-normalization/shot-pages.mjs <email> <out-prefix> <path...>` - fresh session, desktop + phone screenshots, non-GET requests blocked (so pages that read through RPCs show zeros in its shots; the full check doesn't block them).


# Deep UX pass: platform owner, cleaning, shopping (2026-10-07)

**Status: Complete and committed (2026-10-07).** Goal: the platform owner, cleaner and shopper portals feel as finished as the company admin, kitchen and driver portals. Every page should be easy to understand at a glance, clean and consistent, and quick to act on. This pass picks up the unfinished Shopping + Cleaning deep UX pass below and adds the platform owner portal to it.

## Rules (same boundary as every pass)

- UI only: no API, schema, migration, RLS, auth or business-rule changes. Every save, status, permission and data result behaves exactly as before.
- Checks never change live records (the local app uses the live database): read-only page loads, no save/send/delete clicks.
- Reference look: admin pages (`/admin/*`), kitchen (`49896478`) and driver (`5cb27b36`) portals.

## Deep UX standard (D1-D6, applies to all three portals)

1. **First screen answers "what do I do now?"**: the current state, today's numbers and one clear primary action. Nothing important below the fold on a phone.
2. **One visual language**: hero header, stat tiles with icon + one-line hint, the same status colours everywhere (green = fine, amber = needs attention, red = urgent, slate = info), consistent chips and buttons.
3. **Scannable lists**: what it is on the left, status chip, action on the right; readable dates ("Mon 6 Oct"), money as "R 1 234.50"; no raw codes, snake_case or lowercase status values.
4. **Phone-first for staff** (cleaning, shopping): tap targets at least 40px, cards instead of wide tables at 390, nothing hidden behind the assistant button. Platform owner: desktop-first but fully usable at 390.
5. **Fewer words, no repeats**: no heading that repeats the hero, no explanation that repeats an empty state; long or advanced parts fold away with a count.
6. **Helpful empty and done states**: say what is fine and offer the next useful action.

## Users

- **Platform owner**: `bobby@skylight-digital.co.za` - runs CateringMS: companies, users, subscriptions, revenue, pricing, content, platform health.
- **Shopping staff**: `shopping@spitbraaidelivery.co.za`.
- **Cleaning staff**: `cleaning@spitbraaidelivery.co.za`; **cleaning manager**: `cleaning.manager.demo@spitbraaidelivery.co.za`.

## How it is checked

- Baseline + after: `node tmp/ui-normalization/check-portal-ui.mjs --only platform,shopping,cleaning,cleaning-manager --tag deep2-before|deep2-after` (1440 / 768 / 390; errors, failed requests, overflow, still-loading).
- Desktop + phone screenshots reviewed against D1-D6; findings and fixes recorded in the tables.
- `tsc` 0 errors, ESLint no new warnings, Jest all pass, production build passes.

## Platform owner pages

| Page | Route | Before | After | Findings / changes |
|---|---|---|---|---|
| Dashboard | /admin/platform/dashboard | ✅ | ✅ | title "Dashboard" (matches sidebar); new **Needs attention** card first (overdue payments, trials ending in 7 days, no card payments, stuck in setup), each a link with count, amber/rose only when > 0, green "All clear" otherwise - read-only queries using the same rules as those pages; 7 jargon tiles -> 4 plain tiles (Monthly revenue, Paying companies, Trial to paid, Cancelled (30 days)) + one quiet strip for the rest; period dropdown removed (it changed nothing); subscription mix is a compact bar + rows (green / sky / slate) instead of three big coloured cards; "customers" -> companies; revenue figures neutral, not brand orange |
| Companies | /admin/platform/company-database | ✅ | ✅ | status pills: "ACTIVE" in brand orange -> shared chip (Active green, Trial sky, Past due amber, Suspended rose, Cancelled slate); tile numbers plain; tiles 2-up on phones (mobile 1660 -> 1404px); "Total Companies" -> "Companies" |
| Users | /admin/platform/user-management | ✅ | ✅ | reviewed, already at standard (plain roles, status chips, filters in one bar) - no change |
| Subscriptions | /admin/platform/subscription-management | ✅ | ✅ | shared status chip; Overdue + Cancelled cards moved above the list, and when both are empty one green line ("Nothing to chase today") replaces two empty cards; tile numbers plain, 2-up on phones (1758 -> 1510px); "MRR" -> "a month"; "N/A" -> "-"; "All Status" / "Past Due" / "Customer Subscriptions" wording fixed |
| Trials | /admin/platform/trial-management | ✅ | ✅ | urgency + reminder badges -> shared chips with words ("5 days left", "3 days before", "Trial ended"); tile icons; numbers coloured only when > 0; helpful empty state; plain subtitle |
| Company health | /admin/platform/tenant-health | ✅ | ✅ | reviewed, already at standard - no change |
| Payment issues | /admin/platform/payment-issues | ✅ | ✅ | reviewed, already at standard - no change |
| Revenue | /admin/platform/financial-dashboard | ✅ | ✅ | shared status chip (Active was amber); tile labels plain (Monthly / Yearly revenue, Paying, Cancelled); numbers coloured only when meaningful; one-line subtitle |
| Pricing | /admin/platform/pricing-management | ✅ | ✅ | reviewed - no change (editing form, long by nature) |
| Tech costs | /admin/platform/tech-costs | ✅ | ✅ | not changed: page was being edited in the same working tree by other work (tech-cost model) during this pass; loads clean |
| Currency | /admin/platform/currency-monitoring | ✅ | ✅ | title "Currency"; 30-day history folds away with a count (desktop 2174 -> 1538px, phone 3304 -> 2512px); dates "Fri 3 Oct" not "03/10/2026"; all-clear tick green; policy note no longer quotes a page path; "Run check now" |
| Tax rules | /admin/platform/tax-rules | ✅ | ✅ | tile numbers plain with hints, 2-up on phones; long table kept (filterable reference list) |
| Activity log | /admin/platform/audit-logs | ✅ | ✅ | reviewed, already at standard - no change |
| Pages | /admin/platform/cms-pages | ✅ | ✅ | reviewed - no change |
| Blog | /admin/platform/cms-blog | ✅ | ✅ | reviewed - no change |
| Platform emails | /admin/platform/messaging-templates | ✅ | ✅ | reviewed - no change |
| Platform settings | /admin/platform/settings | ✅ | ✅ | reviewed - no change |
| Running to-do | /admin/platform/running-todo | ✅ | ✅ | tile numbers plain; "Blocked" red only when > 0 |

Shopping and cleaning pages: tracked in the tables of "Shopping + Cleaning deep UX pass" below (same pass, now continued here).

Shared pieces added or changed: `src/components/admin/platform/PlatformStatusChip.tsx` (one status pill for every platform page: green Active, sky Trial, amber Past due, rose Suspended, slate Cancelled; `CompanyStatusBadge` now uses it); `MobileDrawerExtras` quick-action labels wrap to two lines instead of truncating (every portal drawer).

## Completion checklist

- [x] Baseline check + screenshots for all three portals (`portals-deep2-before/`, `deep2-before.log`): 41 pages load, 0 failed requests, 0 overflow. Revenue showed 4 page errors from hot reload during an edit; a clean re-probe had none. Platform shots partly include early edits (the true before is `portals-remaining-after/`).
- [x] Every platform, shopping and cleaning page reviewed against D1-D6 and polished; findings recorded in the tables.
- [x] After check (`portals-deep2-after/`, `deep2-after.log`): 41/41 pages load, 0 page errors, 0 failed requests, 0 overflow at 1440 / 768 / 390. Drawers re-probed after the label fix (`sidebar/clean3-*`), no errors.
- [x] `tsc` 0 errors; ESLint 0 errors and no new warnings (per-file counts equal to `HEAD` for every changed file); Jest 785/785 tests pass (the only failing suite is `tmp/pdfs/render-payment-pdfs.test.ts`, a scratch file Jest can't parse - unrelated, unchanged); production build 199/199 pages (`NEXT_DIST_DIR=.next-verify`).
- [x] UI only: the one new read is the dashboard "Needs attention" counts (SELECTs on `companies` and `payment_gateways`, the same ones Company health / Payment issues / Trials already run); no writes, API, schema, RLS or auth changes.

## Open items (not UI)

- Same working tree had unrelated work in progress (AI routing, imports, tech costs: `src/lib/ai/*`, `src/lib/import*`, `src/pages/api/imports/*`, `src/lib/techCosts/*`, `tech-costs.tsx`, `pageCatalog.ts`, `brain.ts`). Not touched by this pass; commit separately.
- `/admin/platform/tech-costs` not polished in this pass for that reason.
- Supplier "Checkers" phone is a placeholder (`000 000 0000`) - data.

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

**Status: Complete (2026-10-07) - finished in "Deep UX pass: platform owner, cleaning, shopping" above.** The 2026-10-05 passes brought both portals up to the page standard. This pass goes further for the people who use them all day: every page should be easy to read at a glance, quick to act on (especially on a phone) and consistent and attractive, using the kitchen portal as the reference. Same UI-only boundary as everywhere: no API, schema, RLS, auth or business-rule changes; every save, status and permission behaves exactly as before; checks never change live records.

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
| Today | /team-portal/shopping/dashboard | ✅ | ✅ | done in the 2026-10-06 round ("Next up" card first); re-checked |
| Buy list | /team-portal/shopping/buy-list | ✅ | ✅ | done in the 2026-10-06 round; re-checked |
| Active shop | /team-portal/shopping/orders | ✅ | ✅ | done in the 2026-10-06 round; re-checked |
| Kitchen demand | /team-portal/shopping/kitchen-demand | ✅ | ✅ | order dates "Tue 13 Oct" instead of "2026-10-13"; "Covered" chip green (was brand red) |
| Restock | /team-portal/shopping/restock | ✅ | ✅ | done in the 2026-10-06 round; re-checked |
| Inventory | /team-portal/shopping/inventory | ✅ | ✅ | done in the 2026-10-06 round; re-checked |
| Suppliers | /team-portal/shopping/suppliers | ✅ | ✅ | phone and email are tap-to-call / tap-to-email links (32px rows) |
| Spend | /team-portal/shopping/invoices | ✅ | ✅ | "Auto-generated from aggregated kitchen demand on 7/5/2026, 3:26:07 AM" -> "Made automatically from what the kitchen needs" (same as Active shop); under-budget variance green, not brand red |
| Receipts | /team-portal/shopping/receipts | ✅ | ✅ | "Click to pick files" -> "Tap to take a photo or pick files"; "Sequential extraction, ~3 s per slip" -> "About 3 seconds per slip" |
| Notifications | /team-portal/shopping/notifications | ✅ | ✅ | group rows no longer wrap on phones: amber "N new" pill, "Mark read" button (32px) at the right |
| Settings | /team-portal/shopping/settings | ✅ | ✅ | reviewed - no change (view-only for staff, Live / Coming soon labelled) |
| Sidebar + phone drawer | ShoppingNav | ✅ | ✅ | quick-action labels were cut off ("Build bu...", "Kitchen ...") - now wrap to two lines (shared `MobileQuickActions`, so kitchen and admin drawers benefit too) |

## Cleaning pages

| Page | Route | Users | Before | After | Findings / changes |
|---|---|---|---|---|---|
| Dashboard | /team-portal/cleaning/dashboard | staff, manager | ✅ | ✅ | reviewed (work-first already) - no change |
| Tasks | /team-portal/cleaning/tasks | staff, manager | ✅ | ✅ | three-sentence intro -> one line; done state tick green (was brand red) |
| Schedules | /team-portal/cleaning/schedules | staff, manager | ✅ | ✅ | reviewed - no change |
| Supplies | /team-portal/cleaning/supplies | staff, manager | ✅ | ✅ | done in the 2026-10-06 round; re-checked |
| Equipment | /team-portal/cleaning/equipment | staff, manager | ✅ | ✅ | done in the 2026-10-06 round; re-checked |
| Damage | /team-portal/cleaning/damage | staff, manager | ✅ | ✅ | "No damage reports (open)" -> "No open damage" with a green tick; tiles 2-up + 1 wide on phones (3-up squeezed "Outstanding cost"); search box full width on phones (sat indented under the tabs) |
| Workflows | /team-portal/cleaning/workflows | staff, manager | ✅ | ✅ | reviewed - no change |
| Notifications | /team-portal/cleaning/notifications | staff, manager | ✅ | ✅ | unread shown as the same amber "N new" pill as shopping |
| Settings | /team-portal/cleaning/settings | staff, manager | ✅ | ✅ | reviewed - no change |
| Team management | /team-portal/cleaning/management | manager | ✅ | ✅ | done in the 2026-10-06 round; re-checked |
| Sidebar + phone drawer | CleaningNav | staff, manager | ✅ | ✅ | quick-action labels wrap ("Open da...", "Stock ch..." were cut off); search hint fits one line |

## Completion checklist

- [x] Baseline screenshots for every page above (desktop + phone).
- [x] Every page reviewed against D1-D6 and polished; findings recorded.
- [x] After check: every page loads, 0 errors, 0 failed requests, 0 overflow at 1440 / 768 / 390.
- [x] `tsc` 0 errors, ESLint no new warnings, Jest all pass, production build passes.

## Progress (2026-10-06 round)

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
