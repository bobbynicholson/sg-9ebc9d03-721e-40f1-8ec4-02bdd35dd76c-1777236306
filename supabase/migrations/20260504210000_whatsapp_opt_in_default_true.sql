-- Reframe whatsapp_opt_in: it's operational comms (driver ETAs, day-of
-- changes, post-event rating), not marketing. Default to true so any
-- client with a mobile gets the messages by default; the only people
-- who don't are those who've actively opted out via the profile page.
ALTER TABLE public.profiles
  ALTER COLUMN whatsapp_opt_in SET DEFAULT TRUE;

-- Backfill every existing profile with a mobile -- they should be
-- opted in by default. Profiles without a mobile stay false because
-- there's nothing to send to.
UPDATE public.profiles
SET whatsapp_opt_in = TRUE
WHERE mobile_number IS NOT NULL
  AND mobile_number <> ''
  AND whatsapp_opt_in IS DISTINCT FROM TRUE;
