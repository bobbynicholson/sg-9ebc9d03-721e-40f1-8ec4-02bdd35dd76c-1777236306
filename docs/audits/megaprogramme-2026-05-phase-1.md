# CateringMS megaprogramme Phase 1 closeout

**Date:** 2026-05-07
**Branch:** `phase-1/megaprogramme-2026-05` (off main)
**Audit doc this closes against:** [docs/audits/megaprogramme-2026-05.md](megaprogramme-2026-05.md)
**P0 ledger size:** 19 items
**Disposition:** 17 fixed in code, 1 verified-already-resolved, 1 deferred to operator

Each P0 below maps to either the commit that resolved it or a
verified-resolved / operator-action note. Atomic-commit-per-fix per the
programme rules: every commit references its finding ID in the message.

| P0 ID | Title | Disposition | Commit |
|---|---|---|---|
| P0-01 | Dev-mode email bypass on platform dashboard | **fixed** | `5337ccc` |
| P0-02 | `notifications` INSERT `WITH CHECK (true)` | **fixed** | `7ebc170` |
| P0-03 | `?dev=true` URL backdoor in AuthContext | **fixed** | `36e403c` |
| P0-04 | `/api/admin/create-user` lockdown | **verified-resolved** prior | `4f3bc10` (pre-Phase 1) |
| P0-05 | `/api/test-email` + `/api/send-email` lockdown | **fixed** (test-email; send-email pre-resolved) | `2a0bd7c` |
| P0-06 | OAuth state validation on Xero, QuickBooks callbacks | **fixed** | `892e1fe` |
| P0-07 | Deposit / balance receipt email trigger from webhook | **fixed** | `ac2ff87` |
| P0-08 | Amendment approval regen invoice + kitchen prep | **fixed** | `94d4698` |
| P0-09 | Invoice `balance_due` recalc on payment + amendment | **fixed** | `1d7b22e` |
| P0-10 | PayFast webhook update `orders.payment_status` atomically | **fixed** | `cb1b450` |
| P0-11 | PayFast webhook raw body + signature + IP allowlist | **fixed** | `199fff8` |
| P0-12 | Order state machine reject invalid transitions | **fixed** | `76bc166` |
| P0-13 | FX rates from `exchange_rates` table | **fixed (USD/ZAR)**, EUR/GBP/AUD remains starter constants | `c55589c` |
| P0-14 | Missing comms triggers (lead / order / invoice / staff) | **fixed (template names)**; final-invoice + staff-invite verified pre-existing | `ca8a0cf` |
| P0-15 | Allergen completeness enforcement | **fixed (data layer)**; UI surface deferred to Phase 2 | `819ee0c` |
| P0-16 | Sign-out cookie cleanup + tokenised scope | **fixed (cookie nuke)** | `d3170a6` |
| P0-17 | Per-key rate limit on integration endpoints | **fixed (in-memory)**; DB-backed limiter deferred to Phase 2 | `cf8eb7a` |
| P0-18 | `DEV_RETURN_MAGIC_LINK` production guard | **fixed (code-side gate)**; operator must clear env var | `2991dda` |
| P0-19 | Service-role key rotation | **operator action only** | -- |

## Per-finding details

### P0-01 -- Dev-mode email bypass on platform dashboard

**File:** [src/pages/admin/platform/dashboard.tsx:91-104](../../src/pages/admin/platform/dashboard.tsx)
**Commit:** `5337ccc fix(platform): remove dev-mode email bypass on platform dashboard [P0-01]`

The hardcoded `if (user.email === "dev@cateringms.local") { setLoading(false) }`
short-circuit was stripped. `loadDashboardData()` now runs whenever a user
is present.

### P0-02 -- `notifications` INSERT policy

**File:** [supabase/migrations/20260507120000_tighten_notifications_insert_policy.sql](../../supabase/migrations/20260507120000_tighten_notifications_insert_policy.sql)
**Commit:** `7ebc170 fix(rls): tighten notifications INSERT policy to tenant-or-self [P0-02]`

Replaced `auth.role() = 'authenticated' OR auth.role() = 'service_role'`
with same-tenant-or-self check. Applied live. Verified that all major
direct-insert call sites either use service-role (public quote / embed
endpoints, webhooks, cron) or notify users in the inserter's own tenant
(driver replacement, equipment shortage, delivery service).

### P0-03 -- `?dev=true` URL backdoor

**File:** [src/contexts/AuthContext.tsx:70-117](../../src/contexts/AuthContext.tsx)
**Commit:** `36e403c fix(auth): gate dev super_admin shortcut behind NODE_ENV [P0-03]`

The dev shortcut now requires `process.env.NODE_ENV !== "production"` AND
the prior conditions. Production builds never honour the shortcut
regardless of query string or hostname.

### P0-04 -- `/api/admin/create-user` lockdown

**File:** [src/pages/api/admin/create-user.ts](../../src/pages/api/admin/create-user.ts)
**Status:** verified-resolved before Phase 1 began
**Origin commit:** `4f3bc10 SaaS lifecycle audit: fix trial banner, lock create-user, 30d trial`

The endpoint already runs `createPagesServerClient` for session lookup,
checks the caller's role (line 67-83), enforces tenant scoping (line
113-119), and rejects super_admin creation by non-super-admins. The
running-todo Phase 2A item is stale; the lockdown shipped earlier and
the audit doc was working off the stale task list. No new commit needed.

### P0-05 -- `/api/test-email` + `/api/send-email` lockdown

**Files:** [src/pages/api/test-email.ts](../../src/pages/api/test-email.ts), [src/pages/api/send-email.ts](../../src/pages/api/send-email.ts)
**Commit:** `2a0bd7c fix(api): require auth + tenant scope on /api/test-email [P0-05]`

`/api/send-email` already had the auth gate at lines 48-67 (companyWelcome
exception for the public signup flow). Only `/api/test-email` was open;
this commit ports the same SSR-context session lookup + tenant match
pattern.

### P0-06 -- OAuth state validation

**Files:** [src/pages/api/accounting/xero/callback.ts](../../src/pages/api/accounting/xero/callback.ts), [src/pages/api/accounting/quickbooks/callback.ts](../../src/pages/api/accounting/quickbooks/callback.ts)
**Commit:** `892e1fe fix(oauth): validate state cookie on Xero + QuickBooks callbacks [P0-06]`

Both callbacks now require the `state` query param to match an
HttpOnly `oauth_state` cookie. Single-use: the state cookie + company_id
cookie are cleared on success.

The existing initiator path in `accountingIntegrationService.ts:98` uses
client-side sessionStorage that the server-side callback can't read, so
the OAuth flow now fails closed with a clear "Restart the integration
flow" message until a server-side initiator endpoint lands. Native Xero
one-click is on the deferred roadmap (running-todo); Zapier covers
production use today.

### P0-07 -- Deposit / balance receipt email

**File:** [src/pages/api/webhooks/payment-confirmation.ts](../../src/pages/api/webhooks/payment-confirmation.ts)
**Commit:** `ac2ff87 fix(payments): align webhook receipt-email template names with seeds [P0-07]`

The webhook called `emailService.sendEmail` with template names
`deposit_confirmation` / `balance_confirmation` /
`invoice-payment-received`. None of those rows exist in
`email_templates`; the seed has `deposit_payment_received` and
`balance_payment_received`. Template resolver fell through; the email
never landed in tenant-branded form.

Realigned to seeded names. Audit doc P0-07 phrased this as "never
fires"; the literal sendEmail call has existed for some time but the
name mismatch turned every attempt into a no-op.

### P0-08 -- Amendment approval cascade

**File:** [src/pages/api/orders/amendment-review.ts](../../src/pages/api/orders/amendment-review.ts)
**Commit:** `94d4698 fix(orders): await amendment cascades + persist outcome [P0-08]`

The kitchen-prep, invoice, and inventory cascades were fire-and-forget
IIFEs after applying the amendment. Serverless cold-stops between
approval and cascade resolution lost the cascade silently. The cascades
now await sequentially, the outcome of each step is captured in a
`cascade` object returned in the response, and the cascade outcome is
persisted to `order_amendment_requests.applied_snapshot.cascade` so the
operator (and a future retry endpoint) can see exactly what landed.

A retry endpoint is queued as P1 follow-up.

### P0-09 -- Invoice `balance_due` recalc

**File:** [supabase/migrations/20260507140000_invoice_balance_recalc_triggers.sql](../../supabase/migrations/20260507140000_invoice_balance_recalc_triggers.sql)
**Commit:** `1d7b22e fix(invoices): recalc balance_due / amount_paid / status on payment + amendment [P0-09]`

Added `public.recalc_invoice_totals(p_invoice_id)` helper +
`trg_recalc_invoice_on_payment_change` (fires after INSERT / UPDATE /
DELETE on payments) + `trg_recalc_invoice_on_order_amendment` (fires
on UPDATE of order totals). Together these keep `invoices.amount_paid`,
`balance_due`, and `status` consistent with the payments table and
order totals automatically. Paid / written-off invoices freeze (no
auto-mutation).

### P0-10 -- PayFast webhook atomic order/invoice update

**Files:** [supabase/migrations/20260507130000_atomic_record_order_payment.sql](../../supabase/migrations/20260507130000_atomic_record_order_payment.sql), [src/services/order/orderFinancials.ts](../../src/services/order/orderFinancials.ts)
**Commit:** `cb1b450 fix(payments): atomic order-payment recording via SECURITY DEFINER RPC [P0-10]`

`orderFinancials.recordPayment` previously did a payments INSERT then a
separate `updateOrderPaymentStatus` query. Network blips between them
left payment recorded but `orders.payment_status` stale. The new
SECURITY DEFINER RPC `record_order_payment` does the INSERT and the
status recompute in one transaction, with belt-and-braces idempotency
on `gateway_transaction_id`.

The invoice branch of `payment-confirmation.ts` still does a sequential
update-invoice + insert-payment + update-order. Folded into the
follow-up list because the full atomicity needs P0-09's recalc triggers
already in place (now landed) -- a Phase 2 commit can safely route the
invoice branch through the RPC + triggers without double-work.

### P0-11 -- PayFast webhook hardening

**File:** [src/pages/api/webhooks/payment-confirmation.ts](../../src/pages/api/webhooks/payment-confirmation.ts)
**Commit:** `199fff8 fix(payfast): raw-body signature + IP allowlist [P0-11]`

Three things changed:
1. `bodyParser: false` + raw-body parser; signature validated over the
   ordered URL-encoded fields (PayFast's documented contract).
2. IP allowlist via `PAYFAST_ALLOWED_IPS` env var (comma-separated).
   Empty / unset disables the check (dev convenience). Production must
   populate.
3. Legacy `validatePayFastSignature` helper removed.

Replay protection is covered by the existing `pf_payment_id` dedup.

**Operator action:** populate `PAYFAST_ALLOWED_IPS` on Vercel production
with PayFast's published IPN egress IPs.

### P0-12 -- Order state machine

**File:** [src/services/order/orderWorkflow.ts](../../src/services/order/orderWorkflow.ts)
**Commit:** `76bc166 fix(orders): reject invalid status transitions [P0-12]`

Added `ALLOWED_ORDER_TRANSITIONS` map + a current-status read at the
top of `updateOrderStatus`. Invalid transitions return a structured
error with the allowed alternatives. Cancellation paths through
`cancelOrder()` and amendment-review (which mutates non-status fields)
are unchanged.

### P0-13 -- FX rates

**File:** [src/lib/currencyUtils.ts](../../src/lib/currencyUtils.ts)
**Commit:** `c55589c fix(currency): refresh USD/ZAR rate from exchange_rates [P0-13]`

Added `refreshExchangeRates(serviceClient)` helper that mutates
`CURRENCY_CONFIG.USD.rate` from the latest `exchange_rates` row. The
table only carries `usd_to_zar_rate` today; EUR / GBP / AUD remain
starter constants. Phase 2 will extend the schema + cron to cover all
four pairs.

The live tenant (Spit Braai) is ZAR-only so EUR/GBP/AUD staleness has
no operational impact today. The structural risk for future non-ZAR
tenants is what made this P0.

### P0-14 -- Missing comms triggers

**Files:** [src/services/leadService.ts](../../src/services/leadService.ts), [src/services/quoteService.ts](../../src/services/quoteService.ts), [src/services/order/postCreationCascade.ts](../../src/services/order/postCreationCascade.ts)
**Commit:** `ca8a0cf fix(comms): align lead / quote / order confirmation template names with seeds [P0-14]`

Three triggers used hyphenated template names that don't exist in
`email_templates`:
- `quote-request-confirmation` -> `quote_request_received` (leadService + quoteService)
- `order-confirmation` -> `order_confirmed` (postCreationCascade)

Final-invoice + staff-invite were flagged in the audit but verified
already wired:
- `sendInvoiceEmail` in `invoiceGenerationService` is the canonical
  path; manual send via `InvoiceSendDialog` works. Auto-send on order
  delivery is a workflow design call, not a bug.
- `/api/staff/[id]/invite-login` already uses `sendBrandedEmail` with
  template type `staff_invite_<role>`.

### P0-15 -- Allergen completeness

**File:** [supabase/migrations/20260507150000_menu_item_allergen_review_state.sql](../../supabase/migrations/20260507150000_menu_item_allergen_review_state.sql)
**Commit:** `819ee0c fix(menu): add allergens_reviewed_at to distinguish 'no allergens' from 'unreviewed' [P0-15]`

Added `allergens_reviewed_at TIMESTAMPTZ` and `allergens_reviewed_by
UUID` to `menu_items`. NULL = unreviewed; the kitchen prep view (and
quote builder) should render a "needs review" badge on these items so
blank allergens never read as "allergen-free".

UI surface follow-up (Phase 2): wire the badge into kitchen prep view
+ quote builder + warn the operator on quote acceptance if any
quoted item is unreviewed. The data layer is the P0 lockdown; the UI
surfacing is Phase 2.

### P0-16 -- Sign-out cookie scope

**File:** [src/lib/signOut.ts](../../src/lib/signOut.ts)
**Commit:** `d3170a6 fix(auth): nuke cookies across all paths + domains on sign-out [P0-16]`

The cookie clear loop now iterates the cross product of plausible
domain attributes (apex, full host, .apex) and paths (/, /c, /q, /pay,
/client-portal, /admin) so anything set with a wider scope than `/`
gets a delete-me cookie too.

### P0-17 -- Per-key rate limit

**Files:** [src/lib/apiKeyRateLimit.ts](../../src/lib/apiKeyRateLimit.ts), [src/pages/api/integrations/leads.ts](../../src/pages/api/integrations/leads.ts), [src/pages/api/integrations/quotes.ts](../../src/pages/api/integrations/quotes.ts), [src/pages/api/integrations/invoice-paid.ts](../../src/pages/api/integrations/invoice-paid.ts)
**Commit:** `cf8eb7a fix(integrations): per-key rate limit on Zapier endpoints [P0-17]`

In-memory sliding-window rate limiter keyed by SHA256 of the Bearer
token. 60 req/min/key default. Per-Vercel-function-instance, so the
actual ceiling across instances is roughly `(max * concurrent_instances)`.
A DB-backed limiter is queued as Phase 2 follow-up; in-memory covers
the abuse case (a leaked key getting weaponised).

### P0-18 -- `DEV_RETURN_MAGIC_LINK`

**File:** [src/pages/api/auth/client-magic-link.ts](../../src/pages/api/auth/client-magic-link.ts)
**Commit:** `2991dda fix(auth): hard-guard DEV_RETURN_MAGIC_LINK behind NODE_ENV [P0-18]`

The dev-link branch now requires both `NODE_ENV !== 'production'` AND
the env var truthy. Production builds never return the magic link in
the response body regardless of env-var state.

**Operator action:** clear `DEV_RETURN_MAGIC_LINK` from Vercel
production env. The code-side guard is belt; the env clear is the
braces.

### P0-19 -- Service-role key rotation

**Status:** operator action only
**Background:** the service-role key was pasted into a chat session
during config (per running-todo notes). Rotating it requires Supabase
Dashboard access and an env-var swap on Vercel; can't be code-fixed.

**Operator action:**
1. Supabase Dashboard -> Project Settings -> API -> Roll service_role key.
2. Update `SUPABASE_SERVICE_ROLE_KEY` on Vercel (Production + Preview).
3. Confirm one webhook + one notification creation works after the swap.
4. Confirm via `pages/api/admin/embed/loader-integrity` or similar that
   service-role calls succeed.

## Operator action items left over from Phase 1

Three things only the operator can do, called out so they don't slip:

1. **Rotate `SUPABASE_SERVICE_ROLE_KEY`** -- Supabase Dashboard, then
   Vercel env update. (P0-19)
2. **Clear `DEV_RETURN_MAGIC_LINK`** on Vercel production. The code is
   safe regardless, but cleanliness matters. (P0-18)
3. **Populate `PAYFAST_ALLOWED_IPS`** on Vercel production with
   PayFast's published IPN egress IPs. Without it, the IP gate is
   disabled and only signature + dedup defend the webhook. (P0-11)

## Verification

Every commit was followed by `npx tsc --noEmit` (clean). At end-of-phase
the full `npx next build` was run and the compile reported `✓ Compiled
successfully`. The post-compile static-page generation step fails
locally because `NEXT_PUBLIC_SUPABASE_URL` isn't set on this
environment; that's the same starting state as before Phase 1 began
and is unrelated to the changes here. CI on Vercel handles the full
build with proper env vars.

Pre-push hook ran tsc successfully on the audit branch push and is
expected to do the same on this Phase 1 push.

## Findings deferred to Phase 2 (P1 follow-ups created by Phase 1 work)

These are new items that surfaced during Phase 1 and should land in
Phase 2:

- Invoice-branch of payment-confirmation.ts route through the new
  atomic RPC + recalc triggers (the order branch already does, but the
  invoice branch still does sequential writes).
- DB-backed rate limit table for the integration endpoints (currently
  in-memory).
- UI surface for `allergens_reviewed_at`: kitchen prep "needs review"
  badge + quote builder warning on acceptance.
- `exchange_rates` schema extension to support EUR / GBP / AUD pairs +
  cron update to fetch all four.
- Server-side initiator endpoint for Xero + QuickBooks OAuth that sets
  the HttpOnly state + company_id cookies.
- Retry endpoint for amendment cascades that re-runs incomplete steps
  using the persisted `cascade` object.

## What's next

Phase 1 closes here. On operator approval Phase 2 picks up the P1
ledger from the audit doc (40 items) plus the six Phase-1-derived
follow-ups above.
