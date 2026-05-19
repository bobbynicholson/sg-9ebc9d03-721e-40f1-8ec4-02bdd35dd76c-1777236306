# `/admin/shopping` (Shopping) audit (2026-05-19)

**Scope:** 33rd page of the admin per-page audit programme. Eighth and last in Catalogue group.

**File:** `src/pages/admin/shopping.tsx` (~960 lines).

Note: print-friendly shopping list already shipped earlier in this audit programme (AD-2 batch).

## Findings

| # | Finding | Severity |
|---|---|---|
| SHP-1 | `@ts-nocheck` on line 2 - disables type-checking. | **P0** |
| SHP-2 | `markPurchased()` updates `inventory_items.current_stock` directly but doesn't emit any event. Cashflow forecast + COGS dashboards stay stale. No realtime sub on `inventory_items`. | P2 |
| SHP-3 | ProtectedRoute [SUPER_ADMIN, COMPANY_ADMIN, ADMIN]. Should admit `shopping_staff` (write - they own the buy-now flow) + region_admin (read). | **P1** |
| SHP-4 | `order_ingredient_demand` filters by status IN ["confirmed","preparing","ready"] - a status change post-fetch (e.g. cancelled) leaves the buy-now list stale. | P3 |
| SHP-5 | Missing: per-supplier export (shopper at Supplier A only needs their items), budget forecast (sum PO totals vs monthly cap), receipt-to-supplier-invoice auto-link. | P2 |

## First-wave PRs
- SHP-A: Remove `@ts-nocheck` (SHP-1, P0)
- SHP-B: Role coverage admit shopping_staff + region_admin (SHP-3, P1)
- SHP-C: Realtime sub + cashflow refresh event on markPurchased (SHP-2)
- SHP-D: Per-supplier export + budget forecast (SHP-5)
