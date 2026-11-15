-- A WhatsApp reaction is attached to an existing message. Keep its event row
-- for the conversation transcript, but do not leave it in the unread count.
UPDATE public.whatsapp_inbound_messages
SET read_at = COALESCE(read_at, received_at)
WHERE message_type = 'reaction'
  AND read_at IS NULL;

-- Rebuild stored conversation counts so reactions received before this change
-- stop appearing as unread messages.
UPDATE public.whatsapp_conversations AS conversation
SET unread_count = (
  SELECT COUNT(*)::integer
  FROM public.whatsapp_inbound_messages AS inbound
  WHERE inbound.company_id = conversation.company_id
    AND regexp_replace(inbound.from_phone, '[^0-9]', '', 'g') = regexp_replace(conversation.phone, '[^0-9]', '', 'g')
    AND inbound.read_at IS NULL
    AND inbound.message_type <> 'reaction'
)
WHERE conversation.unread_count <> (
  SELECT COUNT(*)::integer
  FROM public.whatsapp_inbound_messages AS inbound
  WHERE inbound.company_id = conversation.company_id
    AND regexp_replace(inbound.from_phone, '[^0-9]', '', 'g') = regexp_replace(conversation.phone, '[^0-9]', '', 'g')
    AND inbound.read_at IS NULL
    AND inbound.message_type <> 'reaction'
);
