# `/admin/teams` (Teams hub) audit (2026-05-19)

**Scope:** 34th page of the admin per-page audit programme. First in People group.

**File:** `src/pages/admin/teams/index.tsx`.

## Findings

| # | Finding | Severity |
|---|---|---|
| TMS-1 | `as any` on profile + staffRows. No `@ts-nocheck`. | P2 |
| TMS-2 | ProtectedRoute [SUPER_ADMIN, COMPANY_ADMIN, ADMIN]. Missing REGION_ADMIN. Teams hub has a region filter built in - region_admin should see their regional metrics. | **P1** |
| TMS-3 | `staffByRole["kitchen_staff"]` etc rely on string keys matching the DB role column. No validation that enum / DB string match. | P2 |
| TMS-4 | Driver hours estimate from `driver_assignments` is conservative - missing complete timestamps under-report. Not a payroll source. | P3 |

## First-wave PRs
- TMS-A: Admit REGION_ADMIN (TMS-2)
- TMS-B: Type-safety pass + enum-to-string validation (TMS-1 + TMS-3)
