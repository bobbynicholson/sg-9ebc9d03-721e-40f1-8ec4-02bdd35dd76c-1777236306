# `/admin/inventory` (Inventory) audit (2026-05-19)

**Scope:** 29th page of the admin per-page audit programme. Fourth in Catalogue group.

**File:** `src/pages/admin/inventory.tsx` (2,382 lines).

## Findings

| # | Finding | Severity |
|---|---|---|
| INV2-1 | 18 `as any` casts scattered. `movements` / `batches` typed as `any[]`. No `@ts-nocheck`. | P2 |
| INV2-2 | No realtime sub on `inventory_items` / `inventory_movements`. | P2 |
| INV2-3 | ProtectedRoute [SUPER_ADMIN, COMPANY_ADMIN, ADMIN]. Missing sales_admin / region_admin. | **P1** |
| INV2-4 | Client-side fuzzy on full array. No server-side pagination. | P2 |
| INV2-5 | No bulk-edit-thresholds (min/max/reorder in batch). | P3 |
| INV2-6 | Region scope (`region_id`) cast as string client-side. No server-side enforcement that writes match user's region. | P2 |
| INV2-7 | No outbound alerts when stock drops below minimum. | P3 |

## First-wave PRs
- INV2-A: Role coverage + realtime sub (INV2-2 + INV2-3)
- INV2-B: Server-side pagination + region guard (INV2-4 + INV2-6)
- INV2-C: Bulk-edit thresholds + alerts (INV2-5 + INV2-7)
