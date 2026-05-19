# `/admin/users` (Full team) audit (2026-05-19)

**Scope:** 35th page of the admin per-page audit programme. Second in People group.

**File:** `src/pages/admin/users.tsx`.

## Findings

| # | Finding | Severity |
|---|---|---|
| USR-1 | 5 `as any` casts (fuzzy search, role accessor, CSV export). No `@ts-nocheck`. | P2 |
| USR-2 | Line 692: duplicate `UserRole.COMPANY_ADMIN` in allowedRoles. Same copy-paste typo as CS-1 / STH-3 / HRS-1. | **P1** |
| USR-3 | CSV export joins departments with "; " without escaping internal "; " in values. Safe today (enum values) but risky pattern. | P2 |
| USR-4 | No realtime sub. Second admin edits a user's roles while viewer reads the page -> stale until refresh. | P2 |
| USR-5 | No in-row deactivate / suspend toggle. Badge shows status but no affordance. | P3 |

## First-wave PRs
- USR-A: Dedupe COMPANY_ADMIN typo (USR-2)
- USR-B: Type-safety pass + CSV department escape (USR-1 + USR-3)
- USR-C: Realtime sub on profiles (USR-4)
- USR-D: In-row deactivate toggle (USR-5)
