# `/team-portal/driver/dashboard` (Driver dashboard) - deep audit (2026-05-19)

**Scope:** Replaces the earlier shallow `driver-dashboard-audit-2026-05-19.md`
(8 cursory items). This is the deep pass per Bobby's "1000 hours per page,
team of specialists" brief.

Daily-driver page for every driver login - first thing they see when they
open the app at 6am.

**Approach:** specialist-team perspectives (architecture / data integrity /
chain reactions / role mapping / cross-page placement / UX / performance /
missing features).

**Test tenant:** Spit Braai Delivery
(`/spit-braai-delivery/team-portal/driver/dashboard`).

**File:** `src/pages/team-portal/driver/dashboard.tsx` (935 lines).

**Siblings cross-checked:** `deliveries.tsx`, `earnings.tsx`, `notifications.tsx`,
`routes.tsx`, `schedule.tsx`, `tracking.tsx`.

---

## A. What's on the page

In order, top to bottom:

1. **DynamicNav** (driver role) - line 495
2. **Header strip** - "Welcome back, {firstName}", active deliveries count,
   unread-alerts pill, Play Game button (lines 500-527)
3. **TeamWelcomeBanner** (role=driver) - line 529
4. **MyShiftTodayCard** wrapped in WidgetErrorBoundary - lines 541-546
   (scope: delivery + kitchen_and_cleaning)
5. **DriverClockButton** - lines 552-554
6. **AvailableJobsCard** wrapped in WidgetErrorBoundary - lines 563-565
   (self-claim board)
7. **DriverShiftHistory** - lines 571-573
8. **PWAInstallPrompt** - lines 580-582
9. **GPS pinger status row** - badges for GPS on/off, wake-lock pill,
   error text (lines 591-618)
10. **Today's Earnings Summary card** - large hero number + hourly/distance
    breakdown + Outstanding tile (lines 621-666)
11. **Today's Route Overview card** - first 3 today's stops, tap-to-call
    client phone, special instructions, "View Full Route" link,
    "View Optimized Route" CTA (lines 669-738)
12. **Stats Grid** - 4 MetricCards: Today's Jobs / Completed / Pending /
    Earnings (lines 742-771)
13. **My Deliveries card** - the full active-jobs list with Navigate, Chat,
    Confirm delivery (POD), Decline buttons (lines 774-879)
14. **Footer**
15. **Modals** - CateringDashGame, PodCaptureDialog, DeclineAssignmentDialog,
    OrderChatPanel dialog, ChatBot
16. **Background side-effects** - notification realtime sub, orders realtime
    sub (status=ready filter), GPS pinger hook, 60-second hours-worked
    re-tick, fire-and-forget driver-ack POST on load

---

## B. Findings

### B.1 Architecture / code health

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| DRV-1 | **Inconsistent nav component across driver pages.** Dashboard + tracking use `<DynamicNav userRole={UserRole.DRIVER} />`, every other driver page (`deliveries`, `earnings`, `notifications`, `routes`, `schedule`) uses `<DriverNav />`. Two different nav trees for the same role - any nav-item change has to be made twice. | **P1** | 495 |
| DRV-2 | **No ProtectedRoute / allowedRoles guard on the page.** Every other dashboard in this audit programme (admin, kitchen, cleaning) is wrapped; driver dashboard relies purely on `useAuth().user` for fetching, so a logged-in non-driver hitting the URL renders a blank-data dashboard rather than getting bounced. | **P1** | 488-935 |
| DRV-3 | **Five `(supabase as any)` / `as any` casts** in a 935-line file that is otherwise typed. Type erasure spots: 116, 125, 225-226, 232, 251, 282-284, 314. The Job interface is solid - the leakage is in the loader. | **P2** | 116, 125, 225-226, 232, 251, 282-284 |
| DRV-4 | **935 lines in one component.** Three render-side responsibilities (today's earnings hero, today's route overview, my deliveries list) are inline. Each is a logical extract-target. The earnings calc block (414-435) would fit on its own as `useTodaysPotentialEarnings(jobs, payRates, hoursWorkedToday)`. | **P2** | 488-880 |
| DRV-5 | **Two distinct queries for the same conceptual set ("driver's active jobs").** lines 173-198 read `driver_assignments` joined to orders; lines 210-216 read orders directly via the `assigned_driver_id`/`driver_id` OR. The dedupe pass at 270-272 papers over the divergence. Status filters differ: assignments query allows `assigned/accepted/en_route/picked_up/at_venue`, direct-orders query allows `confirmed/preparing/ready/in_transit`. Edge cases either appear twice or disappear. | **P1** | 173-272 |
| DRV-6 | **`/notification.mp3` plays from any tab without a user-gesture check.** Modern browsers block autoplay; catch swallows it. Toast fires regardless, but no haptic fallback. | P3 | 319-320 |
| DRV-7 | **Two unused imports.** `InfoTooltip` (45) and `Tables<"driver_assignments">` (52). | P3 | 45, 52 |
| DRV-8 | **Realtime sub on UPDATE only.** A new INSERT into `orders` that is born already-assigned (admin creates + assigns in one save) won't trigger the sub - driver won't see the new job until manual refresh. | P2 | 378-403 |

### B.2 Data integrity / one source of truth

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| DRV-9 | **`payRates` fetched twice per driver session.** Identical effect runs in `dashboard.tsx` (92-103) and `routes.tsx` (68-79). Both call `getCompanyDefaults` + `getDriverProfile` + `resolveEffectiveRates`. Should be a `useDriverPayRates` hook. | **P1** | 90-103 |
| DRV-10 | **`totalEarnings` (Outstanding tile) vs `/team-portal/driver/earnings` page disagree on definition.** Dashboard tile sums `driver_assignments.total_earnings` for rows in status `completed`/`delivered`. Earnings page uses `driverPayService.getPaySummary` which computes from `driver_shifts` (hourly) + delivered orders (callout+distance). Two different totals for "what I've earned" - reachable from the same dashboard. | **P1** | 352-368 |
| DRV-11 | **Today's Potential Earnings uses `delivery_distance_km * 2` for round-trip** (428). Whether that field stores one-way or round-trip is set by `routeOptimizationService` / admin - no contract test. If a tenant logs round-trip distances, driver sees double pay forecast. | P2 | 424-431 |
| DRV-12 | **`completedToday` counts both `completed` and `delivered`** (413) but the My Deliveries query filters out neither - so a delivered job from earlier today still appears in the active list. "Pending: 0" but the row is still there to action. | P2 | 197, 215, 413 |
| DRV-13 | **No soft-delete guard on `driver_assignments` reads.** Lines 173-198 don't filter `deleted_at IS NULL`. Driver_shifts query on 121 does. | P2 | 173-198 |
| DRV-14 | **`assignmentByOrder` map is one-way** (order_id -> assignment_id, last-wins). On re-assignment of the same order, only the most recent ID is kept - Decline button targets whichever row sort-ordered first. | P3 | 224-228 |
| DRV-15 | **`hoursWorkedToday` re-ticks every 60s but never refetches when the driver clocks IN.** DriverClockButton sits above this effect; clocking in doesn't broadcast a refetch trigger, so for up to 59 seconds after clock-in the hourly earnings line still reads 0. | P3 | 110-140 |

### B.3 Chain reactions (inbound + outbound signal graph)

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| DRV-16 | **Driver dashboard NEVER emits `cateringms:order-updated`.** POD capture, decline, accept, GPS pings - none broadcast on the cross-tab event bus. Admin/dispatch + kitchen + client portal listen for that event but the driver's actions only propagate via the realtime sub (with delay) and via per-page `loadDriverJobs()`. Net: driver hits "Confirm delivery" - dispatch's open browser tab does NOT instantly drop the row. | **P1** | (whole file) |
| DRV-17 | **Inbound realtime sub filters on `company_id` channel filter** (386) but JS re-checks the assignment (396). Server-side filter is right; the JS re-check would miss a transition where dispatch reassigns mid-flight. | P2 | 378-403 |
| DRV-18 | **Effect cleanup audit needed across 5 effects.** Rapid logout/login can stack subscriptions. Cleanup is present for notifications (344) but not asserted across the three other realtime effects. | P3 | 304-346 |
| DRV-19 | **Auto-ack fires on every dashboard mount** (282-295). Idempotent on the server but fires `unackedIds.length` POSTs in parallel. Driver with 20 fresh assignments = 20 fetches. Should be one POST. | P3 | 282-295 |
| DRV-20 | **Outbound chat realtime not wired here.** OrderChatPanel mounts in a dialog (921), but a new message from dispatch when the dialog is CLOSED does not bump the unread badge - the badge counts `notifications` only, not chat messages. | P2 | 911-930 |

### B.4 Role / visibility mapping

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| DRV-21 | **No allowedRoles gate** (already DRV-2). Defense-in-depth missing. | **P1** | 386, 564 |
| DRV-22 | **Cross-driver visibility check.** Direct-orders + assignments queries are correctly self-scoped. ✓ | none | 196, 214 |
| DRV-23 | **Outstanding tile (`totalEarnings`) shows total across ALL time** (354-368, no date filter). A 3-year tenured driver sees a giant cumulative number. Earnings page paginates by period; the dashboard tile doesn't. Should be "this pay period". | P2 | 352-368, 660-662 |
| DRV-24 | **No admin-only field leakage observed.** No `assignment_score`, no `cost_to_serve`, no margin. ✓ | none | - |
| DRV-25 | **PII access logging absent on the dashboard's tap-to-call** (703-711). Deliveries page DOES log via `logPiiAccess`. Inconsistent compliance posture. | P2 | 703-711 |

### B.5 Cross-dashboard placement

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| DRV-26 | **DriverShiftHistory belongs on `/earnings` (or its own /shifts page), not on the dashboard.** Retrospective surface - not glanceable on a daily-driver page. Earnings page already groups around shifts. | P2 | 571-573 |
| DRV-27 | **MyShiftTodayCard scope includes `kitchen_and_cleaning`** (543). A driver who also helps in kitchen sees cleaning tasks here - and `/team-portal/cleaning/dashboard` ALSO surfaces them. Per Bobby ("drivers don't run cleaning"), scope should be `["delivery"]` only. | P2 | 543 |
| DRV-28 | **`Today's Route Overview` card duplicates `/routes` page top section.** Once Trip is started, this dashboard card still shows the same first-3 with a "View Full Route" link to the page that has the live state. Dashboard version becomes stale the moment trip starts. | P2 | 669-738 |
| DRV-29 | **No "Tomorrow" peek.** Schedule page already groups today/tomorrow/this week. There's no "next 3 days at a glance" on the dashboard - driver navigates to /schedule to plan. | P2 | - |
| DRV-30 | **CateringDashGame ("Play Game") is on the daily-driver dashboard.** Gamification has a place, but the top-right primary CTA on the 6am page being "Play Game" reads as a UX mistake. Move to /fun or shrink to a footer link. | P3 | 519-525 |
| DRV-31 | **Cleaning schedule link confirmed NOT needed.** Per Bobby: drivers don't run cleaning. ✓ Document as no-action. | none | - |

### B.6 UX / UI (mobile-first - drivers are on phones, in sunlight, often one-handed)

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| DRV-32 | **No print-friendly day's run sheet.** Bobby's brief explicitly flagged this. Driver with a phone in a Ford Ranger cab at 6am wants a paper backup. No `?print=true` view, no link. | **P1** | (missing) |
| DRV-33 | **No "I'm running late" one-tap broadcast.** Driver stuck in Joburg traffic has no fast path to push an ETA-changed signal to dispatch + the client. Chat dialog exists but requires typing. A single-tap "Running 15 / 30 / 60 min late" button feeding `order_events` + a client notification is missing. | **P1** | (missing) |
| DRV-34 | **No breakdown / accident incident form.** Flat tyre - voice call only. No structured incident capture (photo, location, severity, ETA-to-resolve). | **P1** | (missing) |
| DRV-35 | **Header layout breaks on small screens.** Lines 510-527: unread-alerts pill + Play Game button compete for the same right-side flex group. 360px Android = awkward wrap. | P2 | 510-527 |
| DRV-36 | **Tap targets borderline.** Navigate/Chat/Confirm/Decline buttons on the deliveries list (821-872) use `size="sm"` which renders ~32px height. Apple HIG = 44px, Material = 48dp. Driver wearing gloves at 5am will miss. | **P1** | 821-872 |
| DRV-37 | **Color contrast for sunlight.** Hero earnings number is `text-green-600` on `from-green-50 to-emerald-50` gradient. Status badges use 100/800 light/text pairs. Marginal outdoors. | P2 | 621-628, 449-465 |
| DRV-38 | **No glanceable "next pickup time".** Earnings hero is the biggest number. Most-asked driver question is "when is my next pickup". Hero should show pickup_time + venue. Currency belongs lower or on /earnings. | **P1** | 621-666 |
| DRV-39 | **No vibration / haptic on the "order is ready" toast.** Audio plays but no `navigator.vibrate()` call. Noisy kitchen yard = driver can't hear. | P2 | 317-328 |
| DRV-40 | **Audio-cue path hardcoded to `/notification.mp3`** with no volume control, no per-tenant override, no opt-out. | P3 | 319 |
| DRV-41 | **"Decline" only appears in assigned/accepted state** (858). Driver who's en_route and breaks down has no path to release the job back to dispatch. | P2 | 858 |
| DRV-42 | **No photo-of-handover signature surface.** POD capture dialog exists, but signature capture (separate from photo) doesn't appear. Verify against PodCaptureDialog impl. | P2 | 887-896 |
| DRV-43 | **Dead-end on empty state.** Lines 784-790: "No deliveries scheduled" with copy but no CTAs to /schedule or /earnings. | P2 | 784-790 |
| DRV-44 | **No voice-to-text for POD notes.** Standard `<input>` typing required. | P3 | (PodCaptureDialog scope) |
| DRV-45 | **No calm/dark mode for night shifts.** The blue-50 via-indigo-50 to-purple-50 gradient glares at 11pm. | P3 | 497 |

### B.7 Performance

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| DRV-46 | **Direct-orders query has no date window.** Line 210-216 pulls every order in the company matching status filter. Wide read on busy tenants. | **P1** | 210-216 |
| DRV-47 | **`totalEarnings` query has no LIMIT and no date window.** 5-year-tenure driver = thousands of rows just to sum one column. Should be a server-side SUM via RPC or a view. | P2 | 352-368 |
| DRV-48 | **`hoursWorkedToday` runs every 60s** even when the driver has not clocked in. Wakes the device, fires a network call, no-ops. | P3 | 138 |
| DRV-49 | **GPS pinger battery cost not surfaced to driver.** No ping-interval display, no battery readout. | P3 | 156-158 |
| DRV-50 | **Five `useEffect`s with overlapping dependencies.** Page mounts = 5 parallel cascades, ~6-8 supabase requests. Earnings fetch fires on every job-list mutation. | P2 | 92, 111, 304, 349, 375 |
| DRV-51 | **`jobs.map((j) => j.id)` rebuilds every render** (156). Hook may re-install on every render. Memoize. | P3 | 156-158 |
| DRV-52 | **Realtime sub fires on every order UPDATE in the tenant**, not filtered to driver's own. Busy tenant = 50+ updates/hour. | P3 | 378-403 |

### B.8 Missing features (driver-needs gap)

| # | Finding | Severity |
|---|---|---|
| DRV-53 | **Tap-to-call dispatch.** Driver can call the client; can't call dispatch. Chat exists but voice is faster when both hands are dirty. | **P1** |
| DRV-54 | **Fuel log.** Driver logs `litres / odometer / cost` at the pump. Feeds finance + per-vehicle cost-per-km. Absent. | P2 |
| DRV-55 | **Mileage report.** Personal mileage running total (week / month / YTD) for the driver's SARS travel claim. | P2 |
| DRV-56 | **Vehicle assignment visibility.** Driver doesn't see which vehicle they've been assigned today on the dashboard - have to go to admin's dispatch page. | **P1** |
| DRV-57 | **Pre-trip vehicle check.** No 30-second walk-around checklist (tyres, fuel, lights, load-secured) before "Start Trip". | P2 |
| DRV-58 | **"I'm here" arrived-at-venue ping.** DriverConfirmationPanel has it on /deliveries (the 4-stage flow); the dashboard's deliveries list does NOT mount the panel. Driver who lives on the dashboard cannot signal "arrived" without navigating. | **P1** |
| DRV-59 | **Tip / gratuity capture.** No surface for a driver to record a cash tip received at the venue. | P3 |
| DRV-60 | **Print run sheet (covered by DRV-32).** Same gap as the admin dispatch P1. | P1 |
| DRV-61 | **Emergency / SOS button.** Driver alone in a township at night - no panic surface. Two taps to fire a notification to admin with last GPS coord. | P2 |

---

## C. Priority fix list

**P0** (broken / safety): none. Closest = DRV-2 + DRV-21 (missing route guard)
graded P1 because RLS provides a backstop.

**P1** (UX critical + one-source-of-truth + missing-feature):
- DRV-1: Unify nav (`DriverNav` everywhere)
- DRV-2 / DRV-21: Add ProtectedRoute with `allowedRoles=[DRIVER, ...admin]`
- DRV-5: Consolidate the two driver-jobs queries into one
- DRV-9: Extract `useDriverPayRates` hook
- DRV-10: Make Outstanding tile and /earnings agree on definition
- DRV-16: Emit `cateringms:order-updated` after every driver action
- DRV-32 / DRV-60: Print-friendly day's run sheet
- DRV-33: "I'm running late" one-tap broadcast
- DRV-34: Breakdown / accident incident form
- DRV-36: 44px tap targets
- DRV-38: "Next pickup" hero instead of currency
- DRV-46: Server-side date window on direct-orders query
- DRV-53: Tap-to-call dispatch
- DRV-56: Vehicle-assigned-today chip
- DRV-58: Mount DriverConfirmationPanel on dashboard deliveries list

**P2** (data integrity + chain reactions + role coverage + perf + cross-page):
DRV-3, 4, 8, 11, 12, 13, 17, 20, 23, 25, 26, 27, 28, 29, 35, 37, 39, 41, 42,
43, 47, 50, 54, 55, 57, 61

**P3** (polish):
DRV-6, 7, 14, 15, 18, 19, 30, 40, 44, 45, 48, 49, 51, 52, 59

---

## D. First-wave PRs

| PR | Title | Scope |
|---|---|---|
| DRV-A | Unify driver nav + add ProtectedRoute wrapper (DRV-1 / DRV-2 / DRV-21) | `dashboard.tsx`, `tracking.tsx` |
| DRV-B | One source of truth for "driver's active jobs" + soft-delete guard (DRV-5 / DRV-13) | `dashboard.tsx` loadDriverJobs() |
| DRV-C | Extract `useDriverPayRates` hook + collapse duplicate fetches (DRV-9) | new hook, `dashboard.tsx`, `routes.tsx` |
| DRV-D | Earnings totals agree across dashboard + /earnings (DRV-10 / DRV-23 / DRV-47) | `dashboard.tsx` Outstanding tile + server-side SUM |
| DRV-E | Cross-tab signal emit on every driver action (DRV-16) | POD save / decline / accept callbacks emit `cateringms:order-updated` |
| DRV-F | "Next pickup" hero + tap-to-call dispatch + vehicle-assigned chip (DRV-38 / DRV-53 / DRV-56) | header/hero rework |
| DRV-G | One-tap "Running late" broadcast (DRV-33) | new component + API endpoint |
| DRV-H | Mount DriverConfirmationPanel on dashboard + bump tap targets to 44px (DRV-36 / DRV-58) | deliveries list block |
| DRV-I | Server-side date window on driver orders query (DRV-46) | dashboard + /deliveries loader |
| DRV-J | Print-friendly day's run sheet (DRV-32 / DRV-60) | new `/team-portal/driver/run-sheet-print.tsx` |

---

## E. Cross-page chain-reaction verification list

When the driver clicks "Confirm delivery" on the dashboard, the following
surfaces should react without manual refresh. Verify each:

1. `/admin/order-assignments` (dispatch) - row should disappear / flip
2. `/admin/tracking` (live ops) - GPS marker should clear
3. `/team-portal/kitchen/dashboard` - if kitchen surfaces "in transit" count, decrement
4. `/track/{order_number}` (public client portal) - status pill should flip
5. `/admin/financial-dashboard` - driver pay daily total should refresh

Today: the realtime sub on `orders` covers (1) and (2); the cross-tab
`cateringms:order-updated` event would cover (3)-(5) - but DRV-16 says the
dashboard doesn't emit it. PR DRV-E is the fix.

---

**Sign-off:** 49 numbered findings (DRV-1 through DRV-61, with DRV-22,
DRV-24, DRV-31 graded as "no action - confirmed correct"). Replaces the
8-item shallow audit. P1 fix list = 15 items, first-wave PRs = 10. The
driver dashboard is functionally good (GPS pinger, POD, decline, chat,
claim-board all wired) but is currently a "scroll-and-read" page rather
than a "one-tap-to-act" page - the P1 list pivots it to the latter.
