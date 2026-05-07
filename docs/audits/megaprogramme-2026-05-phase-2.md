# CateringMS megaprogramme Phase 2 closeout

**Date:** 2026-05-07
**Branch:** `phase-2/megaprogramme-2026-05` (off `phase-1/megaprogramme-2026-05`)
**Audit doc:** [docs/audits/megaprogramme-2026-05.md](megaprogramme-2026-05.md)
**Phase 1 closeout:** [docs/audits/megaprogramme-2026-05-phase-1.md](megaprogramme-2026-05-phase-1.md)

## Disposition summary

The Phase 0 audit ledger captured **40 P1 items** plus the closeout
identified **6 Phase-1-derived follow-ups (P2F-1..6)**. After working
through this scope:

- **22 fixed in this phase** (atomic-commit-per-fix where the fix has
  one logical home; the few combined commits group two fixes that share
  a single file's UX area, called out in the per-finding table).
- **24 deferred to Phase 3** (carry forward as the P3 backlog; reasons
  listed per item).

The deferred items are mostly **M-effort or larger** features that
deserve dedicated design passes rather than being squeezed into an
end-of-phase rush. The Phase 0 audit explicitly graded these items
that way, and the programme's "quality beats speed" rule applies: each
of them is real, but pushing them through under time pressure would
ship half-baked work.

## What landed in Phase 2

| ID | Title | Commit | Notes |
|---|---|---|---|
| P1-02 | Atomic lead-status advance on quote create | `4014260` | Single UPDATE...IN(...) replaces the SELECT-then-UPDATE race |
| P1-04 | Preserve `is_verified` across non-credential email-settings saves | `d8c3b4a` | Only resets when provider/from/SMTP creds change |
| P1-25 | Standardise email template var substitution on `{{key}}` via split/join | `37831ab` | Aligns emailService with templateResolver + seeds; regex-metachar safe |
| P1-17 | `convertLeadToQuote` now creates a draft quote pre-populated from the lead | `5869354` | Returns `{lead, quoteId}` so callers can navigate to the new draft |
| P1-13 | Same-status no-op guard in `updateOrderStatus` | `4fa8fa9` | Idempotent against duplicate markDelivered / restamp |
| P1-14 | `orders.inventory_deducted_at` idempotency anchor + service guard | `7a1d332` | Migration + service refactor + recalculate-clears-stamp |
| P1-15 | Render VAT label from actual rate not hardcoded 15% | `5234d37` | UK 20%, ZA 15%, zero-rated all surface correctly |
| P1-10 | `(company_id, lower(trim(email)))` UNIQUE on clients | `3484bac` | Functional unique index; case-insensitive + whitespace-trim; live verified |
| P1-11 | `companies.slug NOT NULL` | `e34d412` | Live verified before locking |
| P1-16 | Cancelled orders excluded from `order_ingredient_demand` view | `1ca33cc` | Both UNION branches updated; security_invoker preserved |
| P1-09 | Pessimistic claim-locking via `claim_email_batch` RPC | `54f5597` | FOR UPDATE SKIP LOCKED; non-overlapping batches |
| P1-19 | Audit-log driver replacement assignment swap | `2a634ab` | Captures previous + new driver in `audit_logs` |
| P1-35 | Surface `pending_reviews` queue failures to `audit_logs` | `116ffb0` | No more silent skips on the 24h review prompt |
| P1-38 | Backfill `payments.invoice_id` for legacy rows | `c07b03b` | Idempotent; multi-invoice orders left for operator |
| P1-28 | Mobile-wrapper offset added to admin pages | `4999386` | inventory-recipes, inventory-tracking, refunds; others verified equivalent |
| P1-33 | Public quote expiry chip near the Accept button | `6999633` | Combined commit with P1-03 (same file, same UX area) |
| P1-03 | Quote-accept retry block + button label flip | `6999633` | Combined with P1-33 |
| P1-26 | Canonical `<EmptyState />` primitive | `5d18858` | Combined commit with P1-27 (same UI primitives PR) |
| P1-27 | `<ListSkeleton />` / `<CardSkeleton />` / `<DetailSkeleton />` | `5d18858` | Combined with P1-26 |
| P1-05 | "Send test email" button on `/admin/email-settings` | `6a01c79` | Combined commit with P1-06 (same page) |
| P1-06 | Shared-fallback sender disclosure banner | `6a01c79` | Combined with P1-05 |
| P1-39 | Public pay page fix-link (mailto: company) on gateway misconfig | `245c026` | Was a dead-end "contact the company"; now actionable |

22 items, 19 commits (three pairs combined per the same-file rule).

## What's deferred to Phase 3

Phase 3 is the "polish" phase per the programme structure but most of
these are M-effort+ feature work. Several should arguably be P2 still
when Phase 3 starts; some might escalate to Phase 4 strategic upgrades.
The categorisation is the operator's call after Phase 1 + 2 land.

| ID | Title | Reason for deferral | Effort |
|---|---|---|---|
| P1-01 | Post-order cascade receipt UI surface | The receipt object exists from postCreationCascade; needs an admin orders detail panel widget. UI work, M-effort. | M |
| P1-07 | Driver replacement force-reassign (vs auction) | Needs a new admin path + permission gate + driver-availability lookup. | M |
| P1-08 | Driver-availability conflict check on reassign | Depends on P1-07 + a lookup against confirmed orders in the same window. | M |
| P1-12 | Order state-machine extension to other TS callers | `updateOrderStatus` is gated (P0-12); cancel / pause paths bypass and should adopt the same `ALLOWED_TRANSITIONS` map. | M |
| P1-18 | Driver double-booking detection on `assignDriver` | Same shape as P1-08; same dependency. | M |
| P1-20 | Xero token refresh + 401 retry | Native Xero one-click is on the running-todo deferred roadmap. Zapier path covers production today. | M |
| P1-21 | Two-way Xero conflict handling | Depends on P1-20 + native sync. | M |
| P1-22 | Repeat-customer "email me my orders" magic-link trigger | Magic-link plumbing exists (P0-18 + client-magic-link); the request endpoint + UI button is M-effort. Plus depends on direct email send for delivery (running-todo deferred). | S |
| P1-23 | GPS history schema split (current vs log) | M-effort schema change with backfill. | M |
| P1-24 | Cancellation refund pro-rata + Xero credit-note | Multi-table; depends on P1-21. | M |
| P1-29 | react-hook-form + zod across forms | L-effort sweep across 5+ heavy form pages (leads/new, quotes/new, company-profile, email-settings, notification-settings). | L |
| P1-30 | Delete `BrandingContext`, write white-label to `companies` | Audit-flagged dual-store; needs careful migration of existing context consumers. | M |
| P1-31 | `<PortalSidebar role accent />` collapse 6 nav files into 1 | Running-todo Phase 2D-3 explicitly calls this out as deferred. | M |
| P1-32 | Skylight tenant health dashboard | M-effort new page at `/admin/platform/tenant-health` with stuck-onboarding / send-failure / inactivity tiles. | M |
| P1-34 | Driver-portal proof-of-delivery (photo / signature) capture | M-effort; needs storage bucket + UI + photo upload pipeline. | M |
| P1-36 | Order-prep priority weighting on kitchen task list | Kitchen prep view is 634 lines; reasonable scope but deserves a focused pass. | S |
| P1-37 | Live driver ETA on client tracking | Depends on a driver-side ping-frequency uplift + ETA computation. | M |
| P1-40 | Webhook polling fallback for missed PayFast IPNs | M-effort: cron sweep that polls PayFast for unrecorded transactions and replays them through the webhook handler. | M |
| P2F-1 | Invoice-branch of payment-confirmation through atomic RPC + recalc triggers | Now possible with P0-09 + P0-10 in place; refactor + test. | M |
| P2F-2 | DB-backed rate limit table for integration endpoints | In-memory limiter ships in P0-17; DB-backed is the proper Phase 3 follow-up. | M |
| P2F-3 | Allergens UI surface (kitchen prep + quote builder badges) | P0-15 added the data column; UI consumers are the next pass. | M |
| P2F-4 | `exchange_rates` schema extension EUR/GBP/AUD | Schema + cron extension. | M |
| P2F-5 | OAuth server-side initiator for Xero + QuickBooks | P0-06 closed the callback hole; the initiator is the matching pair. | M |
| P2F-6 | Amendment cascade retry endpoint | P0-08 persists the cascade outcome; retry endpoint reads it and re-runs incomplete steps. | S-M |

## New primitives + helpers shipped

These are reusable beyond the specific P1 they came in for; future
phases should pick them up:

- `src/components/ui/empty-state.tsx` -- `<EmptyState />` per
  ui-conventions section 4 (P1-26)
- `src/components/ui/loading-skeleton.tsx` -- `<ListSkeleton />`,
  `<CardSkeleton />`, `<DetailSkeleton />` (P1-27)
- `public.record_order_payment(...)` -- atomic order-payment RPC (P0-10)
- `public.recalc_invoice_totals(p_invoice_id)` + two triggers
  (P0-09)
- `public.claim_email_batch(...)` -- pessimistic email-queue claim (P1-09)

## Migrations applied to live

All applied to `vsuyzovzqtrngorpqnhy` via the Supabase MCP
`apply_migration` tool. Files committed under
`supabase/migrations/`:

- `20260507120000_tighten_notifications_insert_policy.sql` (P0-02, prior phase)
- `20260507130000_atomic_record_order_payment.sql` (P0-10, prior phase)
- `20260507140000_invoice_balance_recalc_triggers.sql` (P0-09, prior phase)
- `20260507150000_menu_item_allergen_review_state.sql` (P0-15, prior phase)
- `20260507160000_orders_inventory_deducted_at.sql` (P1-14)
- `20260507170000_clients_company_email_unique.sql` (P1-10)
- `20260507180000_companies_slug_not_null.sql` (P1-11)
- `20260507190000_exclude_cancelled_from_demand_view.sql` (P1-16)
- `20260507200000_claim_email_batch.sql` (P1-09)
- `20260507210000_payments_invoice_id_backfill.sql` (P1-38)

## Verification

`npx tsc --noEmit` clean after every commit. The pre-push hook ran
tsc on each push (passed). At end-of-phase the full
`npx next build` was confirmed green.

## What's next

On operator approval, Phase 3 picks up the deferred 24 items above
plus the original P2 polish backlog from the audit doc. The two
combined "P2 + Phase-2-deferred" backlogs largely overlap on UI
consistency / a11y / type-safety sweeps, so a single Phase 3 PR can
cover both with the new EmptyState / LoadingSkeleton primitives as
the unblocker for the list-page sweeps.
