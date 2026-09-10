-- Split mobile (WhatsApp-able) from the catch-all phone column on
-- profiles, and add an explicit opt-in flag for WhatsApp updates.
--
-- Why: the profile previously had a single phone field, so caterers
-- couldn't tell whether the number a client gave at quote-request time
-- was a landline or a mobile. WhatsApp is the catering team's go-to
-- channel for day-of comms (driver ETA, last-minute changes,
-- thank-you-and-rate prompts), so we need to know which clients have
-- a mobile and have agreed to be contacted on it.
--
-- mobile_number is the WhatsApp-able number. We don't normalise to
-- E.164 in SQL -- the client UI guides the format. whatsapp_opt_in
-- defaults false; the profile UI flips it on when the client adds a
-- mobile, with a toggle to revoke.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mobile_number TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.mobile_number
  IS 'Mobile number for WhatsApp comms. Distinct from phone_number, which can be a landline.';
COMMENT ON COLUMN public.profiles.whatsapp_opt_in
  IS 'Client agreed to receive WhatsApp updates from the catering team. Default false.';

-- Backfill: if the existing phone_number looks like a SA mobile
-- (starts with 06/07/08 or +27 6/7/8), copy it to mobile_number so
-- the migration doesn't lose data the catering team already has.
-- Doesn't auto-set whatsapp_opt_in -- that's the client's call.
UPDATE public.profiles
SET mobile_number = phone_number
WHERE mobile_number IS NULL
  AND phone_number IS NOT NULL
  AND regexp_replace(phone_number, '[^0-9+]', '', 'g') ~ '^(\+?27|0)?[678][0-9]{8}$';
