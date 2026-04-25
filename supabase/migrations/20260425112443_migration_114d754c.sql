-- Create complete company setup for Spit Braai Delivery
DO $$
DECLARE
  company_uuid UUID;
  owner_uuid UUID;
BEGIN
  -- Enable pgcrypto
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  
  -- Step 1: Create the company
  INSERT INTO companies (
    id,
    company_name,
    legal_name,
    email,
    phone,
    city,
    state_province,
    country,
    subscription_tier,
    subscription_status,
    trial_ends_at,
    subscription_starts_at,
    billing_currency,
    is_active
  )
  VALUES (
    gen_random_uuid(),
    'Spit Braai Delivery',
    'Spit Braai Delivery (Pty) Ltd',
    'hello@spitbraaidelivery.co.za',
    '+27 123 456 789',
    'Cape Town',
    'Western Cape',
    'South Africa',
    'enterprise',
    'active',
    NULL, -- No trial end (lifetime free)
    CURRENT_TIMESTAMP,
    'ZAR',
    true
  )
  RETURNING id INTO company_uuid;
  
  -- Step 2: Create auth user for Callum
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
    confirmation_sent_at
  )
  VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'hello@spitbraaidelivery.co.za',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'role', 'company_admin',
      'full_name', 'Callum Rogers',
      'company_id', company_uuid
    ),
    now(),
    now(),
    now()
  )
  RETURNING id INTO owner_uuid;
  
  -- Wait for trigger
  PERFORM pg_sleep(1);
  
  -- Step 3: Create profile for Callum
  INSERT INTO public.profiles (
    id,
    company_id,
    role,
    full_name,
    email,
    phone,
    is_active
  )
  VALUES (
    owner_uuid,
    company_uuid,
    'company_admin',
    'Callum Rogers',
    'hello@spitbraaidelivery.co.za',
    '+27 123 456 789',
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    company_id = company_uuid,
    role = 'company_admin',
    full_name = 'Callum Rogers',
    is_active = true;
  
  RAISE NOTICE '✅ Company created successfully!';
  RAISE NOTICE 'Company: Spit Braai Delivery';
  RAISE NOTICE 'Company ID: %', company_uuid;
  RAISE NOTICE 'Owner: Callum Rogers';
  RAISE NOTICE 'Email: hello@spitbraaidelivery.co.za';
  RAISE NOTICE 'Role: company_admin';
  RAISE NOTICE 'Package: Enterprise (FREE/Lifetime)';
END $$;

-- Verify the setup
SELECT 
  c.id as company_id,
  c.company_name,
  c.subscription_tier,
  c.subscription_status,
  p.id as owner_id,
  p.full_name,
  p.email,
  p.role,
  u.email_confirmed_at
FROM companies c
LEFT JOIN profiles p ON p.company_id = c.id AND p.role = 'company_admin'
LEFT JOIN auth.users u ON u.id = p.id
WHERE c.email = 'hello@spitbraaidelivery.co.za';