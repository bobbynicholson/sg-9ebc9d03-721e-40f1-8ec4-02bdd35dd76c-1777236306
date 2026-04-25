DO $$ 
BEGIN
  -- Add slug column if we used that name previously
  ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_slug text UNIQUE;
  
  -- Update Spit Braai Delivery
  UPDATE companies 
  SET company_slug = 'spit-braai-delivery' 
  WHERE company_name ILIKE '%spit braai%' OR name ILIKE '%spit braai%';
EXCEPTION WHEN others THEN
  NULL;
END $$;