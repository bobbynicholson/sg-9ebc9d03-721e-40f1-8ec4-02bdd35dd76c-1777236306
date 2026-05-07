# CateringMS megaprogramme Phase 8 (Xero / accounting) closeout

**Date:** 2026-05-07
**Branch:** `phase-8-xero/megaprogramme-2026-05` (off `phase-7-driver/megaprogramme-2026-05`)
**Audit doc:** [docs/audits/megaprogramme-2026-05.md](megaprogramme-2026-05.md)
**Prior closeouts:** phases [1](megaprogramme-2026-05-phase-1.md) · [2](megaprogramme-2026-05-phase-2.md) · [3](megaprogramme-2026-05-phase-3.md) · [4](megaprogramme-2026-05-phase-4.md) · [5 arch](megaprogramme-2026-05-phase-5-arch.md) · [6 ui](megaprogramme-2026-05-phase-6-ui.md) · [7 driver](megaprogramme-2026-05-phase-7-driver.md)

## Disposition summary

Fourth of the six character-grouped follow-up PRs queued in the
Phase 4 closeout. Closes the three Xero integration gaps the audit
flagged.

- **3 items shipped**
- **0 deferred**

## What landed in Phase 8

| ID | Title | Commit |
|---|---|---|
| P1-20 | Force-refresh + retry once on 401 from Xero invoice push | `3c38206` |
| P1-21 | Two-way conflict detection on Xero invoice update | `ffc9493` |
| P1-24 | Credit-note auto-sync on cancellation refund | `e7256eb` |

3 commits, 3 audit items closed.

## P1-20 -- 401 retry on Xero push

The token-freshness check in `ensureFreshAccessToken` only refreshed
when the stored `token_expires_at` was within 60s of now. That misses
two real cases:

- Clock drift between our server and Xero's identity service
- Xero invalidating a token mid-flight (operator manual disconnect /
  reconnect, scope change, refresh-token rotation collision)

Both result in a 401 from Xero on a request we thought was fine.
The fix wraps the Xero invoice POST in a single 401-retry: if the
first call returns 401, force a refresh (`{ force: true }`) and retry
once. If the retry also fails, surface the underlying error as before.

`ensureFreshAccessToken` gained an `opts.force` arg so callers can
bypass the freshness check after a 401 without copy-pasting the
refresh logic.

## P1-21 -- two-way conflict detection

The sync was create-only -- once `invoices.external_id` was set, the
endpoint short-circuited with `alreadySynced: true`. There was no
update path, so when an invoice changed in CateringMS after the
original push, Xero stayed stale forever and an operator manually
re-issuing it would silently clobber any Xero-side edit.

New `mode: "update"` body param:

1. Fetches `GET /Invoices/{external_id}` from Xero
2. Parses Xero's `UpdatedDateUTC` from the `/Date(...)/` shape
3. Compares to our `invoices.last_synced_at`
4. If Xero's timestamp is newer -> 409 Conflict with the timestamps
   so the dashboard can show "Xero has changes since last sync,
   reconcile manually"
5. Otherwise POSTs the invoice payload with `InvoiceID` set, which
   Xero treats as upsert

Existing `create` callers unchanged. Both modes share a new
`xeroFetch` helper that bakes in the same 401-retry pattern from
P1-20.

The `parseXeroDate` helper handles Xero's wire format (`/Date(13...
)/`) with an ISO fallback for the rare case Xero returns one.

## P1-24 -- credit-note on cancellation refund

When an admin cancelled an order with a refund, CateringMS:

- Inserted a `payments` row `payment_type='refund', status='pending'`
- Updated `orders.payment_status` to `refunded` / `partially_refunded`
- Sent the cancellation email

But Xero stayed showing the original invoice as fully owed -- nobody
had issued a credit note. Operators were doing this manually,
inevitably forgetting on busy days.

New endpoint `POST /api/accounting/xero/sync-credit-note`:

1. Reads the refund payment row + the original invoice's external_id
2. Refuses (409) if the original invoice was never synced
3. Refuses (409) if Xero isn't connected
4. Idempotent via `payments.external_id` -- skips if already issued
5. POSTs `CreditNotes` with type `ACCRECCREDIT` -> Xero
6. POSTs `CreditNotes/{id}/Allocations` to apply the credit against
   the original invoice (so Xero's amount-due drops by the refund)
7. Persists the Xero CreditNoteID back onto `payments.external_id`

Wired into `/api/orders/[id]/cancel` as a fire-and-forget call (same
pattern as auto-invoice push) immediately after the refund row gets
inserted. CRON_SECRET shared header for the internal call.

Pro-rata is already handled by the `get_refund_for_order` RPC the
cancel flow snapshots into `cancellation_requests.policy_snapshot`;
the credit-note simply mirrors whatever amount that flow approved.

## What's still deferred

Nothing from this group.

## What's next

One character-grouped PR group left from the Phase 4 closeout:

1. ~~Architecture cleanup~~ done in Phase 5
2. ~~UI consistency sweep~~ done in Phase 6
3. ~~Driver fleet~~ done in Phase 7
4. ~~Xero / accounting~~ done in Phase 8 (this PR)
5. Skylight tenant health (P1-32 / P2-15)
6. Polish trickle (P1-23 / P2-01 / P2-04 -- P2-04 already shipped in Phase 6)

Plus the deferrals: P1-29 (form sweep), the cleaning dashboard
MetricCard upgrade, P2-13 file splits, the P2-10 ts-nocheck
remainder.

## Verification

`npx tsc --noEmit` clean after every commit. `npx next build`
end-of-phase reports compile success and a clean prerender pass.
Pre-push hook ran tsc on each push (passed).
