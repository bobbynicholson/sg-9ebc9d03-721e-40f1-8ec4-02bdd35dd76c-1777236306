# `/admin/orders` (Orders) audit (2026-05-19)

**Scope:** Eighth page of the admin per-page audit programme. Fourth
in Pipeline group. Linked from AdminNav as "Orders".

**File:** `src/pages/admin/orders.tsx` (1,756 lines). Phase C extract
of OrderDetailsModal already complete in
`src/components/admin/orders/OrderDetailsModal.tsx`.

**Test tenant:** Spit Braai Delivery.

---

## A. What's on the page

1. **Header + KPI strip** - confirmed today / this week / total
   outstanding, total in flight.
2. **Filter bar** - status filter, date range, search, refresh.
3. **Order list / Kanban toggle** - lanes (pending / confirmed /
   preparing / ready / in_transit / delivered).
4. **Per row** - client, event date+time, total, paid balance,
   driver, status, requirements.
5. **OrderDetailsModal** (extracted) - full details, timeline,
   payments, refunds, equipment, items.
6. **Bulk** - status change for many.

---

## B. Findings

### B.1 Architecture / code health

| # | Finding | Severity |
|---|---|---|
| ORD-1 | 79 `as any` / `: any` casts across 1,756 lines. No `@ts-nocheck` (✓) but heavy reliance on unsafe casts (readiness, shifts, staffProfiles, timelineInput all untyped). | P1 |
| ORD-2 | TimelineRow + KanbanColumn still inline. KanbanColumn renders 7x with identical prop passthrough (lines ~1522-1584) - should be a loop / factory. | P2 |

### B.2 Data integrity / one source of truth

| # | Finding | Severity |
|---|---|---|
| ORD-3 | Order total read from `orders.total_amount` (line ~1001). No server-side reconciliation that the column matches `sum(order_items × qty × price)`. Same gap as QTS-4. | P2 |

### B.3 Chain reactions

| # | Finding | Severity |
|---|---|---|
| ORD-4 | Realtime sub on `orders` (lines ~445-482) but NOT on `payments` / `refunds`. Payment captured elsewhere -> operator's row doesn't reflect new balance until manual refresh. | P2 |
| ORD-5 | bulk-status-change and pause dialog don't emit `cateringms:order-updated` (cancel does ✓, line ~1683). Dispatch + kitchen pages miss the cross-page signal. | P2 |

### B.4 Role / visibility mapping

| # | Finding | Severity |
|---|---|---|
| ORD-6 | ProtectedRoute allows [SUPER_ADMIN, COMPANY_ADMIN, ADMIN] only (line ~1752). sales_admin + region_admin excluded - both need order visibility (sales_admin for own confirmations; region_admin for their region). Same omission as QTS-8 / LDS-10 / CTS-5. | **P1** |

### B.5 Missing features

| # | Finding | Severity |
|---|---|---|
| ORD-7 | No tap-to-call on client phones (modal renders plain text). Same pattern as QTS-13 / LDS-8. | P3 |
| ORD-8 | No quick-add-payment shortcut. Operator must open modal -> scroll to Payments tab -> add. A row-level "Take payment" affordance would speed collections. | P3 |

### B.6 Performance

| # | Finding | Severity |
|---|---|---|
| ORD-9 | `orderService.getOrders(companyId)` returns all confirmed-onwards orders. Client-side fuzzy search runs over the full array. Render capped at 200 via TIMELINE_CAP. Same pattern as QTS-14 / CTS-4 / DI-14. | P2 |

---

## C. Priority fix list

**P0** (safety): none.

**P1** (UX critical + role coverage):
- ORD-6: ProtectedRoute admit sales_admin + region_admin
- ORD-1: Type-safety pass - replace `as any` where supabase types do narrow correctly

**P2** (data integrity + chain reactions + perf):
- ORD-2: KanbanColumn loop + TimelineRow extraction
- ORD-3: Server-side total reconciliation
- ORD-4: Realtime sub on payments + refunds
- ORD-5: Emit cateringms:order-updated after bulk + pause
- ORD-9: Server-side pagination + date window

**P3** (polish):
- ORD-7 / ORD-8: tel: links, quick-add-payment

---

## D. First-wave PRs

| PR | Title |
|---|---|
| ORD-A | ProtectedRoute role coverage + realtime sub on payments/refunds + bulk/pause event emit (ORD-4 + ORD-5 + ORD-6 batch) |
| ORD-B | Type-safety pass on shifts / readiness / timeline (ORD-1, P1 - separate, bigger) |
| ORD-C | KanbanColumn loop + TimelineRow extract (ORD-2, P2) |
| ORD-D | Server-side pagination + date window (ORD-9, P2) |
| ORD-E | tel: links + quick-add payment (ORD-7 + ORD-8, P3 batch) |

This push ships ORD-A. ORD-B through ORD-E land in subsequent PRs.
