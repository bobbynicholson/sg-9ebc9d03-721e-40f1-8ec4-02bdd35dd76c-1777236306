-- Deploy the authenticated file endpoint and updated callers together with
-- this migration. Public storage downloads bypass SELECT policies entirely.
BEGIN;
UPDATE storage.buckets SET public = false
WHERE id IN ('imports', 'purchase-receipts', 'equipment-damage-photos', 'pod');

-- Existing imports buckets may accept only CSV/Excel even though receipt
-- scanners persist images there. Preserve existing import formats and allow
-- the receipt formats used by the app when a MIME allowlist is configured.
UPDATE storage.buckets b SET allowed_mime_types = ARRAY(
  SELECT DISTINCT mime FROM unnest(b.allowed_mime_types ||
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']) AS types(mime)
)
WHERE b.id = 'imports' AND b.allowed_mime_types IS NOT NULL;

CREATE OR REPLACE FUNCTION public.company_storage_path_allowed(bucket text, object_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN bucket = 'pod' THEN
      split_part(object_name, '/', 1) = 'orders' AND EXISTS (
        SELECT 1 FROM public.orders o WHERE o.id::text = split_part(object_name, '/', 2)
          AND public.company_boundary_allows(o.company_id)
      )
    ELSE EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid())
        AND p.is_active IS NOT FALSE AND p.deleted_at IS NULL
        AND (p.role::text = 'super_admin' OR
          (p.company_id IS NOT NULL AND split_part(object_name, '/', 1) = p.company_id::text))
    ) END;
$$;
REVOKE ALL ON FUNCTION public.company_storage_path_allowed(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_storage_path_allowed(text, text) TO anon, authenticated, service_role;

-- Restrictive: also constrains any legacy broad INSERT/UPDATE/DELETE policy.
DROP POLICY IF EXISTS company_documents_boundary ON storage.objects;
CREATE POLICY company_documents_boundary ON storage.objects AS RESTRICTIVE
FOR ALL TO anon, authenticated
USING (bucket_id NOT IN ('imports', 'purchase-receipts', 'equipment-damage-photos', 'pod')
  OR public.company_storage_path_allowed(bucket_id, name))
WITH CHECK (bucket_id NOT IN ('imports', 'purchase-receipts', 'equipment-damage-photos', 'pod')
  OR public.company_storage_path_allowed(bucket_id, name));

DROP POLICY IF EXISTS company_documents_read ON storage.objects;
CREATE POLICY company_documents_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('imports', 'purchase-receipts', 'equipment-damage-photos', 'pod')
  AND public.company_storage_path_allowed(bucket_id, name));
COMMIT;
