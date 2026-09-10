-- FIX (2026-06-17): recording a PARTIAL invoice payment errors out.
--
-- Symptom: marking an invoice fully paid works, but recording a partial
-- payment throws "invalid input value for enum payment_status: partial".
--
-- Cause: record_invoice_payment / record_order_payment set the order's
-- payment_status to 'partial' for a part-payment (and 'paid' for full).
-- The original payment_status enum is {pending, processing, completed,
-- failed, refunded, disputed} - it never had 'partial'. The migration
-- that was meant to add it (20260425113343) wrapped the ALTER TYPE in a
-- DO/EXCEPTION block, which on this instance swallowed the failure, so
-- the value never landed. Full payments use 'paid' (added elsewhere) and
-- so succeed; only the partial path hits the missing value.
--
-- ALTER TYPE ... ADD VALUE must NOT be combined with statements that
-- USE the new value in the same transaction. This migration contains
-- ONLY the ADD VALUE statements (idempotent) so it is safe to run as-is.
-- Run it on its own - do not paste it together with code that inserts a
-- 'partial' / 'paid' row in the same batch.

ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'partial';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'paid';
