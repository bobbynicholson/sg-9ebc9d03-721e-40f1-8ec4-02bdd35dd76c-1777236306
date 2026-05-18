# `/admin/dashboard` audit (2026-05-19)

**Scope:** First page of Bobby's full per-page audit programme.
Top item under the admin nav `Today` group. Daily-driver page
for every owner / admin login - first thing they see.

**Approach:** specialist-team perspectives (architecture / data
integrity / UX / role mapping / chain reactions / performance).
No rush, no time pressure - the spec is correctness, not speed.

**Test tenant:** Spit Braai Delivery
(`/spit-braai-delivery/admin/dashboard`).

---

## A. What's on the page

The page renders, in order, top to bottom:

1. **Header** - title, date-range picker, Refresh button, tenant
   timezone chip
2. **EmailProviderBanner** (self-hides if email provider wired)
3. **28 widgets**, each WidgetErrorBoundary-wrapped, in a single
   vertical scroll:
   - TodaysPulse (KPI strip)
   - RecentlyViewedWidget
   - QuoteFollowupWidget
   - InventoryLowStockWidget
   - InventoryExpiryWidget
   - RecentInventoryAdjustsWidget
   - VehicleServiceDueWidget
   - DeliverySlaWidget
   - CleaningQueueWidget
   - EquipmentDamagesWidget
   - NewLeadsTodayWidget
   - LeadAgingWidget
   - TomorrowsEventsWidget
   - ActiveStaffNowWidget
   - DispatchGapWidget
   - WeeklyOrdersChart
   - PendingRefundsWidget
   - OverdueInvoicesWidget
   - RecentRatingsWidget
   - CancelledOrdersWidget
   - RecentPaymentsWidget
   - RecentActivityWidget
   - EmailFailuresWidget
   - MenuTopSellersWidget
   - TopClientsWidget
   - QuoteResponseTimeWidget
   - RegionPerformanceWidget
   - YearOverYearCard
4. **FirstStepsCard** (onboarding self-hider)
5. **Priority Actions** card (conditional - shows pendingQuotes +
   lowStockItems + upcomingEvents)
6. **Key Metrics Grid** (4 tiles: Booked Revenue, Collected,
   Outstanding, Active Orders)
7. **Secondary Stats** (conditional 2-tile row: VAT in range,
   Quote conversion)
8. **Quotes in Circulation** (1-tile full-width)
9. **Performance Grid** (4 tiles: Avg Order Value, Completion
   Rate, Upcoming Events, Team Members)
10. **Cancellations + Refunds** (3-tile row)
11. **Quick Actions** card (4 links: Orders / Team / Financial /
    Inventory)
12. **BusinessIntelligence** (charts + insight cards)
13. **ChatBot**

Plus a realtime `postgres_changes` subscription on the `orders`
table that refetches `loadMetrics` on any change.

---

## B. Findings, by specialist

### B.1 Architecture / code health

| Finding | Severity | Fix |
|---|---|---|
| **F1. `@ts-nocheck` on line 2** disables type-checking on the entire 1,005-line file. Daily-driver page, deserves type safety. Earlier audits removed @ts-nocheck from 47 service files; this page slipped. | P0 | Remove the directive; fix the resulting tsc errors. |
| **F2. 28 widget imports stacked vertically** with no logical grouping. The component tree is one long render, hard to scan. | P2 | Group into named subsections (Today / Pipeline / Operations / Money / Activity) with collapsible headers. |
| **F3. 6 parallel queries on load + 28 widgets each running their own queries** = ~30+ requests on cold load. | P2 | Push the always-on counters (low stock, pending quotes, team size) into the widgets that already use them, drop them from `loadMetrics`. Net query reduction: ~3-5. |
| **F4. Realtime subscription only listens to `orders`.** Quote / payment / inventory changes from other tabs don't refresh. | P3 | Either expand to a multi-table listener OR drop the realtime sub and rely on the explicit Refresh button. |
| **F5. `Stats` interface + `EMPTY` constant + setter shape duplicated.** Easy field-drift target. | P3 | Already typed; just remove the @ts-nocheck so TS enforces. |

### B.2 Data integrity / one source of truth

| Finding | Severity | Fix |
|---|---|---|
| **F6. Low stock surfaces in three places**: `InventoryLowStockWidget` card, `stats.lowStockItems` count in Priority Actions, red badge on the Inventory Quick Action link. | P1 | Keep the widget as the canonical surface. Drop the Priority Actions row + the badge (or keep only the badge, drop both others). |
| **F7. Cancellations surfaces in three places**: `Cancellations` metric tile + `Top Cancel Reason` tile + `CancelledOrdersWidget` row list. | P1 | Keep the widget (rich detail). Collapse the two tiles into a single "Cancelled / Top reason" combined tile, or drop both. |
| **F8. Refunds surfaces in two places**: `Refunds Outstanding` metric tile + `PendingRefundsWidget`. | P1 | Keep the widget. Drop the metric tile (the widget shows count + total). |
| **F9. Upcoming events surfaces twice**: `Upcoming Events` metric tile + `TomorrowsEventsWidget`. Subtly different (tile = anything ≥today not cancelled, widget = strictly tomorrow). | P2 | Rename the metric tile to "Events in range" to dispel ambiguity, or drop it and let the widget carry the day-zero / day-one signal alone. |
| **F10. Active orders + Quick Action "Manage Orders" sub-text both reference `activeOrders`** with different framing. Not a bug; reads as redundant. | P3 | Trim the Quick Action sub-text. |

### B.3 Cards that belong on other pages

| Finding | Severity | Recommended home |
|---|---|---|
| **F11. `CleaningQueueWidget`** - shows pending cleaning_jobs. Admin sees a count; the actual user who acts on it is the cleaning lead. | P1 | Move to `/team-portal/cleaning/dashboard`. Keep a tiny summary chip on the admin page (link). |
| **F12. `VehicleServiceDueWidget`** - vehicle service alerts. Admin doesn't service vehicles. | P2 | Move to `/admin/vehicles`. Keep on admin as a "click-through" badge if any are due in 7 days. |
| **F13. `InventoryExpiryWidget` + `RecentInventoryAdjustsWidget`** - both are inventory-team surfaces. Shopping team acts on them. | P2 | Move both to `/admin/inventory` and `/admin/shopping`. Admin keeps the `InventoryLowStockWidget` (it drives a Priority Action). |
| **F14. `EquipmentDamagesWidget`** - equipment lead surface. | P2 | Move to `/admin/equipment`. Keep a single line ("X unresolved damages, R{value} hit") on admin if non-zero. |
| **F15. `EmailFailuresWidget`** - operator surface, but the bigger signal is the `EmailProviderBanner` already at the top. | P3 | Keep on admin (it's a "something is breaking" alarm) but make sure it's only visible when count > 0 (already self-hides). |
| **F16. `RegionPerformanceWidget` + `YearOverYearCard`** - analytics, not action items. | P3 | Move both to `/admin/financial-dashboard` Overview tab where the rest of the analytics live. Admin keeps the headline tiles only. |

### B.4 Missing features

| Finding | Severity | Fix |
|---|---|---|
| **F17. Cashflow Forecast Card NOT on /admin/dashboard.** The forward-looking question owners ask first ("can I make payroll Friday?") is gated behind a click to /admin/financial-dashboard. | P1 | Add a Cashflow Snapshot card on /admin/dashboard - mini version showing cash on hand + forecast number + horizon picker, click drills to /admin/financial-dashboard for the chart. |
| **F18. Print-friendly shopping-list-for-today action absent.** Bobby's brief: "if a user needs to go shopping today, there should be an easy list to print." | P0 | Add a "Today's shopping" Quick Action that opens a print-ready view (likely existing on /admin/shopping; needs a "Print today" affordance there). Cross-link from dashboard. |
| **F19. No empty-state for fresh tenants.** Spit Braai with sparse data sees 28 self-hiding widgets + zero tiles = page reads as broken. | P1 | When all 28 widgets self-hide AND tile values are all 0, render a "First Steps" hero + the FirstStepsCard (currently buried below the widgets). |
| **F20. No "Last refreshed" timestamp.** Operator can't tell if the data is stale. | P3 | Append "as of HH:mm" beside the Refresh button. |

### B.5 Role / visibility mapping

| Finding | Severity | Fix |
|---|---|---|
| **F21. Page gated to super_admin/company_admin/admin only.** Owner role NOT in the allowed list. | P0 | The `owner` role exists per AuthContext but isn't in the ProtectedRoute allowedRoles. Add UserRole.OWNER (verify enum value). |
| **F22. Finance tiles (Booked / Collected / Outstanding / VAT / Refunds) visible to admin role too.** Skylight finance-visibility rule says admin sees finance, kitchen/driver/etc don't. The current gate is correct - documented for clarity, no change needed. | none | - |

### B.6 Chain reactions (what fires when each tile / widget acts)

- **Clicking a MetricCard with href** navigates to the linked surface (Wave 70.52a). ✓ Working.
- **Refresh button** fires `loadMetrics`. Doesn't refresh the 28 widgets (each owns its own data). Inconsistent.
  - **Fix:** Refresh button should broadcast a `dashboard:refresh` event the widgets listen on, OR call a coordinated refetch.
- **Realtime sub on `orders`** refetches `loadMetrics`. Doesn't refetch the 28 widgets either.
  - **Fix:** Same as Refresh. Either the realtime sub broadcasts an event, or widgets each install their own narrow subs.
- **Priority Actions row "Review" -> /admin/quotes** (Wave 70.52a withSlug fix applied). ✓
- **Inventory Quick Action badge** reads `stats.lowStockItems` - duplicated with widget (F6).

### B.7 Performance

- **Cold load:** ~30+ supabase requests (6 in `loadMetrics` + ~24 inside widgets). With network roundtrip ~200ms each parallel-batched into 3-5 visible "waves" - first paint to fully-hydrated probably 1-2s on Spit Braai's data shape.
- **Realtime sub fires on EVERY `orders` change** including unrelated tenants if RLS doesn't filter the channel (it does at row level, but the channel still wakes up on every change in the table).
  - **Fix:** Filter the channel by company_id - `postgres_changes` supports a filter object.
- **No `WidgetErrorBoundary` performance impact** (good - errors in one widget don't crash others).

---

## C. Priority-sorted fix list

**P0** (broken / safety-relevant) - ship NOW:
- F1: Remove `@ts-nocheck`
- F18: Print-friendly today's shopping list
- F21: Add `owner` role to allowedRoles (verify first - may not exist as a separate role)

**P1** (one-source-of-truth + on-wrong-page + missing feature):
- F6: De-duplicate Low Stock surfaces
- F7: De-duplicate Cancellations surfaces
- F8: De-duplicate Refunds surfaces
- F11: Move CleaningQueueWidget to cleaning portal
- F17: Add Cashflow Snapshot card to /admin/dashboard
- F19: Real empty-state for fresh tenants

**P2** (cards on wrong page + UX polish):
- F2: Group widgets into collapsible sections
- F3: Drop duplicate counters from `loadMetrics`
- F9: Disambiguate Upcoming Events tile vs Tomorrow widget
- F12: Move VehicleServiceDueWidget
- F13: Move Inventory expiry + adjusts widgets
- F14: Move EquipmentDamagesWidget
- F16: Move RegionPerformance + YearOverYear analytics to /admin/financial-dashboard

**P3** (nice-to-have):
- F4: Multi-table realtime listener
- F5: Drop dead code once @ts-nocheck is off
- F10: Trim Quick Action redundant sub-text
- F15: EmailFailures already self-hides; no change
- F20: Last-refreshed timestamp

---

## D. Concrete first-wave PRs

The audit's volume means a single PR would be unreviewable.
Each fix below is its own PR scope:

| PR | Title | Files touched |
|---|---|---|
| AD-1 | Remove `@ts-nocheck` from `/admin/dashboard` | 1 |
| AD-2 | Print-friendly "Today's shopping" cross-link + ensure print view exists on /admin/shopping | 2-3 |
| AD-3 | Add owner role to allowedRoles (verify UserRole.OWNER first) | 1 |
| AD-4 | De-dupe Low Stock / Cancellations / Refunds surfaces | 1 |
| AD-5 | Move CleaningQueueWidget to /team-portal/cleaning/dashboard + leave a 1-line link on admin | 2-4 |
| AD-6 | Add CashflowSnapshotCard to /admin/dashboard | 2-3 |
| AD-7 | Real empty-state for fresh tenants | 1 |
| AD-8 | Group remaining widgets into collapsible sections | 1 |
| AD-9 | Move VehicleService + InventoryExpiry + EquipmentDamages widgets to their dedicated pages | 4-6 |
| AD-10 | Move RegionPerformance + YearOverYear to financial-dashboard | 2 |

After AD-1 through AD-10 land, /admin/dashboard reads like the page Bobby is asking for: focused, role-correct, one source of truth, with the cashflow forward-look the owner actually wants.

---

## E. Cross-dashboard chain reactions to verify next session

The page touches 25+ destinations via Quick Actions / Priority Actions / MetricCard hrefs / widget content. Each is its own audit subject when we walk into those pages. Specifically:

- **/admin/cleaning** (after F11 move) - does the cleaning dashboard have CleaningQueueWidget already? Don't double up.
- **/admin/vehicles** (F12) - same question
- **/admin/inventory + /admin/shopping** (F13) - which page is the right home for InventoryExpiry vs RecentInventoryAdjusts?
- **/admin/equipment** (F14) - existing equipment-damages surface?
- **/admin/financial-dashboard** (F16) - have RegionPerformance and YearOverYearCard already been added during the cashflow plan work?

Each of those pages gets its own audit doc when we reach them.

---

**Sign-off:** This audit captures what /admin/dashboard looks like
on 2026-05-19. Findings are concrete + actionable. Next push:
execute AD-1 → AD-3 (the P0 fixes), then loop back for P1.
