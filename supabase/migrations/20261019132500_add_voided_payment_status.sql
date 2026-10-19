-- Keep accounting reversals distinguishable from processor failures.
-- This migration must commit before the reversal function uses the new enum value.
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'voided';
