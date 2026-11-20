-- Retain provider media references from inbound messages and Business App
-- history so the Replies inbox can securely fetch playable media on demand.
ALTER TABLE public.whatsapp_inbound_messages
  ADD COLUMN IF NOT EXISTS media_id text,
  ADD COLUMN IF NOT EXISTS media_mime_type text,
  ADD COLUMN IF NOT EXISTS media_filename text;

ALTER TABLE public.whatsapp_external_messages
  ADD COLUMN IF NOT EXISTS media_id text,
  ADD COLUMN IF NOT EXISTS media_mime_type text,
  ADD COLUMN IF NOT EXISTS media_filename text;

COMMENT ON COLUMN public.whatsapp_inbound_messages.media_id IS
  'Meta WhatsApp media ID; resolved server-side so access tokens and provider URLs stay private.';
COMMENT ON COLUMN public.whatsapp_external_messages.media_id IS
  'Meta WhatsApp media ID from Business App echoes or synced history; resolved server-side.';
