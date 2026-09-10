-- Create Super Admin account for Bobby
DO $$
DECLARE
  user_id UUID;
BEGIN
  -- Enable pgcrypto extension for password hashing
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  
  -- Insert auth user with encrypted password
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_sent_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
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
    '{"role":"super_admin","full_name":"Bobby Whitcher (SaaS Owner)"}'::jsonb,
    now(),
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
  RETURNING id INTO user_id;
  
  -- Wait for trigger to create profile
  PERFORM pg_sleep(1);
  
  -- Ensure profile exists with correct role
  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (user_id, 'bobby@skylight-digital.co.za', 'Bobby Whitcher (SaaS Owner)', 'super_admin', true)
  ON CONFLICT (id) DO UPDATE SET
    role = 'super_admin',
    full_name = 'Bobby Whitcher (SaaS Owner)',
    is_active = true;
  
  RAISE NOTICE 'Super Admin created: %', user_id;
END $$;

-- Verify creation
SELECT 
  u.id,
  u.email,
  u.email_confirmed_at,
  u.raw_user_meta_data->>'role' as user_role,
  p.role as profile_role,
  p.full_name
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE u.email = 'bobby@skylight-digital.co.za';