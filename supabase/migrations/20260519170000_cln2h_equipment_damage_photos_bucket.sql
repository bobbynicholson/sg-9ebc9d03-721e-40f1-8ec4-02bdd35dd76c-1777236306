-- CLN2-H (CLN2-69): public storage bucket for equipment damage
-- photos uploaded from the cleaner DamageFlagForm. Path layout:
-- equipment-damage-photos/{company_id}/{order_id}/{timestamp}-{filename}
-- Public-read so the admin BrokenEquipment dashboard / Analytics
-- can render thumbnails inline without minting signed URLs.

INSERT INTO storage.buckets (id, name, public)
VALUES ('equipment-damage-photos', 'equipment-damage-photos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DO $$ BEGIN
  DROP POLICY IF EXISTS "equipment_damage_photos_read"   ON storage.objects;
  DROP POLICY IF EXISTS "equipment_damage_photos_write"  ON storage.objects;
  DROP POLICY IF EXISTS "equipment_damage_photos_update" ON storage.objects;
  DROP POLICY IF EXISTS "equipment_damage_photos_delete" ON storage.objects;
END $$;

CREATE POLICY "equipment_damage_photos_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'equipment-damage-photos');

CREATE POLICY "equipment_damage_photos_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'equipment-damage-photos'
    AND (storage.foldername(name))[1]::uuid = get_user_company_id(auth.uid())
  );

CREATE POLICY "equipment_damage_photos_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'equipment-damage-photos'
    AND (storage.foldername(name))[1]::uuid = get_user_company_id(auth.uid())
  )
  WITH CHECK (
    bucket_id = 'equipment-damage-photos'
    AND (storage.foldername(name))[1]::uuid = get_user_company_id(auth.uid())
  );

CREATE POLICY "equipment_damage_photos_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'equipment-damage-photos'
    AND (storage.foldername(name))[1]::uuid = get_user_company_id(auth.uid())
  );
