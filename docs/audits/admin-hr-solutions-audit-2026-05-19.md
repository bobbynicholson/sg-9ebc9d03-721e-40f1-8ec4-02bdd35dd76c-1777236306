# `/admin/hr-solutions` audit (2026-05-19)

**Scope:** 39th page of the admin per-page audit programme. Sixth (last) in People group.

**File:** `src/pages/admin/hr-solutions.tsx`.

## Findings

| # | Finding | Severity |
|---|---|---|
| HRS-1 | Line 94: duplicate `UserRole.COMPANY_ADMIN` in allowedRoles. Same copy-paste typo as CS-1 / STH-3 / USR-2. | **P1** |
| HRS-2 | Dynamic icon assignment `const Icon = feature.icon` lacks type guard. Safe today (lucide imports are direct) but inconsistent. | P3 |
| HRS-3 | "Coming Soon" features have `link: "#"`. Disabled button + dead anchor is friction-y. | P3 |
| HRS-4 | ChatBot receives `userRole="admin"` (hardcoded string). Should use `user?.role` from auth context. | P2 |
| HRS-5 | Feature links to /admin/staff-hours / calendar / users not validated to exist. (They do.) | P3 |

## First-wave PRs
- HRS-A: Dedupe COMPANY_ADMIN typo (HRS-1)
- HRS-B: ChatBot uses dynamic userRole (HRS-4)
- HRS-C: Disable link wrapping on coming-soon buttons (HRS-3)
