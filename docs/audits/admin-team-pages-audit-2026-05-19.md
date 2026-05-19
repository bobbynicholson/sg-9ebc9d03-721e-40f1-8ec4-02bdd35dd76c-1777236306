# `/admin/teams/{kitchen,drivers,cleaning}` audit (2026-05-19)

**Scope:** 36th-38th pages of the admin per-page audit programme.
People group: per-department team views.

**Files:**
- `src/pages/admin/teams/kitchen.tsx`
- `src/pages/admin/teams/drivers.tsx`
- `src/pages/admin/teams/cleaning.tsx`

## Findings

| # | Finding | Severity |
|---|---|---|
| KIT-1 / DRT-1 / CLN-1 | `as any` on useAuth destructure in all three pages. Same type-safety pattern as STA-1. | P2 |
| KIT-2 | No "hours this week" stat on kitchen team page. Drivers team has it. Inconsistent UX. | P3 |
| DRT-2 | startOfWeek helper hardcodes Monday across all three pages. No timezone enforcement on multi-zone tenants. | P2 |
| DRT-3 | driver_assignments inner join on orders trusts tenant isolation via RLS. No explicit company_id check at the query level. Worth hardening. | P2 |
| CLN-2 | Cleaning page counts jobs in ["completed","ready","in_transit"]; kitchen uses NOT IN (cancelled,completed); drivers counts all. No documented alignment - may misreport "available work" per role. | P3 |
| CLN-3 | "View team" tile links to /admin/kitchen-staff?department=cleaning. Relies on kitchen-staff page to honour the query param - worth verifying it filters. | P2 |
| Cross-page | All three ProtectedRoute gates = [SUPER_ADMIN, COMPANY_ADMIN, ADMIN]. ✓ Correct admin trio. | none |

## First-wave PRs
- TEAMS-A: Type-safety pass across all three pages (KIT-1 + DRT-1 + CLN-1)
- TEAMS-B: Harden driver_assignments tenant isolation + align job status filters (DRT-3 + CLN-2)
- TEAMS-C: Verify ?department=cleaning filter on kitchen-staff page (CLN-3)
