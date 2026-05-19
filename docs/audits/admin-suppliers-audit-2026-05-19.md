# `/admin/suppliers` (Suppliers) audit (2026-05-19)

**Scope:** 31st page of the admin per-page audit programme. Sixth in Catalogue group.

**File:** `src/pages/admin/suppliers/index.tsx` (551 lines).

## Findings

| # | Finding | Severity |
|---|---|---|
| SUP-1 | 2 `as any` casts (profile + payment_method). Light. No `@ts-nocheck`. | P3 |
| SUP-2 | ProtectedRoute [SUPER_ADMIN, COMPANY_ADMIN, ADMIN]. Missing region_admin / sales_admin (sales need supplier contact for client advisories). | **P1** |
| SUP-3 | No realtime sub on `suppliers` / `supplier_products`. | P2 |
| SUP-4 | Supplier changes don't emit `cateringms:supplier-updated`. Downstream payment-due notifications miss the signal. | P2 |
| SUP-5 | No contract attachment, no bulk-contact (email/SMS), no product-tier visibility. | P3 |

## First-wave PRs
- SUP-A: Role coverage + realtime sub + event emit (SUP-2 + SUP-3 + SUP-4)
- SUP-B: Bulk-contact + contract attach (SUP-5)
