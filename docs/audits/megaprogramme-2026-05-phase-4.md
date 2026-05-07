# CateringMS megaprogramme Phase 4 closeout

**Date:** 2026-05-07
**Branch:** `phase-4/megaprogramme-2026-05` (off `phase-3/megaprogramme-2026-05`)
**Audit doc:** [docs/audits/megaprogramme-2026-05.md](megaprogramme-2026-05.md)
**Prior closeouts:** [phase 1](megaprogramme-2026-05-phase-1.md) · [phase 2](megaprogramme-2026-05-phase-2.md) · [phase 3](megaprogramme-2026-05-phase-3.md)

## Disposition summary

Phase 4 picked the polish-trickle subset of the Phase 3 deferred
backlog plus the reframed P2-14 perf optimisation. The bigger
character-grouped sweeps (driver fleet, Xero, architecture cleanup,
tenant health dashboard, UI sweep) stay queued for follow-up PRs as
the Phase 3 closeout suggested.

- **7 items shipped** across UX, perf, lifecycle and copy
- **24 items deferred to follow-up PRs** (no change vs the Phase 3
  list minus the 7 shipped here)

## What landed in Phase 4

| ID | Title | Commit |
|---|---|---|
| P2-14 (reframe) | Skip auth fetch inside AuthProvider on public routes (provider always wraps) | `2fbb555` |
| P2-08 | Driver-replacement-accepted notification copy clarifies the swap | `44401f3` |
| P1-22 | Repeat-customer "email me my orders" magic-link request endpoint | `b0d9bda` |
| P1-40 | reconcile-payfast cron with stubbed Query API | `4881723` |
| P2-12 | Memoise `admin/orders.tsx` status grouping for the kanban view | `2421d06` |
| P1-36 | Order-prep priority weighting (event_time within event_date) | `dcaa949` |
| P1-01 | Cascade receipt + retry surface on AmendmentsTab | `6ef4d4c` |

7 items, 7 commits.

## New endpoints + helpers

- `POST /api/client-tokens/request` -- repeat-customer magic-link
  request. Public, rate-limited per (company, email) hash via the
  P2F-2 DB-backed limiter, always 200 for privacy.
- `GET / POST /api/cron/reconcile-payfast` -- daily cron that walks
  PayFast for missed-IPN recovery. Auth via cron_secret OR
  super_admin session.
- `payfastService.fetchRecentPayFastTransactions` -- stub for the
  PayFast Query API integration. The cron's pipeline (auth, dedup,
  replay-via-RPC, audit log) runs through; the stub just returns
  empty until the upstream wire-up lands.
- `<CascadePanel />` inside `AmendmentsTab` -- renders the cascade
  receipt persisted by P0-08 with a retry CTA.

## Operator follow-ups

1. **Schedule the reconcile-payfast cron** on Vercel at 04:00 UTC
   daily (mirrors process-email-queue / currency-check).
2. **Wire the PayFast Query API** in
   `payfastService.fetchRecentPayFastTransactions`. Needs
   real-merchant-tier credentials + a sample of the PayFast
   Transaction History response. The cron's full pipeline already
   works; only the upstream fetch is stubbed.
3. **Surface the magic-link request endpoint** in the UI -- a
   "lost your link?" form on `/c/account` or `/[slug]/login` that
   posts to `/api/client-tokens/request`. Until that lands, the
   endpoint can be hit directly by ops.

## What's still deferred

These are the Phase 3 backlog items minus the 7 shipped here. Each
remains the right scope for a focused follow-up PR rather than
end-of-phase rush work.

### UI consistency sweeps
- P2-04 Touch-target audit team-portal pages (>= 44px)
- P2-09 Empty-state adoption across list pages (primitives shipped
  in Phase 2 P1-26)
- P2-11 Strip unused `lucide-react` imports across 50+ files
- P2-13 Split `admin/{orders, settings}.tsx`,
  `account/settings.tsx`, `admin/platform/company-database.tsx`,
  `admin/inventory-tracking.tsx`
- P2-16 `<MetricCard />` upgrade across team-portal dashboards
- P2-17 a11y sweep across `/team-portal/*`
- P2-18 Public quote/pay tokens displayed expiry chip (partly
  shipped in P1-33)
- P1-29 react-hook-form + zod sweep (L-effort)

### Driver fleet
- P1-07 Driver replacement force-reassign
- P1-08 Driver-availability conflict check
- P1-18 Driver double-booking detection
- P1-34 Driver-portal proof-of-delivery capture
- P1-37 Live driver ETA on client tracking

### Xero / accounting
- P1-20 Xero token refresh + 401 retry
- P1-21 Two-way Xero conflict handling
- P1-24 Cancellation refund pro-rata + Xero credit-note

### Architecture cleanup
- P1-30 Delete `BrandingContext`, write white-label to `companies` table
- P1-31 PortalSidebar collapse 6 nav files into 1
- P2-10 Remove `@ts-nocheck` from money / auth services

### Skylight / platform
- P1-32 Skylight tenant health dashboard
- P2-15 Middleware profile fetch single-cookie cache

### Polish / known-no-fix
- P1-23 GPS history schema split
- P2-01 Quote PDF Safari testing (manual QA only)

## Verification

`npx tsc --noEmit` clean after every commit. `npx next build` end-of-
phase reports `✓ Compiled successfully` and completes the full
prerender pass to a clean build summary. Pre-push hooks ran tsc
on each push (passed).

## What's next

The remaining items split cleanly into the same character groups
the Phase 3 closeout suggested. Each group is a self-contained PR:

1. UI consistency sweep (P2-09, P2-11, P2-16, P2-17, P2-18, P1-29)
2. Driver fleet (P1-07 / P1-08 / P1-18 / P1-34 / P1-37)
3. Xero / accounting (P1-20 / P1-21 / P1-24)
4. Architecture cleanup (P1-30 / P1-31 / P2-13 / P2-10)
5. Skylight tenant health (P1-32 / P2-15)
6. Polish trickle (P1-23 / P2-01 / P2-04)

The audit doc + the four prior closeouts together form the
canonical context any of those PRs can lift from.
