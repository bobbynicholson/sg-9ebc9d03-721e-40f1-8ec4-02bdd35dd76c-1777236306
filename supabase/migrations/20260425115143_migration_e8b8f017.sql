DO $$
BEGIN
  ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_slug text UNIQUE;
EXCEPTION WHEN others THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';