-- Keep each starter role pack as its own document source. The source rows
-- already contain the role-specific content; this records the supplied PDF
-- asset and changes only the source classification, not the documents.
UPDATE public.ai_brain_sources
SET
  source_type = 'pdf',
  metadata = metadata || jsonb_build_object(
    'original_filename', CASE metadata ->> 'role_pack'
      WHEN 'owner-admin' THEN 'cateringms-owner-admin-guide.pdf'
      WHEN 'kitchen' THEN 'cateringms-kitchen-guide.pdf'
      WHEN 'shopping' THEN 'cateringms-shopping-guide.pdf'
      WHEN 'driver' THEN 'cateringms-driver-guide.pdf'
      WHEN 'cleaning' THEN 'cateringms-cleaning-guide.pdf'
      WHEN 'client' THEN 'cateringms-client-guide.pdf'
      ELSE COALESCE(metadata ->> 'original_filename', 'role-guide.pdf')
    END,
    'pages', COALESCE((metadata ->> 'pages')::integer, 1),
    'sync_mode', 'reembed'
  ),
  updated_at = now()
WHERE source_type = 'text'
  AND metadata ->> 'role_pack' IN ('owner-admin', 'kitchen', 'shopping', 'driver', 'cleaning', 'client');
