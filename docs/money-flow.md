# Money Flow - CateringMS

**Audit date:** 2026-05-21
**Auditor:** Phase 2 money flow bulletproofing (Wave 80)
**Scope:** Quote -> confirm -> deposit -> balance -> refund -> cancellation. Every state machine that touches money. Every path that writes `orders.status`, `orders.payment_status`, `invoices.status`, `quotes.status`, or `payments.payment_status`.

This is the canonical reference for money mutations. The companion to `docs/security-posture.md`. If you find a bug touching invoices, payments, or refunds, this is where to verify the intended behaviour before you fix it.

---

## 1. State machines

### 1.1 orders.status (enum `order_status`)

Values: `pending | confirmed | preparing | ready | in_transit | delivered | completed | cancelled | paused`.

**Forward transitions** - `src/services/order/orderWorkflow.ts`, `ALLOWED_ORDER_TRANSITIONS`:

```
draft     -> pending | confirmed | cancelled
pending   -> confirmed | cancelled
confirmed -> preparing | cancelled | in_transit | ready
preparing -> ready | cancelled | in_transit
ready     -> in_transit | cancelled
in_transit -> delivered | cancelled
delivered -> completed | cancelled
completed -> (terminal)
cancelled -> (terminal)
```

**Side-channel transitions** - explicit allowlists in the same file:

- `ALLOWED_CANCEL_FROM` = `{draft, pending, confirmed, preparing, ready, in_transit, paused}`. `cancelOrder()` only.
- `ALLOWED_PAUSE_FROM` = `{draft, pending, confirmed, preparing, ready}`. `pauseOrder()` only.
- `ALLOWED_RESUME_FROM` = `{paused}`. `resumeOrder()` only.

**Temporal guard**: `in_transit` is rejected when the event start is more than 24 hours away (PR #203, applied by the trigger gate from PR #205 and the orderWorkflow runtime check).

**Stamps**: every forward move writes the matching `*_at` timestamp the first time it lands on that status (`confirmed_at`, `ready_at`, `picked_up_at`, `delivered_at`, `completed_at`). Idempotent - never clobbered on re-entry.

**Canonical writer**: `updateOrderStatus()` in `orderWorkflow.ts`. Side-channels: `cancelOrder`, `pauseOrder`, `resumeOrder` (same file). Anything else mutating `orders.status` is a bug per the Phase 2 audit (see section 3).

### 1.2 orders.payment_status (enum `payment_status`, restricted vocabulary)

Postgres enum members: `pending, processing, completed, failed, refunded, partially_refunded, disputed, partial, paid`.

The enum is shared with `payments.payment_status` but the legal values **for an order** are a subset:

| Used on `orders.payment_status` | Used on `payments.payment_status` |
|---|---|
| pending, partial, paid, refunded, partially_refunded, failed, disputed | pending, processing, completed, failed, refunded, partially_refunded, disputed |

Notably `processing` is meaningful only for an in-flight gateway call on a single `payments` row - it's never a coherent state for the order as a whole.

**Forward transitions** - `src/services/order/orderPaymentStatus.ts`, `ALLOWED_PAYMENT_STATUS_TRANSITIONS`:

```
pending            -> partial | paid | failed | refunded
partial            -> paid | partial | refunded | partially_refunded | failed | disputed | pending
paid               -> refunded | partially_refunded | disputed
failed             -> pending | partial | paid | refunded
refunded           -> (terminal)
partially_refunded -> refunded
disputed           -> paid | refunded
```

**Canonical writer**: `setOrderPaymentStatus()` in `orderPaymentStatus.ts`. Everything else MUST route through it. The legacy `updateOrderPaymentStatus()` in `orderFinancials.ts` is now a thin wrapper that derives the destination from the payments ledger via `deriveOrderPaymentStatus()` and calls the canonical writer.

### 1.3 invoices.status (enum `invoice_status`)

Values: `draft | sent | paid | partially_paid | overdue | written_off | voided`.

No central writer (yet - DEFER, see section 6). Writes happen in:
- `invoiceGenerationService.ts` (create as `draft`, flip to `sent` on send)
- `paymentProcessingService.ts` / triggers (`recalc_invoice_on_payment_change`) flip to `partially_paid` / `paid` based on `balance_due`
- `pages/admin/invoices.tsx` (admin "send" button)
- `cron/update-overdue-invoices.ts` (flips `sent` -> `overdue` past due-date)

### 1.4 quotes.status (enum `quote_status`)

Values: `draft | sent | accepted | rejected | expired`.

Writes happen in:
- `quoteService.ts` (create as `draft`, flip to `sent` via QuoteSendDialog, `accepted` via accept handler)
- `cron/expire-stale-quotes.ts` (nightly sweep past `valid_until`)
- `markQuoteAsLost.ts` (admin "mark lost" -> `rejected`)
- `convert_quote_to_order` RPC (flips to `accepted` + stamps `converted_to_order_id`)

### 1.5 payments.payment_status

Per-row state for an individual payment attempt. Drift here is bounded - each row is a single gateway interaction. The audit found no bypass class worth a central writer.

---

## 2. End-to-end money flow

```
        Lead
         |
         v
       Quote (status: draft -> sent -> accepted)
         |
         | client accepts via /q/[token]
         v
       Order (status: confirmed)
         |
         |--+-- deposit invoice (auto-created on confirm OR manually)
         |  |
         |  | client pays via gateway / EFT
         |  |  -> payments row (payment_status: completed)
         |  |  -> recalc_invoice_on_payment_change trigger
         |  |  -> invoices.balance_due reduced, status -> partially_paid|paid
         |  |  -> orderFinancials.updateOrderPaymentStatus
         |  |  -> setOrderPaymentStatus(order, partial|paid)
         |
         v
       Order (status: preparing -> ready -> in_transit -> delivered)
         |
         | auto-invoice on completion (trg_auto_invoice_on_order_completion)
         v
       Invoice (status: sent -> partially_paid -> paid)
         |
         | (terminal happy path)
         v
       Order (status: completed)
```

**Cancellation/refund branch** (any time before `delivered`):

```
       Order (any non-terminal status)
         |
         | client clicks "Cancel" in /q/[token] OR admin
         v
       computeCancellationTerms (pure fn, no DB)
         |
         |-- inside owner-override window? -> queue as cancellation_request, await admin
         |
         |-- outside override window? -> runAutoCancel:
              - cancelOrder(order) -> status: cancelled, releaseResources cascade
              - insert cancellation_requests row (audit + audit payout choice)
              - payout branch:
                  - credit: insert payments(payment_type=credit_issue),
                            setOrderPaymentStatus(order, refunded)
                  - refund: insert payments(payment_type=refund, status=pending),
                            setOrderPaymentStatus(order, refunded|partially_refunded),
                            refundService.processRefund -> gateway call
              - sendCancellationEmail (variant by payout choice)
              - fireRichCancellationNotification -> admins
```

---

## 3. Phase 2 audit findings

### 3.1 FIXED - "unpaid" written to enum-constrained column

`updateOrderPaymentStatus()` in `orderFinancials.ts` wrote the literal `"unpaid"` (not a member of `payment_status` enum). PostgreSQL would reject the cast and the order's `payment_status` would stay stuck at its previous value, silently. Default value on the column is `pending`, so this corresponds to "money expected but none received" - the canonical mapping is now `pending`. See `deriveOrderPaymentStatus()` in `orderPaymentStatus.ts`.

### 3.2 FIXED - runAutoCancel wrote payment_status with no guard

`src/services/cancellation/runAutoCancel.ts` line 163 wrote `payment_status: "refunded"` for credit payouts, and lines 207-211 wrote `"refunded" | "partially_refunded"` for refund payouts, both via direct `.from("orders").update(...)`. No transition allowlist meant an unpaid order could get marked refunded if the wizard ever reached this branch in an unexpected state. Both call sites now route through `setOrderPaymentStatus()`. If the allowlist blocks the flip, a warn-level log lands and the cascade continues - the credit/refund payment row is still real and the books stay consistent.

### 3.3 FIXED - missing transition guard on payment_status writes

There was no central writer for `orders.payment_status` at all. Three call sites (the two above + the legacy `updateOrderPaymentStatus`) wrote the column with bare updates. New file `src/services/order/orderPaymentStatus.ts` exports `setOrderPaymentStatus(orderId, newStatus, opts)` with:

- canonical-enum validation (rejects values like `unpaid` or `processing` that aren't legal for an order)
- transition allowlist (see section 1.2)
- idempotency (re-writing the current status is a no-op)
- audit row written to `audit_logs` on every successful flip

Backed by 18 unit tests (`src/__tests__/services/orderPaymentStatus.test.ts`).

### 3.4 ACCEPT - cancellation engine has deep test coverage already

`computeCancellationTerms.test.ts` has 30 tests across 7 categories: tier matching, legacy fallback, override window, postponement, amount-paid base selection, committed-cost notes, blocked paths, credit bonus, freed-slot note, reasoning trail. Branch coverage is high. No new tests needed in this phase.

### 3.5 PARTIALLY DONE - central writer for invoices.status

Post-audit follow-up added `src/services/order/invoiceStatus.ts` exporting `setInvoiceStatus(invoiceId, newStatus, opts)`. Same pattern as `setOrderPaymentStatus`: enum validation, transition allowlist (draft -> sent | voided, etc.), idempotency, audit row on every flip.

Allowed transitions:

```
draft           -> sent | voided
sent            -> partially_paid | paid | overdue | voided | written_off
partially_paid  -> paid | partially_paid | sent | overdue | voided | written_off
paid            -> partially_paid | voided | written_off
overdue         -> partially_paid | paid | voided | written_off
written_off     -> (terminal)
voided          -> (terminal)
```

Wired as proof-of-concept on `admin/invoices.tsx` send button (the "Mark as sent" flip). Existing callers that mutate `invoices.status` directly are documented but not yet migrated - same incremental rollout as the Phase 2 work.

Call sites to migrate (deferred follow-up): payment-confirmation webhook, recurring-invoices cron, balance-reminder cron, invoiceGenerationService, mark-paid/bulk-mark-paid endpoints, write-off flows, xero/sage/quickbooks sync.

### 3.6 DEFER - dual-purpose payment_status enum

The `payment_status` enum has 9 members but only 7 are legal on `orders.payment_status` and a different 7 on `payments.payment_status`. The audit chose to enforce this at the application layer via `CANONICAL_ORDER_PAYMENT_STATUSES`. A cleaner long-term fix is to split into two enums (`order_payment_status` + `payment_attempt_status`), but that touches dozens of files and is out of scope for Phase 2.

---

## 4. Invariants the audit asserts

These should always hold. If you find one violated, you've found a bug.

1. **No bare write to `orders.payment_status` outside `src/services/order/orderPaymentStatus.ts`.** Grep for `\.update\(\s*\{[^}]*payment_status` and verify every hit is in that file.
2. **No bare write to `orders.status` outside `orderWorkflow.ts`** (other than the three explicit side-channel functions and the smoke-test harness). The Phase 2 audit didn't find any.
3. **`payments(payment_type='completed').amount` summed for an order should never drift more than R0.01 from `orders.amount_paid`.** Triggers `recalc_invoice_on_payment_change` keep this true; if you see drift, the trigger fired without committing.
4. **A `cancellation_requests` row with `status='completed'` must have either `_refund_amount > 0` OR `_credit_amount > 0` in `policy_snapshot`.** Otherwise the cancel ran but nothing was paid back / credited.
5. **`orders.payment_status='refunded'` implies at least one `payments(payment_type IN ('refund','credit_issue'))` row exists for the order.** Enforced after Phase 2 by routing through `setOrderPaymentStatus`.

---

## 5. Open follow-ups (deferred)

- **DEFER**: Central writer for `invoices.status` + transition allowlist (mirror of `setOrderPaymentStatus`).
- **DEFER**: Split `payment_status` enum into `order_payment_status` + `payment_attempt_status`.
- **DEFER**: Reconciliation cron that flags any order whose `amount_paid` doesn't equal `SUM(payments WHERE payment_status='completed')`. Read-only at first, fix-suggestions added once we trust the signal.
