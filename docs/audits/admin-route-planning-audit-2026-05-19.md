# `/admin/route-planning` (Plan routes) audit (2026-05-19)

**Scope:** 11th page of the admin per-page audit programme. First in
Operations group. Linked from AdminNav as "Plan routes".

**File:** `src/pages/admin/route-planning.tsx` (894 lines).

**Test tenant:** Spit Braai Delivery.

---

## A. What's on the page

1. **Header** - title + KPI strip (unassigned queue, drivers ready,
   batch opportunities, suggested routes).
2. **Filter bar** - status, driver, region.
3. **Unassigned queue** - per row: client, event date+time, venue,
   guests, suggested driver, batch pair (if any).
4. **Suggestion modal** - top-N drivers ranked by score with
   distance, load, on-time rate.
5. **Optimise route** - solves the multi-stop TSP for a chosen
   driver, renders the map polyline, saves on Apply.

---

## B. Findings

### B.1 Architecture / code health

| # | Finding | Severity |
|---|---|---|
| RTE-1 | No ProtectedRoute wrapper on the default export (lines 57, 328-893). Middleware gates `/admin/*` but defense-in-depth missing - same pattern as LO-2 / QTS-8 pre-fix. | **P1** |
| RTE-5 | `useState<any[]>` on line 71 (batchPairs). DeliveryStop + OptimizedRoute types exist in routeOptimizationService but aren't imported. | P2 |

### B.2 Data integrity / one source of truth

| # | Finding | Severity |
|---|---|---|
| RTE-6 | saveOptimizedRoute trusts optimiser output - no reconciliation that stops in route match the DB at apply time. | P3 |

### B.3 Chain reactions

| # | Finding | Severity |
|---|---|---|
| RTE-4 | Batch assignment (handleBatchAssign, line 91) + route apply (applyRoute, line 287) do NOT emit `cateringms:order-updated`. Kitchen prep + live ops + dispatch tracking miss the signal. notificationService sends a driver-targeted push but no system event broadcast. | P2 |

### B.4 Role / visibility mapping

| # | Finding | Severity |
|---|---|---|
| RTE-2 | sales_admin + region_admin missing. sales_admin needs visibility on queue status for client calls; region_admin needs region-narrowed view. | P1 |

### B.5 Missing features

| # | Finding | Severity |
|---|---|---|
| RTE-7 | No tap-to-call on driver phones in suggestion modal / route details. Same pattern as ORD-7 / LDS-8 / CTS-8. | P3 |
| RTE-8 | CSV export (lines 534-572) doesn't include assignment reason, time-to-assign, or driver suggestions - useful for a dispatcher logging their decisions. | P3 |

### B.6 Performance

| # | Finding | Severity |
|---|---|---|
| RTE-3 | `getUnassignedOrders()` returns all unassigned orders for the company - no date window, no pagination. Same pattern as DI-14 / LO-17 / CTS-4 / QTS-14. | P2 |

---

## C. Priority fix list

**P0** (safety): none.

**P1** (UX critical):
- RTE-1: Add ProtectedRoute wrapper
- RTE-2: Admit sales_admin + region_admin

**P2** (data integrity + chain reactions + perf):
- RTE-3: Server-side date window on getUnassignedOrders
- RTE-4: Emit cateringms:order-updated after batch + route apply
- RTE-5: Type batch-pair shape

**P3** (polish):
- RTE-6: Reconciliation at apply
- RTE-7: tel: links
- RTE-8: CSV metadata

---

## D. First-wave PRs

| PR | Title |
|---|---|
| RTE-A | ProtectedRoute wrapper + sales_admin / region_admin (RTE-1 + RTE-2, P1) |
| RTE-B | Server-side date window + emit order-updated after batch/apply (RTE-3 + RTE-4, P2) |
| RTE-C | Type batch-pair + tel: links + CSV metadata (RTE-5 + RTE-7 + RTE-8) |
