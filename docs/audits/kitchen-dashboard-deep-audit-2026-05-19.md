# `/team-portal/kitchen/dashboard` (Kitchen staff dashboard) - deep audit (2026-05-19)

**Scope:** Replaces the earlier shallow `kitchen-dashboard-audit-2026-05-19.md`
(9 cursory items). Deep pass per Bobby's "1000 hours per page" brief.

The kitchen dashboard is the chef-on-shift's daily-driver screen. Tablet
on a steel prep surface in a hot, loud kitchen; chef has wet, floured,
or oiled hands. Allergen safety, mark-ready-to-driver, hot-hold timers,
prep tasks, force-close paperwork.

Wave 70.7 re-aliased to `/team-portal/kitchen/today` - `today.tsx` is a
one-line re-export of this file.

**Test tenant:** Spit Braai Delivery.

**File:** `src/pages/team-portal/kitchen/dashboard.tsx` (1,105 lines).

**Siblings cross-checked:** duty, menu, notifications, orders/[id]/ticket,
prep-list, production, settings, stock, today.

**Cross-role chains audited:** kitchen→driver (KIT2-A / handover),
kitchen→admin (orders / financial / calendar), kitchen←cleaning
(CLN2-A / CLN2-C: PRs #123/#124), kitchen←shopping.

---

## A. What's on the page

1. DynamicNav (KITCHEN_STAFF) - line 400. **Every other kitchen page uses `<KitchenNav />`.**
2. Header strip - ChefHat avatar, "Kitchen Dashboard" + subtitle, "Cleaning schedule" CTA (KIT2-A, hidden `<sm`).
3. TeamWelcomeBanner.
4. MyShiftTodayCard scope=`["kitchen", "kitchen_and_cleaning"]`.
5. KitchenStaffTileBoard (department=kitchen).
6. Today's Production Priority card (top 3 of today's orders).
7. Stats grid - 4 MetricCards.
8. Low Stock Alerts (first 5 below-min items).
9. Next pickup plain-English hero ("Late / Starts soon / Plenty of time").
10. Needs closure admin-only force-close panel.
11. What's coming up (tomorrow + day-after preview).
12. Active orders kanban (Confirmed / In prep / Ready) with HandoverToDriverPanel per card.
13. Footer + KitchenServiceFAB + ChatBot.
14. Allergen warning AlertDialog.

Background: 60s clock ticker only. **No realtime sub, no `cateringms:order-updated` listener.**

---

## B. Findings

### B.1 Architecture / code health

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| KIT2-10 | Nav inconsistency: dashboard uses DynamicNav; every other kitchen page uses KitchenNav. Same DRV-1 / CLN2-8 bug. | **P1** | 22, 400 |
| KIT2-11 | No ProtectedRoute wrapper. Cleaning has one (CLN2-C). | **P1** | 393-1105 |
| KIT2-12 | 13 `as any` casts - the generated Database type is stale on `orders`. | **P1** | 67-499 |
| KIT2-13 | 1,105-line single component; 4 inline render targets. | P2 | 393-1105 |
| KIT2-14 | `forceClosingId` useState declared mid-file. | P3 | 298 |
| KIT2-16 | No `useCallback` on `loadDashboardData`. | P3 | 105 |
| KIT2-17 | `progressByOrder` grows monotonically until next mount. | P3 | 72, 149 |
| KIT2-18 | **Allergen substring matching is fragile** - "nut" matches "minute", "egg" matches "leggings". `kitchenPrepService.checkOrderAllergens` should use whole-word boundary. | **P1** | service:1044 |

### B.2 Data integrity / one source of truth

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| KIT2-19 | Orders query has no `.is("deleted_at", null)`. preview query does. | **P1** | 115-123 |
| KIT2-20 | Inventory low-stock query has no `deleted_at` / `is_active` filter. | **P1** | 132-138 |
| KIT2-21 | **Two orders queries overlap.** dashboard pulls [today..+2]; preview pulls [tomorrow..+2]. Same row renders twice. | **P1** | 115-123, service:1342 |
| KIT2-22 | `today` is UTC, not local. At 02:00 SAST = yesterday. `toLocalISO()` exists but isn't used here. | **P1** | 119, 365 |
| KIT2-23 | Hot-hold threshold loaded once, never refetched on settings change. | P2 | 91, 163-172 |
| KIT2-24 | Orders with null `event_date` silently skipped from Next pickup + Needs closure. | P3 | 281 |
| KIT2-25 | **Next pickup hero ignores `pickup_time`.** Production Priority card uses pickup_time (483); hero uses event_time (251). Two contradictory truths on the same page. | **P1** | 251-253, 483-486 |
| KIT2-26 | Stats counts + kanban column counts can disagree for one frame mid-fetch. | P3 | 559, 783-785 |
| KIT2-27 | `getStatusColor` defines `prep` but kanban only renders confirmed/preparing/ready. Dead alias or missing column. | P2 | 372, 783-785 |
| KIT2-28 | **`getUrgencyLevel` SAST drift** - `setHours()` after UTC-midnight construct shifts by 2h. | **P1** | 379-391 |

### B.3 Chain reactions

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| KIT2-29 | **`markOrderReady` does NOT emit `cateringms:order-updated`.** Admin tabs, calendar, dispatch, client portal, financial all stale until window focus. Driver dashboard's realtime sub on `orders.status='ready'` catches it; every other surface delayed. | **P0** | 199, 214 |
| KIT2-30 | `handleForceClose` doesn't emit either. Force-close from /admin/orders DOES emit; same op here doesn't. | **P1** | 304-322 |
| KIT2-31 | Task tick auto-promotes to ready inside `kitchenPrepService.completeTask` but no emit. | **P1** | service:642-720 |
| KIT2-32 | No realtime sub. Cleaning polls; driver subscribes; admin subscribes. Kitchen has neither. | **P1** | (whole) |
| KIT2-33 | No `onOrderUpdated` listener. Cleaning's CLN2-A inventory bump can't reach kitchen. | **P1** | (whole) |
| KIT2-34 | **Shopping→kitchen prep ingredient availability NOT wired.** Shopper tick is broken at SHP2-22 leg AND broken at kitchen-listener leg. End-to-end vibes only. | **P1** | (whole) |
| KIT2-35 | **Cleaning→kitchen "ready for prep" chip NOT wired.** No equipment-readiness surface here. | **P1** | (whole) |
| KIT2-36 | KIT2-A cleaning CTA has no count badge. Static link only. | **P1** | 418-425 |
| KIT2-37 | HandoverToDriverPanel doesn't emit. Driver tab stale until refocus. | **P1** | 1019, panel:117 |
| KIT2-38 | `recordAllergenCheck` failure is swallowed - chef flips order ready, audit row missing. Safety surface, one-way failure. | **P1** | 211-214, service:1063 |
| KIT2-39 | Force-close uses fetch with credentials but no tenant_slug header. Brittle. | P2 | 304-309 |
| KIT2-40 | Native `window.confirm()` on force-close - loses focus on iPad service mode. AlertDialog already in tree. | **P1** | 301 |

### B.4 Role / visibility mapping

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| KIT2-41 | `canSeeAdminOrderDetail` includes sales_admin - per DI-10 sales_admin should be read-only. | **P1** | 68 |
| KIT2-42 | region_admin granted force-close access on any region's kitchen. | P2 | 68, 659 |
| KIT2-43 | KitchenStaffTileBoard lets any logged-in user clock kitchen staff in/out. Same CLN2-36 issue. | **P1** | 444, board:217 |
| KIT2-44 | MyShiftTodayCard scope correct. ✓ | none | 436 |
| KIT2-45 | No PII access logging on Needs closure. | P2 | 659-710 |
| KIT2-46 | No "view as kitchen" banner for admins. | P3 | 67-68 |
| KIT2-47 | Cleaning role correctly excluded from canSeeAdminOrderDetail. ✓ | none | 68 |

### B.5 Cross-dashboard placement

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| KIT2-48 | KitchenStaffTileBoard duplicates `/team-portal/kitchen/duty`. | **P1** | 444 |
| KIT2-49 | Low Stock Alerts duplicates `/team-portal/kitchen/stock` with no "+N more" CTA. | P2 | 572-601 |
| KIT2-50 | "What's coming up" duplicates `/team-portal/kitchen/prep-list`. | P2 | 715-760 |
| KIT2-51 | **Today's Production Priority duplicates the kanban's `confirmed` column** - same rows rendered twice. | **P1** | 458-533, 798-1030 |
| KIT2-52 | No link to /team-portal/kitchen/notifications. | P2 | (missing) |
| KIT2-53 | **No "Print today's prep run-sheet".** Bobby's brief P1 ask. Same DRV-32 / CLN2-53 gap. | **P1** | (missing) |
| KIT2-54 | No "kitchen done, cleaning can start" handover stamp. | P2 | (missing) |

### B.6 UX / UI (hot, loud, wet/floured hands, tablet on stainless)

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| KIT2-55 | **`size="sm"` (~28-32px) on Mark ready, Kitchen ticket, force-close.** 44px / 48dp minimum. Chef with food-prep gloves will miss. | **P1** | 511, 519, 692, 953 |
| KIT2-56 | **Prep checklist still buried in `<details>`.** KIT2-6 (shallow audit, P2) unfixed. | **P1** | 998-1010 |
| KIT2-57 | **No hold-to-confirm on Mark ready.** Wet-finger bump = order ready. Same CLN2-49. | **P1** | 952-959 |
| KIT2-58 | Native confirm() on force-close - iPad PWA modal hazard. | **P1** | 301 |
| KIT2-59 | **No haptic feedback on Mark ready / allergen-override.** Noisy kitchen + no audio + no vibration = silent action. | **P1** | 199, 1088 |
| KIT2-60 | **No voice-activation.** Bobby's explicit P1 ask. Chef hands deep in chicken cavities. Web Speech API. | **P1** | (missing) |
| KIT2-61 | **No prep-timer countdowns.** Bobby's explicit P1 ask. TaskCompletionButtons stamps started_at + completed_at - data exists, UI doesn't. | **P1** | (missing) |
| KIT2-62 | **No allergen colour-coding on cards.** Bobby's explicit P1 ask. Red ribbon at first render would prevent "I forgot". | **P1** | 842-1027 |
| KIT2-63 | Hot-hold warning text-only / unreadable from 2m. Should be full-column banner. | P2 | 979-985 |
| KIT2-64 | Plain-English copy ("in N min") is excellent. ✓ | none | 343-362 |
| KIT2-65 | "All caught up" empty state has no CTAs. | P2 | 773-779 |
| KIT2-66 | **Cleaning schedule CTA hidden on mobile** (`hidden sm:inline-flex`). Bobby's primary cross-role link invisible on chef's phone. | **P1** | 418-425 |
| KIT2-67 | No dark / service-mode contrast tuning. | P2 | 402 |
| KIT2-68 | Status pills marginal contrast from tablet distance. | P3 | 369-376 |
| KIT2-69 | No "service mode" toggle chip on dashboard. | P3 | 1048 |
| KIT2-70 | Kitchen ticket button correctly opens per-order ticket page. ✓ | none | 510-517 |

### B.7 Performance

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| KIT2-71 | **Orders query has no LIMIT** + `select("*")`. ~600 rows on a busy tenant, wide read. Same DRV-46 P1. | **P1** | 115-123 |
| KIT2-72 | `select("*")` reads 30+ columns when ~15 are used. | P2 | 117 |
| KIT2-73 | `getProgressByOrder` is bulk-queried ✓. | none | service:608 |
| KIT2-74 | `getUpcomingPreview` selects 7 cols but renders 5. | P3 | service:1350 |
| KIT2-75 | 60s tick re-renders the full 1,100-line component. | P2 | 94-97 |
| KIT2-76 | No AbortController on loadDashboardData. | P2 | 99-103 |
| KIT2-77 | Three sequential awaits where Promise.all would parallelise. | P2 | 105-181 |
| KIT2-78 | No data caching across mount/unmount cycles. | P2 | (whole) |
| KIT2-79 | `new Date()` constructed ~60x/min on render. | P3 | 327, 343, 829 |

### B.8 Missing features

| # | Finding | Severity |
|---|---|---|
| KIT2-80 | Voice-activation (KIT2-60). | **P1** |
| KIT2-81 | Prep-timer countdowns (KIT2-61). | **P1** |
| KIT2-82 | Allergen colour-coding (KIT2-62). | **P1** |
| KIT2-83 | Print today's run-sheet (KIT2-53). | **P1** |
| KIT2-84 | Equipment-ready-for-prep chip (KIT2-35). | **P1** |
| KIT2-85 | Shopping-ticked-since-last-load ingredient delta. Needs SHP2-22 fix first. | **P1** |
| KIT2-86 | "Send a runner" one-tap broadcast. | P2 |
| KIT2-87 | Per-station view filter (cold larder / pastry / grill). | P2 |
| KIT2-88 | Temperature log entry. | P2 |
| KIT2-89 | Recipe peek modal. | P3 |
| KIT2-90 | Allergen badge on the order card preview (overlap KIT2-62). | **P1** |
| KIT2-91 | Weight + portion calculator widget. | P3 |
| KIT2-92 | Wastage / pull-from-stock log. | P2 |

---

## C. Priority fix list

**P0**: KIT2-29 - cross-tab signal on Mark ready / Force close / task tick.

**P1**: KIT2-10, 11, 12, 18, 19, 20, 21, 22, 25, 28, 30, 31, 32, 33, 34, 35,
36, 37, 38, 40, 41, 43, 48, 51, 53, 55, 56, 57, 58, 59, 60, 61, 62, 66, 71,
80-85, 90.

**P2 / P3**: see findings tables.

---

## D. First-wave PRs

| PR | Title | Scope |
|---|---|---|
| KIT2-E | Cross-tab signal emit on Mark ready + Force close (KIT2-29 P0 + KIT2-30) | dashboard.tsx |
| KIT2-F | Unify nav + ProtectedRoute (KIT2-10 + KIT2-11) | dashboard.tsx |
| KIT2-G | Merge orders queries + deleted_at + LIMIT + local-tz today (KIT2-19/20/21/22/71) | dashboard + prepService |
| KIT2-H | Drop sales_admin + role-gate clock board (KIT2-41 + KIT2-43) | role checks |
| KIT2-I | Allergen P0 stack: hard-fail audit, whole-word, card colour-coding (KIT2-18 + KIT2-38 + KIT2-62) | prep service + kanban |
| KIT2-J | pickup_time as source of truth + SAST urgency fix (KIT2-25 + KIT2-28) | hero memo + helper |
| KIT2-K | 44px targets + hold-to-confirm + haptic + AlertDialog (KIT2-40/55/57/58/59) | buttons |
| KIT2-L | Prep checklist auto-expanded + prep-timer countdowns (KIT2-56 + KIT2-61 + KIT2-81) | kanban card |
| KIT2-M | Voice-tick for hands-free Mark ready (KIT2-60 + KIT2-80) | new hook |
| KIT2-N | Print "today's prep run-sheet" (KIT2-53 + KIT2-83) | new page |
| KIT2-O | Cleaning→kitchen "ready for prep" chip + KIT2-A count badge (KIT2-35 + KIT2-36 + KIT2-84) | new chip + cleaning aggregate query |
| KIT2-P | Resolve duty + Production Priority duplication (KIT2-48 + KIT2-51) | layout |
| KIT2-Q | Realtime sub + onOrderUpdated listener (KIT2-32 + KIT2-33) | effects |
| KIT2-R | Shopping → kitchen ingredient delta (KIT2-34 + KIT2-85). Prereq: SHP2-22 fix already shipped via PR #121 ✓ | needs new listener wiring |

---

## E. Cross-page chain-reaction verification list

Mark ready:
1. Driver dashboard - realtime sub catches it ✓
2. /admin/orders - **before KIT2-E: stale**
3. /admin/calendar - **before KIT2-E: stale**
4. /admin/order-assignments - **before KIT2-E: stale**
5. /track/{order_number} - **before KIT2-E: stale**
6. /admin/financial-dashboard - **before KIT2-E: stale**

Force close: as above. **Before KIT2-E: stale; force-close from /admin/orders already emits.**

Cleaning team completes tomorrow's equipment cleaning:
7. Kitchen "equipment ready for prep" chip + KIT2-A badge update. **Before KIT2-O: chip doesn't exist.**

Shopper marks butter purchased:
8. Kitchen prep-list shortfall drops butter; Low Stock Alerts clears butter. **Broken at shopping leg (SHP2-22 fixed via PR #121) AND broken at kitchen-listener leg (KIT2-34 / KIT2-85).** End-to-end now partially restored - inventory bumps from shopping but kitchen has no listener to react.

---

**Sign-off:** 83 numbered findings (KIT2-10..KIT2-92, with KIT2-15, 44, 47,
64, 70, 73 graded "no action - confirmed correct"). Continues KIT2- from
shallow audit (KIT2-1..KIT2-9). **P0 = 1 (KIT2-29)**. P1 = 35. First-wave
PRs = 14. The kitchen dashboard is functionally rich (allergen gate,
hot-hold timer, force-close cascade, plain-English copy, auto-promote
on last task tick) but cross-tab silent, mobile-hostile, voice-deaf, and
unprintable. This PR ships KIT2-E (the P0).
