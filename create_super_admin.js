const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

// Build Supabase connection string from env variables
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Extract project ref from URL (e.g., https://abcdefghij.supabase.co -> abcdefghij)
const projectRef = SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

if (!projectRef) {
  console.error("Could not extract project ref from SUPABASE_URL");
  process.exit(1);
}

// Supabase uses pooler connection for direct DB access
// Format: postgresql://postgres.{ref}:{password}@aws-0-{region}.pooler.supabase.com:5432/postgres
console.log("⚠️  This script requires SUPABASE_DB_PASSWORD to be set.");
console.log("Please run this SQL in your Supabase SQL Editor instead:\n");

console.log(`
-- Step 1: Create auth user with encrypted password
DO $$
DECLARE
  user_id UUID;
BEGIN
  -- Enable pgcrypto if not already enabled
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  
  -- Insert or update auth user
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_sent_at
  )
  VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'bobby@skylight-digital.co.za',
    crypt('11223344', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"super_admin","full_name":"Bobby (Super Admin)"}'::jsonb,
    now(),
    now(),
    now()
  )
  ON CONFLICT (email) DO UPDATE SET
    encrypted_password = crypt('11223344', gen_salt('bf')),
    raw_user_meta_data = '{"role":"super_admin","full_name":"Bobby (Super Admin)"}'::jsonb,
    updated_at = now()
  RETURNING id INTO user_id;
  
  -- Wait a moment for trigger to fire
  PERFORM pg_sleep(1);
  
  -- Ensure profile exists and has correct role
  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (user_id, 'bobby@skylight-digital.co.za', 'Bobby (Super Admin)', 'super_admin', true)
  ON CONFLICT (id) DO UPDATE SET
    role = 'super_admin',
    full_name = 'Bobby (Super Admin)',
    is_active = true;
    
  RAISE NOTICE '✅ Super Admin account created successfully!';
  RAISE NOTICE 'Email: bobby@skylight-digital.co.za';
  RAISE NOTICE 'Password: 11223344';
  RAISE NOTICE 'Role: super_admin';
END $$;

-- Step 2: Verify the account was created
SELECT 
  p.id,
  p.email,
  p.full_name,
  p.role,
  p.is_active,
  u.email_confirmed_at
FROM public.profiles p
LEFT JOIN auth.users u ON p.id = u.id
WHERE p.email = 'bobby@skylight-digital.co.za';
`);

console.log("\n📋 Instructions:");
console.log("1. Go to your Supabase Dashboard");
console.log("2. Navigate to SQL Editor");
console.log("3. Copy and paste the SQL above");
console.log("4. Click 'Run' to create your Super Admin account");
console.log("\n✅ After running the SQL, you can login with:");
console.log("   Email: bobby@skylight-digital.co.za");
console.log("   Password: 11223344\n");