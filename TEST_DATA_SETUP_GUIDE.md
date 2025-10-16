# Test Data Setup Guide for CateringMS

## Overview

This guide provides step-by-step instructions for setting up test data in the CateringMS platform, including the demo company "Test Catering" and test users for all roles.

---

## Prerequisites

- ✅ Database schema is set up
- ✅ Companies table exists
- ✅ Demo company "Test Catering" created (slug: `test-catering`)
- ⏳ Test users need to be created

---

## Step 1: Create Test Users in Supabase Auth

**IMPORTANT**: These users must be created through the Supabase Dashboard or Auth API first, then we'll link them to profiles.

### Method A: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **Users**
3. Click **"Add user"** for each test user
4. Use these credentials:

```
Admin User:
- Email: admin@testcatering.com
- Password: TestAdmin123!
- Email Confirm: Yes (skip email confirmation)

Driver User:
- Email: driver@testcatering.com
- Password: TestDriver123!
- Email Confirm: Yes

Kitchen Staff User:
- Email: kitchen@testcatering.com
- Password: TestKitchen123!
- Email Confirm: Yes

Cleaning Staff User:
- Email: cleaning@testcatering.com
- Password: TestCleaning123!
- Email Confirm: Yes

Shopping Staff User:
- Email: shopping@testcatering.com
- Password: TestShopping123!
- Email Confirm: Yes

Client User:
- Email: client@testcatering.com
- Password: TestClient123!
- Email Confirm: Yes
```

### Method B: Using SQL Function (Simpler)

Run this SQL to create all test users at once:

```sql
-- Create a function to add test users with profiles
CREATE OR REPLACE FUNCTION create_test_user(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_role TEXT,
  p_company_id UUID,
  p_departments TEXT[]
) RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- This would normally be done via Supabase Auth API
  -- For now, we'll create the profile record assuming the auth user exists
  
  -- Check if user already exists in auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User % does not exist in auth.users. Please create via Supabase Dashboard first.', p_email;
  END IF;
  
  -- Create or update profile
  INSERT INTO profiles (
    id,
    email,
    full_name,
    company_id,
    company_slug,
    role,
    active_role,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    p_email,
    p_full_name,
    p_company_id,
    'test-catering',
    p_role,
    p_role,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    company_slug = EXCLUDED.company_slug,
    role = EXCLUDED.role,
    active_role = EXCLUDED.active_role,
    updated_at = NOW();
  
  -- Assign departments
  FOR i IN 1..array_length(p_departments, 1) LOOP
    INSERT INTO user_departments (
      user_id,
      department,
      is_primary,
      created_at
    ) VALUES (
      v_user_id,
      p_departments[i],
      i = 1, -- First department is primary
      NOW()
    )
    ON CONFLICT (user_id, department) DO UPDATE SET
      is_primary = EXCLUDED.is_primary;
  END LOOP;
  
  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Step 2: Manual Profile & Department Setup (Alternative)

If you prefer to set up profiles manually after creating auth users, use these SQL scripts:

### Admin User Setup

```sql
-- Assuming auth user exists with email admin@testcatering.com
-- Replace 'AUTH_USER_ID' with actual UUID from auth.users table

-- Create profile
INSERT INTO profiles (
  id,
  email,
  full_name,
  company_id,
  company_slug,
  role,
  active_role,
  phone,
  created_at,
  updated_at
) VALUES (
  'AUTH_USER_ID', -- Replace with actual auth user ID
  'admin@testcatering.com',
  'Test Admin',
  'c1111111-1111-1111-1111-111111111111',
  'test-catering',
  'admin',
  'admin',
  '+27123456789',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  company_id = EXCLUDED.company_id,
  company_slug = EXCLUDED.company_slug,
  role = EXCLUDED.role,
  updated_at = NOW();

-- Assign admin department
INSERT INTO user_departments (user_id, department, is_primary)
VALUES ('AUTH_USER_ID', 'admin', true)
ON CONFLICT (user_id, department) DO NOTHING;

-- Update company owner
UPDATE companies 
SET owner_id = 'AUTH_USER_ID'
WHERE slug = 'test-catering';
```

### Driver User Setup

```sql
-- Replace 'DRIVER_AUTH_ID' with actual auth user ID

INSERT INTO profiles (
  id, email, full_name, company_id, company_slug, role, active_role, 
  phone, vehicle_details, drive_time_to_kitchen_minutes,
  created_at, updated_at
) VALUES (
  'DRIVER_AUTH_ID',
  'driver@testcatering.com',
  'Test Driver',
  'c1111111-1111-1111-1111-111111111111',
  'test-catering',
  'driver',
  'driver',
  '+27123456780',
  'Toyota Hilux - ABC 123 GP',
  30,
  NOW(),
  NOW()
);

INSERT INTO user_departments (user_id, department, is_primary)
VALUES ('DRIVER_AUTH_ID', 'driver', true);
```

### Kitchen Staff User Setup

```sql
-- Replace 'KITCHEN_AUTH_ID' with actual auth user ID

INSERT INTO profiles (
  id, email, full_name, company_id, company_slug, role, active_role,
  phone, created_at, updated_at
) VALUES (
  'KITCHEN_AUTH_ID',
  'kitchen@testcatering.com',
  'Test Kitchen Staff',
  'c1111111-1111-1111-1111-111111111111',
  'test-catering',
  'kitchen_staff',
  'kitchen_staff',
  '+27123456781',
  NOW(),
  NOW()
);

INSERT INTO user_departments (user_id, department, is_primary)
VALUES ('KITCHEN_AUTH_ID', 'kitchen_staff', true);
```

### Cleaning Staff User Setup

```sql
-- Replace 'CLEANING_AUTH_ID' with actual auth user ID

INSERT INTO profiles (
  id, email, full_name, company_id, company_slug, role, active_role,
  phone, created_at, updated_at
) VALUES (
  'CLEANING_AUTH_ID',
  'cleaning@testcatering.com',
  'Test Cleaning Staff',
  'c1111111-1111-1111-1111-111111111111',
  'test-catering',
  'cleaning_staff',
  'cleaning_staff',
  '+27123456782',
  NOW(),
  NOW()
);

INSERT INTO user_departments (user_id, department, is_primary)
VALUES ('CLEANING_AUTH_ID', 'cleaning_staff', true);
```

### Shopping Staff User Setup

```sql
-- Replace 'SHOPPING_AUTH_ID' with actual auth user ID

INSERT INTO profiles (
  id, email, full_name, company_id, company_slug, role, active_role,
  phone, created_at, updated_at
) VALUES (
  'SHOPPING_AUTH_ID',
  'shopping@testcatering.com',
  'Test Shopping Staff',
  'c1111111-1111-1111-1111-111111111111',
  'test-catering',
  'shopping_staff',
  'shopping_staff',
  '+27123456783',
  NOW(),
  NOW()
);

INSERT INTO user_departments (user_id, department, is_primary)
VALUES ('SHOPPING_AUTH_ID', 'shopping_staff', true);
```

### Client User Setup

```sql
-- Replace 'CLIENT_AUTH_ID' with actual auth user ID

INSERT INTO profiles (
  id, email, full_name, company_id, company_slug, role, active_role,
  phone, created_at, updated_at
) VALUES (
  'CLIENT_AUTH_ID',
  'client@testcatering.com',
  'Test Client',
  'c1111111-1111-1111-1111-111111111111',
  'test-catering',
  'client',
  'client',
  '+27123456784',
  NOW(),
  NOW()
);

INSERT INTO user_departments (user_id, department, is_primary)
VALUES ('CLIENT_AUTH_ID', 'client', true);
```

---

## Step 3: Create Sample Orders (Optional)

```sql
-- Create a sample order for testing
INSERT INTO orders (
  id,
  user_id, -- Admin user ID
  company_id,
  order_number,
  client_name,
  client_email,
  client_phone,
  event_date,
  event_time,
  guest_count,
  total,
  status,
  payment_status,
  venue_address,
  created_at
) VALUES (
  gen_random_uuid(),
  'ADMIN_AUTH_ID', -- Replace with admin user ID
  'c1111111-1111-1111-1111-111111111111',
  'ORD-001',
  'Test Client',
  'client@testcatering.com',
  '+27123456784',
  CURRENT_DATE + INTERVAL '7 days',
  '18:00:00',
  50,
  15000.00,
  'confirmed',
  'pending',
  '123 Test Street, Johannesburg, South Africa',
  NOW()
);
```

---

## Step 4: Verify Setup

Run these queries to verify everything is set up correctly:

```sql
-- Check company
SELECT * FROM companies WHERE slug = 'test-catering';

-- Check all profiles for test catering
SELECT 
  p.id,
  p.email,
  p.full_name,
  p.role,
  p.active_role,
  p.company_slug
FROM profiles p
WHERE p.company_id = 'c1111111-1111-1111-1111-111111111111'
ORDER BY p.created_at;

-- Check department assignments
SELECT 
  ud.user_id,
  p.email,
  p.full_name,
  ud.department,
  ud.is_primary
FROM user_departments ud
JOIN profiles p ON p.id = ud.user_id
WHERE p.company_id = 'c1111111-1111-1111-1111-111111111111'
ORDER BY p.email, ud.is_primary DESC;

-- Check orders
SELECT 
  o.order_number,
  o.client_name,
  o.event_date,
  o.guest_count,
  o.total,
  o.status
FROM orders o
WHERE o.company_id = 'c1111111-1111-1111-1111-111111111111';
```

---

## Step 5: Test Login URLs

After setup, test these URLs:

### Admin Portal
```
URL: https://cateringms.com/test-catering/admin/dashboard
Email: admin@testcatering.com
Password: TestAdmin123!
```

### Driver Portal
```
URL: https://cateringms.com/test-catering/driver/dashboard
Email: driver@testcatering.com
Password: TestDriver123!
```

### Kitchen Portal
```
URL: https://cateringms.com/test-catering/kitchen/dashboard
Email: kitchen@testcatering.com
Password: TestKitchen123!
```

### Cleaning Portal
```
URL: https://cateringms.com/test-catering/cleaning/dashboard
Email: cleaning@testcatering.com
Password: TestCleaning123!
```

### Shopping Portal
```
URL: https://cateringms.com/test-catering/shopping/dashboard
Email: shopping@testcatering.com
Password: TestShopping123!
```

### Client Portal
```
URL: https://cateringms.com/test-catering/client/my-orders
Email: client@testcatering.com
Password: TestClient123!
```

---

## Troubleshooting

### Issue: "User does not exist in auth.users"
**Solution**: Create the user first via Supabase Dashboard → Authentication → Add user

### Issue: "RLS policy violation"
**Solution**: Ensure the user's profile has the correct `company_id` set

### Issue: "Cannot access dashboard"
**Solution**: Check that `user_departments` table has the correct department assigned

### Issue: "Company slug not found"
**Solution**: Verify the company exists with `SELECT * FROM companies WHERE slug = 'test-catering'`

---

## Quick Reset Script

If you need to start over, run this to clean up test data:

```sql
-- WARNING: This will delete all test data!

-- Delete user departments
DELETE FROM user_departments 
WHERE user_id IN (
  SELECT id FROM profiles WHERE company_id = 'c1111111-1111-1111-1111-111111111111'
);

-- Delete orders
DELETE FROM orders WHERE company_id = 'c1111111-1111-1111-1111-111111111111';

-- Delete profiles (keep auth users intact)
DELETE FROM profiles WHERE company_id = 'c1111111-1111-1111-1111-111111111111';

-- Delete company
DELETE FROM companies WHERE slug = 'test-catering';
```

---

## Next Steps

Once test data is set up:

1. ✅ Test login for each role
2. ✅ Verify role-based dashboard access
3. ✅ Test role switching for multi-role users
4. ✅ Verify RLS policies prevent cross-company access
5. ✅ Test order creation and workflow
6. ✅ Test equipment tracking
7. ✅ Verify all navigation and features work

---

**Last Updated**: 2025-10-16
**Status**: Ready for Testing ✅
