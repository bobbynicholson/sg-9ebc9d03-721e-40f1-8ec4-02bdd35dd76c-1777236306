-- Branding logos: dedicated public Supabase Storage bucket replacing
-- the base64 data URL stored directly in companies.logo_url.
--
-- Path layout: branding-logos/{company_id}/logo-{timestamp}.{ext}
-- Public bucket so client portals + transactional emails render the
-- logo without signed URLs. Writes are scoped to the user's tenant.

INSERT INTO storage.buckets (id, name, public)
VALUES ('branding-logos', 'branding-logos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DO $$ BEGIN
  DROP POLICY IF EXISTS "branding_logos_public_read"   ON storage.objects;
  DROP POLICY IF EXISTS "branding_logos_company_write" ON storage.objects;
  DROP POLICY IF EXISTS "branding_logos_company_update" ON storage.objects;
  DROP POLICY IF EXISTS "branding_logos_company_delete" ON storage.objects;
END $$;

CREATE POLICY "branding_logos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'branding-logos');

CREATE POLICY "branding_logos_company_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'branding-logos'
    AND (storage.foldername(name))[1]::uuid = get_user_company_id(auth.uid())
  );

CREATE POLICY "branding_logos_company_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'branding-logos'
    AND (storage.foldername(name))[1]::uuid = get_user_company_id(auth.uid())
  )
  WITH CHECK (
    bucket_id = 'branding-logos'
    AND (storage.foldername(name))[1]::uuid = get_user_company_id(auth.uid())
  );

CREATE POLICY "branding_logos_company_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'branding-logos'
    AND (storage.foldername(name))[1]::uuid = get_user_company_id(auth.uid())
  );
