-- Receipts / restock / order-complete image persistence bucket.
--
-- The receipt scanner (api/imports/receipts/upload.ts), the shopping
-- restock flow (proactiveRestockService) and the Active-shop complete
-- flow (orders.tsx) all upload slip images to storage bucket "imports"
-- at path {company_id}/.../{file}, and read them back via getPublicUrl.
-- But NO migration ever created the bucket - every upload was wrapped in
-- a best-effort try/catch, so on any DB where the bucket was never made
-- manually, every receipt image was silently lost and admins could never
-- view the original slip.
--
-- Create the bucket (public-read, matching the equipment-damage-photos
-- bucket so the existing getPublicUrl call sites keep working; paths carry
-- company_id + a uuid so they aren't enumerable) and company-scoped
-- write/update/delete policies keyed on the first path segment = the
-- caller's company_id.
--
-- Idempotent + safe to run repeatedly.

INSERT INTO storage.buckets (id, name, public)
VALUES ('imports', 'imports', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DO $$ BEGIN
  DROP POLICY IF EXISTS "imports_read"   ON storage.objects;
  DROP POLICY IF EXISTS "imports_write"  ON storage.objects;
  DROP POLICY IF EXISTS "imports_update" ON storage.objects;
  DROP POLICY IF EXISTS "imports_delete" ON storage.objects;
END $$;

CREATE POLICY "imports_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'imports');

CREATE POLICY "imports_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'imports'
    AND (storage.foldername(name))[1]::uuid = get_user_company_id(auth.uid())
  );

CREATE POLICY "imports_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'imports'
    AND (storage.foldername(name))[1]::uuid = get_user_company_id(auth.uid())
  )
  WITH CHECK (
    bucket_id = 'imports'
    AND (storage.foldername(name))[1]::uuid = get_user_company_id(auth.uid())
  );

CREATE POLICY "imports_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'imports'
    AND (storage.foldername(name))[1]::uuid = get_user_company_id(auth.uid())
  );
