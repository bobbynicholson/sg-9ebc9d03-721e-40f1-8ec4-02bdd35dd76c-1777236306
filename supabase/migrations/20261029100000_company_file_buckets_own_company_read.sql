-- Company documents in public storage buckets could be LISTED and read by
-- anyone, signed in or not: the read policies were just
-- "bucket_id = '<bucket>'" with no role or company check. Checked live
-- 2026-10-29 with the anon key: imports (imported client lists), pod
-- (proof-of-delivery photos/signatures) and purchase-receipts all listed
-- their folders to an anonymous visitor.
--
-- This replaces only the READ (SELECT) policies of those buckets:
--   imports, purchase-receipts, equipment-damage-photos
--     files live under <company_id>/...  -> readable by that company only
--   pod
--     files live under orders/<order_id>/... -> readable by the order's company
-- Super admins keep access. Upload/update/delete policies are unchanged.
--
-- The buckets stay public, so the download links the app already stored
-- (getPublicUrl for POD photos, receipts, damage photos) keep working;
-- what stops is listing folders and reading files through the API by
-- anyone outside the owning company.

BEGIN;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND cmd = 'SELECT'
      AND coalesce(qual, '') ~ 'bucket_id = ''(imports|pod|purchase-receipts|equipment-damage-photos)'''
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', pol.policyname);
    RAISE NOTICE 'Dropped open read policy % on storage.objects', pol.policyname;
  END LOOP;
END $$;

DROP POLICY IF EXISTS company_files_read_own_company ON storage.objects;
CREATE POLICY company_files_read_own_company
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id IN ('imports', 'purchase-receipts', 'equipment-damage-photos')
    AND (
      (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
      OR public.is_super_admin()
    )
  );

DROP POLICY IF EXISTS pod_read_own_company ON storage.objects;
CREATE POLICY pod_read_own_company
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'pod'
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1
        FROM public.orders o
        WHERE o.id::text = (storage.foldername(name))[2]
          AND o.company_id = public.get_user_company_id(auth.uid())
      )
    )
  );

COMMIT;
