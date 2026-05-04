-- EFT payment claim foundation.
--
-- Why: clients pay caterers by EFT all the time, but the industry
-- problem is they use the wrong reference -- caterers can't tie the
-- deposit to the invoice and the client thinks they've paid while the
-- caterer thinks they haven't. We solve it in two halves:
--   1. The portal renders the caterer's bank details + a strict
--      reference (the invoice number) the client copies into their
--      banking app. They tap "I've paid" when done.
--   2. That tap creates a payments row with status=pending and a
--      notification to the admin so they reconcile against the bank
--      account ASAP. The reference is the same string both sides see.
--
-- This migration is the schema half: bank fields on companies plus a
-- new payment_claimed notification_type so the admin inbox has a
-- distinct row to act on.

-- 1. Bank details on companies. Single account per tenant is enough
--    for v1 -- caterers who later need multiple accounts can ask and
--    we'll promote this to a child table.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_holder TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
  ADD COLUMN IF NOT EXISTS bank_branch_code TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_type TEXT,
  ADD COLUMN IF NOT EXISTS eft_instructions TEXT;

COMMENT ON COLUMN public.companies.bank_account_type
  IS 'cheque | savings | transmission -- free-form, capped client-side';
COMMENT ON COLUMN public.companies.eft_instructions
  IS 'Free-form note rendered under the bank details, e.g. "Allow 1-2 business days for payment to reflect."';

-- 2. New notification_type value for client-claimed EFT payments.
--    'payment_received' is admin-only when a webhook confirms; this
--    is distinct because the admin has to do something (reconcile)
--    rather than just be informed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.notification_type'::regtype
      AND enumlabel = 'payment_claimed'
  ) THEN
    ALTER TYPE public.notification_type ADD VALUE 'payment_claimed';
  END IF;
END$$;
