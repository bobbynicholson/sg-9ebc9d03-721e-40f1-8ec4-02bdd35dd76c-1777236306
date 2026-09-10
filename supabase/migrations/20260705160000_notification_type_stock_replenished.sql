-- Proactive restock feature: a shopper can top up low par-level stock
-- off their own judgement (no order driving it). When they do, admins
-- get pinged so the spend is visible. That ping needs its own
-- notification_type so it doesn't collide (via dedup) with the passive
-- `stock_low` alert, which fires on the opposite event (stock dropping).
--
-- IMPORTANT: ALTER TYPE ... ADD VALUE cannot run inside a transaction
-- block with other statements that USE the new value, and Postgres
-- requires it be committed before use. This migration ONLY adds the
-- value (plus a doc-comment refresh) so it is safe to run standalone.
-- Apply this migration on its own, before deploying code that emits it.

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'stock_replenished';

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
stock_replenished              Shopper proactively bought stock to top up a low item (no order).

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
