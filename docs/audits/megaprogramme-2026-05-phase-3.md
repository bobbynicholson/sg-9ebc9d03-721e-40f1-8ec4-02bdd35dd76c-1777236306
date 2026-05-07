# CateringMS megaprogramme Phase 3 closeout

**Date:** 2026-05-07
**Branch:** `phase-3/megaprogramme-2026-05` (off `phase-2/megaprogramme-2026-05`)
**Audit doc:** [docs/audits/megaprogramme-2026-05.md](megaprogramme-2026-05.md)
**Phase 1 closeout:** [docs/audits/megaprogramme-2026-05-phase-1.md](megaprogramme-2026-05-phase-1.md)
**Phase 2 closeout:** [docs/audits/megaprogramme-2026-05-phase-2.md](megaprogramme-2026-05-phase-2.md)

## Disposition summary

Phase 3 was authored against the combined backlog of:
- 18 original P2 items from the Phase 0 audit
- 24 items deferred from Phase 2 (mix of P1 follow-ups + 6 Phase-1-derived
  P2F items)

That's 42 items in scope. After working through:

- **11 fixed in this phase**
- **31 deferred to Phase 4 strategic / future polish PRs**

The deferred items split into two groups: substantial UI / architecture
sweeps (form-validation refactor, BrandingContext consolidation,
PortalSidebar collapse, Skylight tenant-health dashboard, page
splitting) and feature work that needs its own design pass (driver
fleet, Xero conflict resolution, refund pro-rata, GPS history split,
webhook polling fallback). Each is real but rushing them at the end
of a phase would ship half-baked work.

## What landed in Phase 3

| ID | Title | Commit | Notes |
|---|---|---|---|
| P2-02 | Tighten `sa_tax_deductibility_rules` SELECT to authenticated | `a1a7032` | Removes anon `USING(true)` |
| P2-05 | `notification_type` enum canonical-listing comment | `e616118` | `\dT+` now surfaces categorised values |
| P2-06 | Revert source quote when linked order is hard-deleted | `dee9fe2` | BEFORE DELETE trigger; soft-delete unaffected |
| P2-14 | Skip AuthProvider on public marketing + tokenised routes | `6e4cb40` | Public routes no longer pay the auth-hydration cost |
| P2F-6 | Amendment cascade retry endpoint | `d30f5d2` | Reads `applied_snapshot.cascade`, re-runs failed steps |
| P2F-4 | `exchange_rates` extended to EUR/GBP/AUD + multi-currency refresh | `c77993b` | refreshExchangeRates returns full record |
| P2F-5 | Xero + QuickBooks server-side OAuth initiator endpoints | `e1db025` | Closes the loop with P0-06's callback gate |
| P2F-2 | DB-backed rate limit for integration endpoints | `9fb45a4` | RPC + table; in-memory falls back on RPC error |
| P1-12 | State-machine guard on `cancelOrder` direct status writes | `5991c8d` | Mirrors P0-12 transition map; idempotent same-state |
| P2F-1 | Atomic `record_invoice_payment` RPC for webhook invoice branch | `86e7bc5` | Three sequential writes -> one transaction |
| P2F-3 | `<AllergenReviewBadge />` UI primitive | `3915992` | Surfaces P0-15's allergens_reviewed_at column |

11 items, 11 commits.

## Migrations applied to live

All applied to `vsuyzovzqtrngorpqnhy` via the Supabase MCP
`apply_migration` tool. Files committed under
`supabase/migrations/`:

- `20260507220000_tighten_sa_tax_rules_select.sql` (P2-02)
- `20260507230000_document_notification_type_enum.sql` (P2-05)
- `20260507240000_quotes_clear_converted_link_on_order_delete.sql` (P2-06)
- `20260507250000_exchange_rates_extend_currencies.sql` (P2F-4)
- `20260507260000_api_key_rate_limits.sql` (P2F-2)
- `20260507270000_record_invoice_payment.sql` (P2F-1)

## New primitives + helpers

- `<AllergenReviewBadge />` -- visual indicator for P0-15's
  `allergens_reviewed_at` column. Compact + default sizes.
- `consumeApiKeyRateLimitDb()` async variant alongside the in-memory
  one. Falls back automatically.
- `record_invoice_payment(...)` RPC. Atomic three-step invoice
  payment. Companion to P0-10's `record_order_payment(...)`.
- `revert_quote_on_order_delete()` trigger function on
  `public.orders` BEFORE DELETE.
- Server-side OAuth initiators at `/api/accounting/{xero,quickbooks}/authorize`.
- Per-page `skipAuth` opt-out on the App-level AuthProvider.

## Operator action items

The OAuth initiators (P2F-5) need env vars set on Vercel before the
flow can run end-to-end:

- `XERO_CLIENT_ID` + `XERO_REDIRECT_URI` (e.g.
  `https://cateringms.com/api/accounting/xero/callback`)
- `QUICKBOOKS_CLIENT_ID` + `QUICKBOOKS_REDIRECT_URI`

The DB-backed rate limit (P2F-2) wants a daily prune cron entry on
Vercel to call `prune_api_key_rate_limits()` (mirrors the existing
`prune_embed_rate_limits` schedule).

## What's deferred to Phase 4

The original Phase 0 P2 ledger had 18 items; 4 closed here. The
remaining 14 plus the 19 P1 items still pending from Phase 2 form
the Phase 4 backlog. Grouped by character:

### UI consistency sweeps (need adoption time)
- P2-04 Touch-target audit team-portal pages (>= 44px)
- P2-09 Empty-state adoption across `admin/{leads, quotes, orders,
  clients, calendar, inventory, staff}` and team-portal dashboards
  (primitives shipped in P1-26; this is the rollout)
- P2-11 Strip unused lucide-react imports across 50+ files
- P2-13 Split `admin/{orders, settings}.tsx`, `account/settings.tsx`,
  `admin/platform/company-database.tsx`, `admin/inventory-tracking.tsx`
- P2-16 `<MetricCard />` upgrade across team-portal dashboards
- P2-17 a11y sweep across `/team-portal/*`

### Performance
- P2-12 Memoise `admin/orders.tsx` filter pipeline (1190 LOC, 3 passes
  per render today)
- P2-15 Middleware profile fetch single-cookie cache

### Type / cleanup
- P2-10 Remove `@ts-nocheck` from 14 money/auth services
- P2-18 Public quote/pay tokens displayed expiry chip (partly done in
  P1-33; Phase 4 sweep can extend)

### Phase-1-derived feature work
- P1-01 Post-order cascade receipt UI surface
- P1-07, P1-08, P1-18 Driver fleet (force-reassign, availability,
  double-booking)
- P1-20, P1-21, P1-24 Xero token refresh + conflict + refund pro-rata
- P1-22 Repeat-customer magic-link trigger
- P1-23 GPS history schema split
- P1-29 react-hook-form + zod sweep (L-effort)
- P1-30 BrandingContext consolidation onto `companies` table
- P1-31 PortalSidebar collapse (running-todo Phase 2D-3)
- P1-32 Skylight tenant health dashboard
- P1-34 Driver-portal proof-of-delivery capture
- P1-36 Order-prep priority weighting on kitchen task list
- P1-37 Live driver ETA on client tracking
- P1-40 Webhook polling fallback for missed PayFast IPNs

### Reference / never-going-to-fix-via-code
- P2-01 Quote PDF print path Safari testing (manual QA only)

Each comes with the Phase 0 / Phase 2 audit context already captured.

## Verification

`npx tsc --noEmit` clean after every commit. Pre-push hook ran tsc
on each push (passed). Phase 3 makes no UI changes that affect the
production build differently from Phase 1's foundation; build has
been green throughout.

## What's next

On operator approval, Phase 4 picks up the 31 deferred items. Given
the spread (UI sweeps + features + perf + type cleanup), Phase 4 is
likely best split into multiple PRs by character rather than one
monolithic phase:

1. **UI consistency sweep PR** -- P2-09 / P2-11 / P2-16 / P2-17 /
   P2-18 / P1-29 (the largest)
2. **Driver fleet PR** -- P1-07 / P1-08 / P1-18 / P1-34 / P1-37
3. **Xero / accounting PR** -- P1-20 / P1-21 / P1-24
4. **Architecture cleanup PR** -- P1-30 / P1-31 / P2-13 / P2-10
5. **Tenant health dashboard PR** -- P1-32 / P2-15 / P2-12
6. **Polish + remaining trickle PR** -- P1-01 / P1-22 / P1-23 / P1-36 /
   P1-40 / P2-01 / P2-04 / P2-08

The Phase 0 audit document remains the canonical source of context
for any of these; each PR can lift its requirements straight from
the relevant lines.
