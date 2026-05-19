# `/team-portal/cleaning/dashboard` audit (2026-05-19)

**Scope:** 44th and last page of the audit programme. Cleaning staff dashboard.

**File:** `src/pages/team-portal/cleaning/dashboard.tsx` (438 lines).

## Findings

| # | Finding | Severity |
|---|---|---|
| CLN2-1 | No `@ts-nocheck`. Clean TypeScript (post Wave 41 cleanup). ✓ | none |
| CLN2-2 | ProtectedRoute correctly blocks non-cleaning roles. ✓ | none |
| CLN2-3 | Equipment availability + cleaning jobs scoped per company_id. ✓ | none |
| CLN2-4 | MyShiftTodayCard supports clock-in but no GPS location verification. | P2 |
| CLN2-5 | BrokenEquipmentDashboard tracks cost breakdowns but no photo upload for damage reports. | P2 |
| CLN2-6 | No realtime sub on cleaning_jobs or equipment. Tab refresh required. | P2 |
| CLN2-7 | No "Drivers on shift right now" clickable detail panel - same DI-12 gap pattern. | P3 |

## First-wave PRs
- CLN2-A: GPS location check on cleaning staff clock-in (CLN2-4)
- CLN2-B: Photo upload on equipment damage reports (CLN2-5)
- CLN2-C: Realtime sub on cleaning_jobs (CLN2-6)
