# `/team-portal/cleaning/dashboard` (Cleaning staff dashboard) - deep audit (2026-05-19)

**Scope:** Replaces the earlier shallow `cleaning-dashboard-audit-2026-05-19.md`
(7 cursory items). Deep pass per Bobby's "1000 hours per page" brief.

Cross-role surface for kitchen leads per KIT2-A (PR #115) - kitchen header
deep-links here. So this page is now the kitchen lead's read-only window
on the cleaning roster too.

**Test tenant:** Spit Braai Delivery.

**File:** `src/pages/team-portal/cleaning/dashboard.tsx` (439 lines).

**Siblings cross-checked:** `damage`, `equipment`, `handovers/[id]`,
`notifications`, `schedules`, `settings`, `supplies`, `tasks`, `workflows`.

---

## A. What's on the page

1. **DynamicNav** (CLEANING_STAFF) - line 129. **Fixed in CLN2-D** → CleaningNav.
2. **Header strip** - Sparkles avatar, "Cleaning Dashboard" + subtitle.
3. **TeamWelcomeBanner** (role=cleaning).
4. **MyShiftTodayCard** scope=`["cleaning", "kitchen_and_cleaning"]`.
5. **CleaningDutyWidget** - clock-in / on-duty roster.
6. **CleaningEventBoard** `id="returns"` - 48h expected / in progress / done today.
7. **CleaningJobsQueue** `id="washing"` - flat ledger, 30s poll.
8. **Equipment Status Overview** - 4 tiles (Available / In Use / Cleaning / Damaged).
9. **Today's Priority Inspections** - first 5 cleaning+damaged rows with **non-functional `Inspect` button**.
10. **Tabs** - Equipment Verification (default) / Damages & Losses / Team Status.
11. **Quick legend strip**.
12. **Footer + ChatBot**.

---

## B. Findings

### B.1 Architecture / code health

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| CLN2-8 | Page uses `<DynamicNav>` while every sibling uses `<CleaningNav>`. Same DRV-1 bug. | **P1** | 20, 129 |
| CLN2-9 | Five `(supabase as any)` casts; service-side worse (134-305). | P2 | 89 |
| CLN2-10 | Inline EquipmentStatusOverview (~60 lines) + TodaysPriorityInspections (~40 lines). | P2 | 191-289 |
| CLN2-11 | Zero useMemo across 6 equipment.filter passes. | P3 | 197-279 |
| CLN2-12 | Hash-scroll effect re-fires on every router.asPath change. | P3 | 51-65 |
| CLN2-13 | Equipment load has no AbortController. Tenant-switch race. | P2 | 67-120 |
| CLN2-14 | Three independent polls stacked (60s + 30s + 30s). | P2 | (children) |
| CLN2-15 | `status` derivation: zero-stock item renders "available". | P2 | 96-105 |

### B.2 Data integrity / one source of truth

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| CLN2-16 | **Two "Cleaning" counts disagree**: overview tile counts equipment rows; queue counts cleaning_jobs rows. | **P1** | 222-224 |
| CLN2-17 | No `deleted_at IS NULL` on equipment query. | **P1** | 72-75 |
| CLN2-18 | Legacy equipment_cleaning_status table still readable; not reconciled with cleaning_jobs. | P2 | 97 |
| CLN2-19 | **EquipmentVerificationPanel filters `order.user_id === user.id` - that's the client who placed the order, NOT the cleaner. Panel renders empty for actual cleaners.** | **P0** | EquipmentVerificationPanel:65 |
| CLN2-20 | Three availability surfaces, three polls, three different worlds for 60s after a change. | **P1** | 67-120 |
| CLN2-21 | `available_quantity` is stored AND subtracted in JS - double-subtract or stale-stored ambiguity. | **P1** | 74, 89-95 |
| CLN2-22 | Three "who's on cleaning" reads stacked. | P2 | 160, 369 |
| CLN2-23 | `reportDamage` hard-codes `damageType="lost"` - false labels on damages dashboard. | **P1** | EquipmentVerificationPanel:113 |
| CLN2-24 | `unit_cost` falls back to 0 silently. | P2 | EquipmentVerificationPanel:116 |

### B.3 Chain reactions

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| CLN2-25 | `completeJob` doesn't emit `cateringms:order-updated`. | **P1** | service:289-299 |
| CLN2-26 | **`completeJob` doesn't update `equipment.available_quantity`, doesn't close handover, doesn't write order_events.** Tick is vibes-only. | **P0** | service:289-299 |
| CLN2-27 | `startCleaningDuty` doesn't write order_events / notify kitchen lead. | P2 | duty widget |
| CLN2-28 | No realtime sub on equipment_handovers. CleaningEventBoard polls 60s only. | P2 | (whole) |
| CLN2-29 | `confirmHandoverReceipt` fires but no event to driver / dispatch / kitchen. | **P1** | verify panel:88-94 |
| CLN2-30 | **No "pre-event cleanliness checklist".** Kitchen has no way to read "is the kitchen ready for tomorrow's prep". | **P1** | (missing) |
| CLN2-31 | **No broken-equipment escalation flow.** BrokenEquipmentDashboard is read-only. | **P1** | (whole) |
| CLN2-32 | CleaningEventBoard listens to focus but not visibilitychange / cross-tab. | P2 | child |

### B.4 Role / visibility mapping

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| CLN2-33 | **KITCHEN_STAFF not in `allowedRoles`. PR #115 KIT2-A CTA bounces kitchen leads. Bobby's "kitchen sees cleaning" directive defeated by route guard.** | **P0** | 429-434 |
| CLN2-34 | No SALES_ADMIN. Defer to product. | P2 | 429-434 |
| CLN2-35 | CleaningDutyWidget Start-duty button writes for any role. Kitchen lead can accidentally clock in as a cleaner. | **P1** | 160 |
| CLN2-36 | KitchenStaffTileBoard with `department="cleaning"` allows non-lead to clock cleaners in/out. | **P1** | 369 |
| CLN2-37 | BrokenEquipmentDashboard filters damages by `user.id` - admin sees only their personal damages. | **P1** | broken:34 |
| CLN2-38 | No PII access logging on handover lists. | P2 | board |
| CLN2-39 | MyShiftTodayCard scope correct. ✓ | none | 151 |

### B.5 Cross-dashboard placement

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| CLN2-40 | **Kitchen lead landing via KIT2-A sees CleaningDutyWidget "Off duty" first**, useless. Page not optimised for cross-role read consumer. | **P1** | layout |
| CLN2-41 | KitchenStaffTileBoard doesn't belong on daily cleaner page. | P2 | 369 |
| CLN2-42 | BrokenEquipmentDashboard is admin-grade cost reporting - belongs on /admin/equipment or /team-portal/cleaning/damage, not on the daily-driver dashboard. | **P1** | 345-360 |
| CLN2-43 | Today's Priority Inspections duplicates the Verification panel. | P2 | 247-289 |
| CLN2-44 | **`Inspect` button is non-functional (no onClick, no href).** | **P1** | 274-276 |
| CLN2-45 | No "Tomorrow's expected returns" peek. | P2 | board |
| CLN2-46 | No link / badge to /team-portal/cleaning/supplies for low-stock. | P2 | (missing) |
| CLN2-47 | Legacy CleaningWorkflowTracker / equipment_cleaning_status still in service - confirm dead. | P3 | service |

### B.6 UX / UI (wet hands, splashes, loud kitchen)

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| CLN2-48 | `size="sm"` (32px) tap targets on every action. Same DRV-36 issue. | **P1** | 274 |
| CLN2-49 | No hold-to-confirm on Complete. Wet sponge bump = job marked complete. | **P1** | queue |
| CLN2-50 | No haptic on action. | P2 | queue |
| CLN2-51 | Hash-scroll target has no visual nudge / pulse. | P3 | 168, 179 |
| CLN2-52 | Cyan-on-cyan-50 hero contrast marginal in dish area lighting. | P2 | 134-141 |
| CLN2-53 | **No print roster.** Bobby's brief flagged. | **P1** | (missing) |
| CLN2-54 | 3-tab pattern hides primary actions one tap deep. | P2 | 300-371 |
| CLN2-55 | **No voice notes on damage.** Bobby's brief flagged. | **P1** | verify panel |
| CLN2-56 | **Native `alert()` x3 in EquipmentVerificationPanel** (75, 83, 128). Loses focus, hard to dismiss with wet hands. | **P1** | verify panel:75 |
| CLN2-57 | No print sheets at all. | P2 | (missing) |
| CLN2-58 | Plain Loader2 spinner, no skeleton. | P3 | children |
| CLN2-59 | Priority Inspections empty branch has no next-action CTA. | P3 | 279-284 |
| CLN2-60 | Board + queue visually nearly identical. | P3 | 168-181 |

### B.7 Performance

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| CLN2-61 | 3 polls + 1 fetch = ~9 calls in first 60s. No visibility-aware pausing. | **P1** | 86, children |
| CLN2-62 | `listActiveJobs` does 2 round-trips by design - paid every 30s. | P2 | service |
| CLN2-63 | Equipment fetch has no LIMIT - 500-equipment tenants read all on mount. | P2 | 72-75 |
| CLN2-64 | BrokenEquipmentDashboard re-fires on auth refresh tick. | P2 | broken:24 |
| CLN2-65 | Verify panel JOIN + JS filter - should server-WHERE. | P2 | verify panel |
| CLN2-66 | **No realtime sub on cleaning_jobs / equipment_handovers.** Same DRV-pattern. | **P1** | (whole) |
| CLN2-67 | Polls replace arrays even when unchanged. No content hash. | P3 | children |

### B.8 Missing features

| # | Finding | Severity |
|---|---|---|
| CLN2-68 | **GPS clock-in.** Bobby's brief. | **P1** |
| CLN2-69 | **Photo upload on damage.** Bobby's brief. | **P1** |
| CLN2-70 | **Print roster** (covered by CLN2-53). | **P1** |
| CLN2-71 | **Voice notes** (covered by CLN2-55). | **P1** |
| CLN2-72 | **Broken-equipment escalation flow** (covered by CLN2-31). | **P1** |
| CLN2-73 | **Pre-event cleanliness checklist** (covered by CLN2-30). | **P1** |
| CLN2-74 | **"Kitchen ready for prep" signal.** When all of tomorrow's cleaning lands, write order_events so kitchen flips a chip. | **P1** |
| CLN2-75 | Barcode scan to mark equipment cleaned. | P2 |
| CLN2-76 | Dishwasher cycle countdown bar. | P2 |
| CLN2-77 | "Out of supplies" one-tap. | P2 |
| CLN2-78 | End-of-shift handover summary. | P2 |
| CLN2-79 | Temperature log. | P2 |
| CLN2-80 | "I cannot find this equipment" status (vs auto-damage). | P2 |
| CLN2-81 | PPE compliance check. | P3 |
| CLN2-82 | Emergency / chemical spill SOS. | P3 |

---

## C. Priority fix list

**P0** (data-integrity-critical + Bobby's directive broken):
- **CLN2-19**: Fix EquipmentVerificationPanel filter (renders empty for cleaners)
- **CLN2-26**: completeJob must update equipment.available_quantity + close handover + write order_events
- **CLN2-33**: Admit KITCHEN_STAFF to allowedRoles (Bobby's KIT2-A CTA was bouncing kitchen leads)

**P1**: CLN2-8, 16, 17, 20, 21, 23, 25, 29, 30, 31, 35, 36, 37, 40, 42, 44, 48, 49, 53, 55, 56, 61, 66, 68, 69, 70, 71, 72, 73, 74

**P2 / P3**: see findings tables.

---

## D. First-wave PRs

| PR | Title |
|---|---|
| CLN2-A | completeJob fans out to inventory + handover + events (CLN2-26, P0) |
| CLN2-B | EquipmentVerificationPanel filter + alert→toast + damage-type picker (CLN2-19 P0 + CLN2-23 + CLN2-56) |
| CLN2-C | ProtectedRoute admits KITCHEN_STAFF + cross-role layout pivot (CLN2-33 P0 + CLN2-40) |
| CLN2-D | Nav unify + soft-delete + unify availability hook (CLN2-8 + CLN2-17 + CLN2-16 + CLN2-21) |
| CLN2-E | Realtime sub + visibility-aware poll gating (CLN2-66 + CLN2-32 + CLN2-61) |
| CLN2-F | Pre-event cleanliness checklist + "kitchen ready for prep" signal (CLN2-30 + CLN2-73 + CLN2-74) |
| CLN2-G | Broken equipment escalation flow (CLN2-31 + CLN2-72) |
| CLN2-H | GPS clock-in + photo + voice + 44px + hold-to-complete (CLN2-48 + CLN2-49 + CLN2-68 + CLN2-69 + CLN2-71) |
| CLN2-I | Move BrokenEquipmentDashboard off the cleaner daily page (CLN2-42 + CLN2-37 + CLN2-43) |
| CLN2-J | Print roster (CLN2-53 + CLN2-70) |

---

## E. Cross-page chain-reaction verification list

When the cleaner ticks "complete" on a job, the following surfaces should react without manual refresh. Verify each:

1. `equipment.available_quantity` increments. **Before CLN2-A: NO** (CLN2-26).
2. `/admin/equipment` reflects. **Before CLN2-A: NO.**
3. `equipment_handovers.status` flips. **Before CLN2-A: NO.**
4. Cleaning dashboard overview tile re-counts. **Before CLN2-A: NO** (tile doesn't poll).
5. Kitchen dashboard "Cleaning schedule" CTA badge bumps. **Before: NO** (no badge yet).
6. Dispatch readiness flag flips when all equipment back. **Before: NO** - no aggregator.
7. `order_events` row written. **Before CLN2-A: NO.**
8. Cross-tab signal. **Before CLN2-A: NO** (CLN2-25).
9. Multi-device sync. **Before CLN2-E: 30s poll only.**

When the cleaner verifies a returned handover:

10. `equipment_handovers.received_at` set. **Today: YES** ✓.
11. `equipment_cleaning_status` row written. **Today: YES** ✓ - **but legacy table** still being written to. Reconcile.
12. Damage row written. **Today: YES** ✓ - **but hard-coded `lost`** (CLN2-23).
13. Board "Expected" swimlane drops the row. **Today: 60s poll** (CLN2-32).
14. Driver who handed it in gets "received" notification. **Before CLN2-B: NO** (CLN2-29).

When cleaner clocks in:

15. Self-state flips. **Today: YES** ✓.
16. Kitchen lead's "cleaning team on duty" widget updates. **Today: 30s poll cross-component** (CLN2-27).
17. `order_events` audit trail. **Before: NO** (CLN2-27).

---

**Sign-off:** 75 numbered findings. **P0 = 3 items** (CLN2-19 / CLN2-26 / CLN2-33).
P1 = 26. First-wave PRs = 10. Three structural gaps swallow most of the value:
(a) completeJob doesn't actually update inventory - ledger and truth disagree,
(b) verification panel filter wrong - cleaners see no work,
(c) route guard locks out the very kitchen leads Bobby's KIT2-A was built for.

This PR ships CLN2-D (nav unify) bundled with CLN2-C (KITCHEN_STAFF admit -
the P0 fixing Bobby's broken cross-role CTA). CLN2-A + CLN2-B follow.
