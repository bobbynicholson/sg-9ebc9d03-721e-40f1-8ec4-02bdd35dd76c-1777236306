-- Keep reactions attached to the WhatsApp message they refer to so the inbox
-- can show the emoji on the original bubble instead of a generic event row.
ALTER TABLE public.whatsapp_inbound_messages
  ADD COLUMN IF NOT EXISTS related_message_id text,
  ADD COLUMN IF NOT EXISTS reaction_emoji text;

ALTER TABLE public.whatsapp_external_messages
  ADD COLUMN IF NOT EXISTS related_message_id text,
  ADD COLUMN IF NOT EXISTS reaction_emoji text;
