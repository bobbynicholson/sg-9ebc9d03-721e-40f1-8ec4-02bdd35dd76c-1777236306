# `/admin/driver-settlement` audit (2026-05-19)

**Scope:** 24th page of the admin per-page audit programme. Ninth
in Money group.

**File:** `src/pages/admin/driver-settlement.tsx`.

---

## A. What's on the page

Per-driver settlement summary: hourly + distance + callout totals
over the selected period. CSV export. Per-row shift edit modal.

---

## B. Findings

| # | Finding | Severity |
|---|---|---|
| DSE-1 | ProtectedRoute gates to [SUPER_ADMIN, COMPANY_ADMIN] only - mirrors WAG-1 (director tier). Code comment claims parity with wages was intentional; settlement is a pre-payout summary so the tight gate matches the finance-visibility rule. ✓ No fix needed unless ops/admin asks. | none |
| DSE-2 | `useAuth() as any` + scattered `as any` on data shapes (lines 100, 135, 157, 728). Light. | P2 |
| DSE-3 | No supabase realtime sub on `driver_shifts`. Shift edit/delete fires onShiftChanged callback (partial mitigation) but no true realtime. | P2 |
| DSE-4 | Shift mutations don't emit cross-page signal. Wages / earnings-portal pages miss the update unless they have their own realtime sub. | P2 |
| DSE-5 | CSV export = driver totals only. No per-shift detail rows, no batch PDF payslip. Accountant drills into wages page for slips. | P3 |
| DSE-6 | Shift edit dialog hard-codes multiplier options (1x / 1.5x / 2x). Should live in driverPayService. | P3 |

---

## C. First-wave PRs

| PR | Title |
|---|---|
| DSE-A | Realtime sub on driver_shifts + cross-page event emit (DSE-3 + DSE-4) |
| DSE-B | Type-safety pass + multiplier rules to service (DSE-2 + DSE-6) |
| DSE-C | CSV + batch payslip enhancements (DSE-5) |
