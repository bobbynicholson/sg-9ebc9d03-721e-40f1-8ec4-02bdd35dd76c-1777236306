# `/admin/equipment` (Equipment) audit (2026-05-19)

**Scope:** 30th page of the admin per-page audit programme. Fifth in Catalogue group.

**File:** `src/pages/admin/equipment.tsx` (1,578 lines).

## Findings

| # | Finding | Severity |
|---|---|---|
| EQP-1 | 8 `as any` casts. No `@ts-nocheck` (file has eslint-disable for explicit-any only, which is not the same as ts-nocheck). | P2 |
| EQP-2 | Service log write doesn't emit `cateringms:equipment-updated`. Order readiness misses the signal. Same gap as VEH-4. | P2 |
| EQP-3 | ProtectedRoute [SUPER_ADMIN, COMPANY_ADMIN, ADMIN]. Missing sales_admin (hire-in capability check) + region_admin. | **P1** |
| EQP-4 | No realtime sub on `equipment` / `equipment_maintenance_log`. | P2 |
| EQP-5 | Availability tab loads once at mount; cross-tab hire-in acceptance doesn't refresh. | P2 |
| EQP-6 | No cron alerts for maintenance auto-schedule; no equipment expiry tracking (cert / inspection). | P3 |

## First-wave PRs
- EQP-A: Role coverage + realtime sub + service event emit (EQP-2 + EQP-3 + EQP-4)
- EQP-B: Type-safety pass (EQP-1)
- EQP-C: Cert / inspection expiry tracking (EQP-6)
