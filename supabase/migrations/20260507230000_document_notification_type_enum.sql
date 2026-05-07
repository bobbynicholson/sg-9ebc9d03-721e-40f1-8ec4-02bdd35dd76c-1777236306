-- P2-05: canonical documentation of the notification_type enum
--
-- The enum has been extended four times in 2026-05 (amendments,
-- review_outcomes, domain_verified, and the original master). Without
-- a single source of truth, future contributors don't know which
-- values exist or what each one means.
--
-- This migration adds COMMENT ON TYPE so the enum's catalogue entry
-- carries the canonical list with one-line semantic description per
-- value. Reading the enum via psql \dT+ now surfaces the doc.
--
-- This is documentation only; no schema change. The order of values
-- in the enum stays as-is to avoid the column-type-recreation risk.

COMMENT ON TYPE public.notification_type IS
$doc$Notification kind enum, canonical listing. Every notifications row
must use one of these. Add new values via ALTER TYPE ... ADD VALUE plus
update this comment. Categories below are documentation-only; the enum
itself is flat.

-- Order lifecycle --
order_confirmed                Order moved to confirmed status.
order_ready                    Kitchen marked the order ready for dispatch.
driver_assigned                A driver was assigned (initial or replaced).
out_for_delivery               Driver started the delivery leg.
delivered                      Driver marked delivered.

-- Money --
payment_received               Deposit / balance payment landed (gateway or manual).
payment_reminder               Balance reminder cadence (14 / 7 / 3 / 1 day).
payment_claimed                Operator claimed an EFT payment manually.

-- Lifecycle hooks --
quote_expiring                 Quote valid_until coming up (24h / 7d).
trial_expiring                 Tenant subscription trial ending soon.
subscription_renewed           Tenant subscription renewed via gateway.

-- Operations alerts --
driver_replacement_needed      Original driver flagged unavailable; broadcast to fleet.
equipment_shortage             Equipment-shortage flag raised on a booked event.
stock_low                      Inventory item dropped below minimum_stock.

-- Amendment workflow --
amendment_requested            Client requested order changes via public link.
amendment_approved             Operator approved the full amendment.
amendment_partial_approved     Operator approved a subset of proposed changes.
amendment_rejected             Operator rejected the amendment.
cancellation_requested         Client requested cancellation via public link.
cancellation_approved          Operator approved cancellation.
cancellation_rejected          Operator rejected cancellation.
postponement_requested         Client requested date postponement.
postponement_approved          Operator approved postponement.
postponement_rejected          Operator rejected postponement.

-- Email + tenant --
domain_verified                Tenant Resend domain DNS verification succeeded.
$doc$;
