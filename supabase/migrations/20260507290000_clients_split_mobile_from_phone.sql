-- Add separate mobile + landline columns on clients (and leads for
-- consistency). Existing `phone` column stays as the canonical
-- "primary phone" so legacy code keeps reading the right thing; the
-- importer will route mobiles to mobile_number and landlines to phone
-- (or a new landline_number column if both appear in the source).
--
-- Backfill: existing phone values that look like SA mobiles (start
-- with +27[678]) get copied to mobile_number so the WhatsApp button
-- starts working on existing data immediately.
--
-- Audit follow-up to the 2026-05 megaprogramme: client import was
-- losing a row's mobile when the spreadsheet had both a Mobile and
-- a Landline column (both auto-mapped to the same `phone` field).
-- Splitting the schema lets the importer keep both.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS mobile_number text,
  ADD COLUMN IF NOT EXISTS landline_number text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS mobile_number text,
  ADD COLUMN IF NOT EXISTS landline_number text;

-- Backfill: if the existing phone is a SA mobile, mirror it onto
-- mobile_number so the WhatsApp button picks it up without any
-- second action. Only does the obvious case -- E.164 SA mobile.
UPDATE public.clients
SET mobile_number = phone
WHERE mobile_number IS NULL
  AND phone IS NOT NULL
  AND phone ~ '^\+?27[678][0-9]{8}$';

-- And the inverse for what's clearly a landline -- copy to
-- landline_number so the contact card can show it labelled.
UPDATE public.clients
SET landline_number = phone
WHERE landline_number IS NULL
  AND phone IS NOT NULL
  AND phone ~ '^\+?27[1-5][0-9]{8}$';

UPDATE public.leads
SET mobile_number = COALESCE(phone, client_phone)
WHERE mobile_number IS NULL
  AND COALESCE(phone, client_phone) IS NOT NULL
  AND COALESCE(phone, client_phone) ~ '^\+?27[678][0-9]{8}$';

UPDATE public.leads
SET landline_number = COALESCE(phone, client_phone)
WHERE landline_number IS NULL
  AND COALESCE(phone, client_phone) IS NOT NULL
  AND COALESCE(phone, client_phone) ~ '^\+?27[1-5][0-9]{8}$';

-- Useful index for the contact-search page which already filters
-- across phone fields.
CREATE INDEX IF NOT EXISTS idx_clients_mobile_number
  ON public.clients (company_id, mobile_number)
  WHERE mobile_number IS NOT NULL;
