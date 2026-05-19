# `/admin/outsource-providers` (Outsource providers) audit (2026-05-19)

**Scope:** 32nd page of the admin per-page audit programme. Seventh in Catalogue group.

**Files:**
- `src/pages/admin/outsource-providers/index.tsx` (list)
- `src/pages/admin/outsource-providers/[id].tsx` (detail)

## Findings

| # | Finding | Severity |
|---|---|---|
| OUT-1 | Has `eslint-disable @typescript-eslint/no-explicit-any` only - NOT `@ts-nocheck`. Original audit conflated the two. Some `as any` casts (light). | P3 |
| OUT-2 | ProtectedRoute [SUPER_ADMIN, COMPANY_ADMIN, ADMIN]. Missing sales_admin (recommend per-event chefs / florists / photographers) + region_admin. | **P1** |
| OUT-3 | Soft-delete pattern uses `outsourceProviderService.softDelete()`. `listForCompany()` should explicitly filter `deleted_at IS NULL` - worth verifying in the service. | P2 |
| OUT-4 | No event emitted when a provider becomes unavailable. Dispatch readiness for affected orders stays stale. | P2 |
| OUT-5 | CronDryRunPanel needs role gating (currently admin-only) + audit log. | P3 |

## First-wave PRs
- OUT-A: Role coverage + provider-updated event emit (OUT-2 + OUT-4)
- OUT-B: Verify soft-delete filter in service (OUT-3)
- OUT-C: Audit log + role gate on CronDryRunPanel (OUT-5)
