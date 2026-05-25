-- XSC-A: payment_rejected is emitted by /api/payments/verify-claim when an
-- EFT claim can't be matched, but it was missing from both the DB enum and
-- the JS NOTIFICATION_TYPE_ENUM_VALUES Set. Direct insert path uses the
-- notification_type text column so the row lands, but type (the enum
-- column) stays NULL and group-by reports drop the row from totals.
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'payment_rejected';
