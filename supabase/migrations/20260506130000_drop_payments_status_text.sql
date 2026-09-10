-- Phase 4B: drop the legacy payments.status text column.
--
-- Phase 2A migrated every read path from the text column to the
-- canonical payment_status enum (verify-claim, claim-eft, refund flows,
-- order finance summaries, admin dashboard refund-outstanding tile).
-- Phase 4B strips the parallel write from the webhook, recordPayment,
-- refundService, mark-paid, cancel, and cancellation-review, then drops
-- the column in this migration.
--
-- TODO: regenerate src/integrations/supabase/types.ts (next time
-- `supabase gen types` runs) so the Database type no longer carries a
-- `status` field on the payments row. Until then the auto-gen drift is
-- a compile-time annoyance only -- nothing reads or writes the column.

ALTER TABLE public.payments DROP COLUMN IF EXISTS status;
