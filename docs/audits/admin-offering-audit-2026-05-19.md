# `/admin/offering` (Offering hub) audit (2026-05-19)

**Scope:** 26th page of the admin per-page audit programme. First in Catalogue group.

**File:** `src/pages/admin/offering.tsx`.

## Findings

| # | Finding | Severity |
|---|---|---|
| OFR-1 | 8 `as any` casts. No `@ts-nocheck`. | P2 |
| OFR-2 | ProtectedRoute [SUPER_ADMIN, COMPANY_ADMIN, ADMIN]. Missing sales_admin (capability snapshot) + region_admin (regional view). Same omission as ORD-6 / VEH-2. | **P1** |
| OFR-3 | Equipment uses `is_available` as soft-delete (vs `deleted_at` on menu_items). Inconsistent strategy across catalogue tables but not a bug. | P3 |
| OFR-4 | No realtime sub on menu_items / equipment. | P2 |
| OFR-5 | No inventory or bundle health view (recipe stockouts, supplier capacity). | P3 |

## First-wave PRs
- OFR-A: Role coverage + realtime sub (OFR-2 + OFR-4)
- OFR-B: Type-safety pass (OFR-1)
