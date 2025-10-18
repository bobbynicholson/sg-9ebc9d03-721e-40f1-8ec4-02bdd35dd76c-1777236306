-- ========================================
-- CateringMS Super Admin Setup SQL Queries
-- ========================================
-- Run these queries AFTER creating Alex's auth user in Supabase Dashboard
-- 
-- Instructions:
-- 1. Create Alex's user in Supabase Dashboard: Authentication > Users > Add User
-- 2. Email: alex@skylight-digital.co.za
-- 3. Copy the generated User ID
-- 4. Replace 'ALEX_USER_ID_HERE' below with the actual UUID
-- 5. Run these queries in Supabase SQL Editor
-- ========================================

-- ----------------------------------------
-- Step 1: Verify Alex's auth user exists
-- ----------------------------------------
SELECT 
  id,
  email,
  created_at,
  email_confirmed_at
FROM auth.users 
WHERE email = 'alex@skylight-digital.co.za';

-- If no results, you need to create the user first in Authentication > Users


-- ----------------------------------------
-- Step 2: Check if profile was auto-created
-- ----------------------------------------
SELECT 
  id,
  email,
  full_name,
  active_role,
  company_id,
  company_slug
FROM profiles 
WHERE email = 'alex@skylight-digital.co.za';

-- If profile exists but isn't super_admin, proceed to Step 3
-- If no profile exists, the database trigger should create it automatically


-- ----------------------------------------
-- Step 3: Update Alex to Super Admin
-- ----------------------------------------
-- REPLACE 'ALEX_USER_ID_HERE' WITH ACTUAL USER ID FROM STEP 1
UPDATE profiles
SET 
  active_role = 'super_admin',
  full_name = 'Alex - CateringMS Platform Admin',
  company_id = NULL,
  company_slug = NULL,
  updated_at = NOW()
WHERE email = 'alex@skylight-digital.co.za';

-- Alternative: If you have the User ID directly
-- UPDATE profiles
-- SET 
--   active_role = 'super_admin',
--   full_name = 'Alex - CateringMS Platform Admin',
--   company_id = NULL,
--   company_slug = NULL,
--   updated_at = NOW()
-- WHERE id = 'ALEX_USER_ID_HERE';


-- ----------------------------------------
-- Step 4: Verify Super Admin Setup
-- ----------------------------------------
SELECT 
  p.id,
  p.email,
  p.full_name,
  p.active_role,
  p.company_id,
  p.company_slug,
  au.email_confirmed_at,
  au.created_at
FROM profiles p
LEFT JOIN auth.users au ON p.id = au.id
WHERE p.email IN ('bobby@skylight-digital.co.za', 'alex@skylight-digital.co.za')
ORDER BY p.email;

-- Expected Results:
-- Both users should have:
-- - active_role = 'super_admin'
-- - company_id = NULL
-- - company_slug = NULL
-- - Full names with "Platform Admin" suffix


-- ----------------------------------------
-- Step 5: Verify Role Constraint Allows super_admin
-- ----------------------------------------
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'profiles'::regclass
  AND conname LIKE '%role%';

-- Should show 'super_admin' in the allowed values


-- ----------------------------------------
-- Step 6: Test Query - List All Super Admins
-- ----------------------------------------
SELECT 
  p.id,
  p.email,
  p.full_name,
  p.active_role,
  p.created_at,
  COUNT(DISTINCT c.id) as companies_can_access
FROM profiles p
LEFT JOIN companies c ON 1=1  -- Super admins can access all companies
WHERE p.active_role = 'super_admin'
GROUP BY p.id, p.email, p.full_name, p.active_role, p.created_at
ORDER BY p.created_at;


-- ----------------------------------------
-- TROUBLESHOOTING QUERIES
-- ----------------------------------------

-- If profile doesn't exist, create it manually:
-- INSERT INTO profiles (id, email, full_name, active_role, currency, subscription_status)
-- SELECT 
--   id,
--   email,
--   'Alex - CateringMS Platform Admin',
--   'super_admin',
--   'ZAR',
--   'active'
-- FROM auth.users
-- WHERE email = 'alex@skylight-digital.co.za'
-- AND NOT EXISTS (
--   SELECT 1 FROM profiles WHERE email = 'alex@skylight-digital.co.za'
-- );


-- Check all existing super admins:
-- SELECT * FROM profiles WHERE active_role = 'super_admin';


-- Reset a user back to super admin if needed:
-- UPDATE profiles 
-- SET active_role = 'super_admin', company_id = NULL, company_slug = NULL
-- WHERE email = 'alex@skylight-digital.co.za';


-- ========================================
-- END OF SETUP QUERIES
-- ========================================
