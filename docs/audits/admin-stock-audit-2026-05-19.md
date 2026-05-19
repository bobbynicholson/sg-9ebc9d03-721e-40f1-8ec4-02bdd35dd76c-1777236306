# `/admin/stock` (Stock overview) audit (2026-05-19)

**Scope:** 28th page of the admin per-page audit programme. Third in Catalogue group.

**File:** `src/pages/admin/stock.tsx` (516 lines).

## Findings

| # | Finding | Severity |
|---|---|---|
| STK-1 | 5 `as any` casts. No `@ts-nocheck`. | P2 |
| STK-2 | No realtime sub on `inventory_items` / `equipment_bookings` / `equipment_hire_orders`. | P2 |
| STK-3 | ProtectedRoute [SUPER_ADMIN, COMPANY_ADMIN, ADMIN]. Missing sales_admin / region_admin. | **P1** |
| STK-4 | Severity ternary on line 165 has dead-code amber branch. Cosmetic. | P3 |
| STK-5 | `getLowStockItems` returns untyped data; no server-side filter on minimum_stock. | P2 |
| STK-6 | No CSV / print export for the three tiles. | P3 |

## First-wave PRs
- STK-A: Role coverage + realtime sub (STK-2 + STK-3)
- STK-B: Server-side filter on low-stock query (STK-5)
- STK-C: CSV / print (STK-6)
