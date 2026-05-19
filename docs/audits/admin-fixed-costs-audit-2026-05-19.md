# `/admin/fixed-costs` audit (2026-05-19)

**Scope:** 21st page of the admin per-page audit programme. Sixth
in Money group. Created during the cashflow cost-mapping work.

**File:** `src/pages/admin/fixed-costs.tsx`.

---

## A. What's on the page

Active count + monthly-equivalent tile + table of fixed costs
(rent, software, vehicles) with Add dialog + toggle active row
actions.

---

## B. Findings

| # | Finding | Severity |
|---|---|---|
| FXC-1 | ProtectedRoute gates to [SUPER_ADMIN, COMPANY_ADMIN, ADMIN]. ✓ | none |
| FXC-2 | No supabase realtime sub on `fixed_costs`. If the cashflow cron updates next_due_date, page is stale until reload. | P2 |
| FXC-3 | `handleToggleActive` doesn't emit cashflow refresh event. Same gap as PAY-3. | P2 |
| FXC-4 | Three `as any` casts. Light. | P3 |

---

## C. First-wave PRs

| PR | Title |
|---|---|
| FXC-A | Realtime sub + cashflow refresh event (FXC-2 + FXC-3, P2) |
| FXC-B | Type-safety pass (FXC-4, P3) |
