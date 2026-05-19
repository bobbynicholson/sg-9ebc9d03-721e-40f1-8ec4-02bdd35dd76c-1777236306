# `/client-portal/dashboard` audit (2026-05-19)

**Scope:** 40th page of the audit programme. The dashboard a paying
client of the catering tenant sees.

**File:** `src/pages/client-portal/dashboard.tsx` (1,373 lines).

## Findings

| # | Finding | Severity |
|---|---|---|
| CLI-1 | No `@ts-nocheck` (file has `eslint-disable no-explicit-any` only - prior audit conflated them). 10+ `as any` casts. | P2 |
| CLI-2 | Realtime sub on `orders` (company_id filtered ✓). No sub on `payments` - payment_status stays stale across tabs. | P2 |
| CLI-3 | No PDF / receipt download on dashboard. Action tile says "Invoice" but no inline preview. | P3 |
| CLI-4 | Hero card has tap-to-call on driver phone ✓. Past-event tiles missing the company contact tap-to-call. | P3 |
| CLI-5 | Orders query correctly scoped via RLS + user.id / email match. No cross-client leakage. ✓ | none |
| CLI-6 | Dashboard selects only client-safe fields (total_amount, payment_status, status). No admin-only fields like assignment_score. ✓ | none |
| CLI-7 | Realtime channel filter by company_id ✓ (prior unfiltered-leak audit fix verified). | none |
| CLI-8 | Orders query loads all confirmed-onwards orders. No date window / pagination. | P2 |

## First-wave PRs
- CLI-A: Realtime sub on payments + tap-to-call on company contact (CLI-2 + CLI-4)
- CLI-B: Type-safety pass (CLI-1)
- CLI-C: Server-side date window (CLI-8)
- CLI-D: Receipt download (CLI-3)
