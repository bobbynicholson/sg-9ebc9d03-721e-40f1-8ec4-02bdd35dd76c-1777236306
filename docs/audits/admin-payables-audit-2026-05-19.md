# `/admin/payables` (Supplier payables) audit (2026-05-19)

**Scope:** 20th page of the admin per-page audit programme. Fifth
in Money group. Created during the cashflow cost-mapping work.

**File:** `src/pages/admin/payables.tsx`.

---

## A. What's on the page

3-KPI strip (total pending, total paid this month, overdue count)
+ table of supplier payables with Add / Mark Paid / Delete row
actions.

---

## B. Findings

| # | Finding | Severity |
|---|---|---|
| PAY-1 | ProtectedRoute gates to [SUPER_ADMIN, COMPANY_ADMIN, ADMIN]. ✓ Tight finance scope. | none |
| PAY-2 | No supabase realtime sub on `supplier_payables` / `suppliers`. Cross-tab mark-paid stale until manual refresh. | P2 |
| PAY-3 | `handleMarkPaid` doesn't emit any event. The Cashflow Forecast Card reads `supplier_payables` once at load and never refreshes - mark a payable paid here, the forecast on /admin/financial-dashboard stays stale. | P2 |
| PAY-4 | Three `as any` casts (user / profile / currency). Light. | P3 |

---

## C. First-wave PRs

| PR | Title |
|---|---|
| PAY-A | Realtime sub + cashflow refresh event (PAY-2 + PAY-3, P2) |
| PAY-B | Type-safety pass (PAY-4, P3) |
