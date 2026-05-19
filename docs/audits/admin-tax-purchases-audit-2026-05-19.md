# `/admin/tax-purchases` audit (2026-05-19)

**Scope:** 25th page of the admin per-page audit programme. Last
in Money group.

**File:** `src/pages/admin/tax-purchases.tsx` (398 lines).

---

## A. What's on the page

Read-only accountant overview: VAT exposure, deductible breakdown
by category, uncategorised tally, CSV export for SARS submission.
Slip-capture happens on /admin/shopping.

---

## B. Findings

| # | Finding | Severity |
|---|---|---|
| TAX-2 | `@ts-nocheck` on line 3 - disables type-checking. Same pattern as AD-1 / DI-A / CAL-A. | **P0** |
| TAX-1 | ProtectedRoute allows [SUPER_ADMIN, COMPANY_ADMIN, ADMIN]. Audit suggests tightening to director tier (matching wages / driver-settlement). Defer - admin trio is consistent with the rest of Money group; the dashboard's canSeeFinanceForecast is the real gate for sensitive numbers. | P3 |
| TAX-3 | No supabase realtime sub on `purchase_receipts` / `purchase_receipt_items`. Admin snaps a slip on /admin/shopping -> tax-purchases page stale until manual window re-click. | P2 |
| TAX-4 | `buildCsvExport` doesn't include `receipt_id` / `receipt_date` / vendor (worth verifying). Accountant can't trace totals back to slips without those fields. | P2 |
| TAX-5 | "Uncategorised" rows show tally + count but no direct link to /admin/shopping category-edit. | P3 |

---

## C. First-wave PRs

| PR | Title |
|---|---|
| TAX-A | Remove `@ts-nocheck` (TAX-2, P0) |
| TAX-B | Realtime sub + CSV traceability fields (TAX-3 + TAX-4, P2) |
| TAX-C | Uncategorised drill-down link (TAX-5, P3) |
