# `/admin/staff-hours` audit (2026-05-19)

**Scope:** 23rd page of the admin per-page audit programme. Eighth
in Money group.

**File:** `src/pages/admin/staff-hours.tsx`.

---

## A. What's on the page

Period selector + tabs (Sessions / Ledger). Per-row staff hours,
earnings, paid/unpaid status. CSV export.

---

## B. Findings

| # | Finding | Severity |
|---|---|---|
| STH-1 | No supabase realtime subs on `kitchen_shifts` / `payment_ledger`. Colleague processes payment in another tab -> unpaid total stale until manual refresh. Same gap as WAG-2. | P2 |
| STH-2 | Sessions / ledger typed as `any[]`. Grouping + sorting logic relies on duck-typed shape. Light risk - accesses are defensive. | P3 |
| STH-3 | Line 27: `allowedRoles={[SUPER_ADMIN, COMPANY_ADMIN, ADMIN, COMPANY_ADMIN]}` - **duplicate COMPANY_ADMIN** (copy-paste typo). Harmless but signals process drift. Same pattern as CS-1 pre-fix. | **P1** |
| STH-4 | CSV export inlines formatting logic twice (sessions + ledger tabs). Column ordering not validated against backend schema; future migrations could break export silently. | P3 |

---

## C. First-wave PRs

| PR | Title |
|---|---|
| STH-A | Dedupe COMPANY_ADMIN typo + realtime subs (STH-1 + STH-3) |
| STH-B | CSV helper consolidation (STH-4) |
