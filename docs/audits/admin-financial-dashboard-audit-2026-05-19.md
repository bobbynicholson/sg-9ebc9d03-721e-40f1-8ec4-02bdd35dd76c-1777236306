# `/admin/financial-dashboard` audit (2026-05-19)

**Scope:** 16th page of the admin per-page audit programme. First
in Money group. Linked from AdminNav as "Financial dashboard".

**File:** `src/pages/admin/financial-dashboard.tsx` (958 lines).

**Test tenant:** Spit Braai Delivery.

---

## A. What's on the page

1. **KPI tiles** - revenue (90d), profit margin, cash on hand, AR
   outstanding.
2. **Cashflow Forecast Card** (gated to operator / director roles
   per finance-visibility rule).
3. **Branches tab** - per-branch P&L for cross-branch tenants.
4. **Expense Tracking tab** - placeholder stub.

---

## B. Findings

### B.1 Architecture / code health

| # | Finding | Severity |
|---|---|---|
| FIN-1 | 7 `as any` casts (user role, supabase nested select, CSV escape closure). No `@ts-nocheck` (✓) but unsafe in places. | P1 |
| FIN-2 | `fetchRealCogs` is a closure inside `loadFinancialData` (lines ~223-265). Should be a module-level / service function so it's testable and decoupled from page state. | P2 |

### B.2 Data integrity / one source of truth

| # | Finding | Severity |
|---|---|---|
| FIN-3 | `calculateProfitMargin` discards orders with any line_item.unit_cost=NULL (correct), but the eligibility logic lives in two places (the fetchRealCogs hasCost filter + the caller's null-check). Single-source it. | P2 |
| FIN-4 | `order_items.unit_cost` snapshot fidelity depends on quote-accept flow. No audit trail if cost_per_unit changes in menu_items after a quote-accept. | P2 |

### B.3 Chain reactions

| # | Finding | Severity |
|---|---|---|
| FIN-5 | No realtime sub on `cash_on_hand` updates. Bookkeeper updates balance in another tab -> forecast stale until manual reload. | P2 |
| FIN-6 | `loadFinancialData` only on user mount. Payment capture during the day doesn't trigger a refresh. | P2 |

### B.4 Role / visibility mapping

| # | Finding | Severity |
|---|---|---|
| FIN-7 | **No ProtectedRoute wrapper on default export.** Role check is deferred to in-render `canSeeFinanceForecast` (lines 81-82) which only gates the Cashflow Forecast Card render, not the page itself. The rest of the page (revenue tiles, profit margin) renders the moment auth context populates. Mirror the LO-2 / QTS-8 / ORD-6 pattern: wrap default export in ProtectedRoute. | **P1** |

### B.5 Missing features

| # | Finding | Severity |
|---|---|---|
| FIN-8 | "X orders missing cost data" alert has no drill-down. Owner can't navigate to those rows to batch-fix unit_cost. | P3 |
| FIN-9 | No period-over-period comparison (YoY / MoM). "Profit Margin (90 days)" tile shows only the current window. | P3 |
| FIN-10 | Expense Tracking tab's "View Detailed Expense Report" button has no onClick - stub. | P3 |

### B.6 Performance

| # | Finding | Severity |
|---|---|---|
| FIN-11 | `getAllOrders(companyId)` + `getPaymentLedger(companyId)` no date window. 5-year-old tenant with 10k orders takes >3s. Branch P&L tab then loops the orders array again. | P2 |

---

## C. Priority fix list

**P0** (safety): none.

**P1** (UX critical):
- FIN-7: ProtectedRoute wrapper
- FIN-1: Type-safety pass

**P2** (data + chain + perf):
- FIN-2 / FIN-3: Extract fetchRealCogs to service + dedupe eligibility logic
- FIN-5 / FIN-6: Realtime sub on cash_on_hand + payments
- FIN-11: Date-window orders query

**P3** (polish):
- FIN-8 / FIN-9 / FIN-10: Drill-downs, YoY, expense report

---

## D. First-wave PRs

| PR | Title |
|---|---|
| FIN-A | ProtectedRoute wrapper (FIN-7, P1) |
| FIN-B | Extract fetchRealCogs to service + dedupe hasCost (FIN-2 + FIN-3) |
| FIN-C | Realtime sub on cash_on_hand + payments (FIN-5 + FIN-6) |
| FIN-D | Date-window orders query (FIN-11) |
| FIN-E | Drill-downs + YoY (FIN-8 + FIN-9 + FIN-10) |
