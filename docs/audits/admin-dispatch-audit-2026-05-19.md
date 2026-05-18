# `/admin/order-assignments` (Dispatch) audit (2026-05-19)

**Scope:** Second page of the admin per-page audit programme.
Linked from AdminNav as "Dispatch" (Today group); routes to
`/admin/order-assignments`. Daily-driver for the dispatch lead.

**File:** `src/pages/admin/order-assignments.tsx` (1,370 lines).

**Test tenant:** Spit Braai Delivery.

---

## A. What's on the page

1. **Header** - title, KPI strip (unassigned-at-risk, total
   unassigned, median time-to-assign, on-shift drivers).
2. **Filter bar** - status filter (All / No driver / Assigned /
   At risk SLA), search, refresh.
3. **Order table** - confirmed orders. Per row: client, event
   date+time, pickup_time, venue, total, requirements (2-driver,
   refrigerated, waiter), assigned driver + chef + vehicle.
4. **Per-row actions** - Assign driver (suggestion dialog),
   Assign vehicle (VehiclePickerDialog), inline pickup_time
   editor in expanded drawer.
5. **Bulk actions** - select rows, assign one driver to many.
6. **Assignment audit log per order** in the expanded drawer.

---

## B. Findings

### B.1 Architecture / code health

| # | Finding | Severity |
|---|---|---|
| DI-1 | `@ts-nocheck` on line 2 - disables type-checking on the 1,370-line file. Same pattern as /admin/dashboard pre-AD-1. | **P0** |
| DI-2 | Page name vs route mismatch. AdminNav labels it "Dispatch" but the route is `/admin/order-assignments`. Confusing for the URL bar + bookmarks. The Dashboard audit's table noted this; here is the right place to fix. | **P1** |
| DI-3 | 1,370-line page with many inline subcomponents (Vehicle picker is already extracted to a sibling file - good - but the assignment dialog, the audit-log render, and the inline pickup editor are all inline). | **P3** |

### B.2 Data integrity / one source of truth

| # | Finding | Severity |
|---|---|---|
| DI-4 | KPI strip computed by `dispatchService.getDispatchKpis` - good, single computation source. | none |
| DI-5 | `assignment_score` rendered per row but not explained. Operator can see the number but doesn't know what good/bad looks like. | P2 |
| DI-6 | Order rows filter to "confirmed" only by default - the operator can't see pending orders that are about to be dispatchable. | P2 |

### B.3 Chain reactions

| # | Finding | Severity |
|---|---|---|
| DI-7 | Assign driver → writes `driver_assignments` row + flips `orders.assigned_driver_id` + emits `cateringms:order-updated` event. ✓ Verified upstream. | none |
| DI-8 | Cancel order from /admin/orders → cancellation cascade releases the driver_assignments row → the dispatch row should refresh. Realtime sub? Need to verify. | P2 |
| DI-9 | Pickup time inline-edit writes to orders.pickup_time → kitchen prep tasks backplan from this → no cross-page notification. The kitchen lead won't know until next prep-list refresh. | P2 |

### B.4 Role / visibility mapping

| # | Finding | Severity |
|---|---|---|
| DI-10 | Page gated to SUPER_ADMIN / COMPANY_ADMIN / ADMIN. Sales_admin role excluded (correctly per the enum comment that sales_admin is read-only on dispatch). region_admin: should likely see only their own region's orders - need to verify regionFilter is wired. | P2 |

### B.5 Missing features

| # | Finding | Severity |
|---|---|---|
| DI-11 | No print / export for the day's dispatch sheet. Dispatcher with a coffee at 6am wants a paper run sheet. Same pattern as AD-2 (shopping list). | **P1** |
| DI-12 | No "Drivers on shift right now" panel inline with the dispatch board. The header KPI says "on-shift drivers: 3" but tapping it doesn't show who they are. | P2 |
| DI-13 | Bulk-assign is one-driver-many-orders. No "many-drivers-one-route" bulk that auto-distributes by region. | P3 |

### B.6 Performance

| # | Finding | Severity |
|---|---|---|
| DI-14 | Loads all confirmed orders for the company at once. No pagination or date-window filter on the query itself (filter is client-side). Scales poorly on a tenant with hundreds of confirmed orders. | P2 |

---

## C. Priority fix list

**P0** (broken / safety):
- DI-1: Remove `@ts-nocheck`

**P1** (UX critical):
- DI-2: Rename route (or at least add an alias) to /admin/dispatch
- DI-11: Print-friendly dispatch sheet for the day

**P2** (data integrity + chain reactions):
- DI-5: Tooltip on assignment_score explaining the scale
- DI-9: Emit a cateringms:order-updated event after pickup-time edit so kitchen prep listens
- DI-10: Region filter check
- DI-14: Server-side date-window on the orders query

**P3** (polish):
- DI-3: Extract inline dialogs
- DI-12: Drivers-on-shift inline panel
- DI-13: Smart bulk assignment

---

## D. First-wave PRs

| PR | Title |
|---|---|
| DI-A | Remove `@ts-nocheck` (P0) |
| DI-B | Print-friendly day's dispatch sheet (P1) |
| DI-C | Route alias /admin/dispatch → order-assignments (P1) |
| DI-D | assignment_score tooltip + event-emit after pickup-time edit (P2 batch) |
| DI-E | Server-side date window on orders query (P2) |

This push ships DI-A (the safety fix). DI-B through DI-E land in
subsequent PRs.
