# 🧪 CateringMS Role Testing Credentials

## Quick Start Guide

### Step 1: Register Test Users
Go to: `https://cateringms.com/spit-braai-delivery/auth/register`

Register each of the following accounts:

#### 1️⃣ Admin User
- **Email:** `admin@test.cateringms.com`
- **Password:** `TestAdmin123!`
- **Company Name:** `Spit Braai Delivery`
- **Portal URL:** `https://cateringms.com/spit-braai-delivery/admin/dashboard`

#### 2️⃣ Driver User
- **Email:** `driver@test.cateringms.com`
- **Password:** `TestDriver123!`
- **Company Name:** `Spit Braai Delivery`
- **Portal URL:** `https://cateringms.com/spit-braai-delivery/driver/dashboard`

#### 3️⃣ Shopping Manager
- **Email:** `shopping@test.cateringms.com`
- **Password:** `TestShopping123!`
- **Company Name:** `Spit Braai Delivery`
- **Portal URL:** `https://cateringms.com/spit-braai-delivery/shopping/dashboard`

#### 4️⃣ Kitchen Staff
- **Email:** `kitchen@test.cateringms.com`
- **Password:** `TestKitchen123!`
- **Company Name:** `Spit Braai Delivery`
- **Portal URL:** `https://cateringms.com/spit-braai-delivery/kitchen/dashboard`

#### 5️⃣ Cleaning Staff
- **Email:** `cleaning@test.cateringms.com`
- **Password:** `TestCleaning123!`
- **Company Name:** `Spit Braai Delivery`
- **Portal URL:** `https://cateringms.com/spit-braai-delivery/cleaning/dashboard`

#### 6️⃣ Multi-Role User (Access All Portals)
- **Email:** `multirole@test.cateringms.com`
- **Password:** `TestMulti123!`
- **Company Name:** `Spit Braai Delivery`
- **Portal URL:** `https://cateringms.com/spit-braai-delivery/admin/dashboard`
- **Special:** Can switch between ALL portal types

---

### Step 2: Assign Roles (SQL Script)

After registering all users above, run this SQL script in your Supabase SQL Editor:

```sql
-- ROLE ASSIGNMENT SQL SCRIPT
-- Run this script AFTER registering the test users

-- 1. Admin User
INSERT INTO user_departments (user_id, department, is_primary)
SELECT id, 'admin', true
FROM profiles
WHERE email = 'admin@test.cateringms.com'
ON CONFLICT (user_id, department) DO NOTHING;

UPDATE profiles
SET role = 'admin', active_role = 'admin', company_slug = 'spit-braai-delivery'
WHERE email = 'admin@test.cateringms.com';

-- 2. Driver User
INSERT INTO user_departments (user_id, department, is_primary)
SELECT id, 'driver', true
FROM profiles
WHERE email = 'driver@test.cateringms.com'
ON CONFLICT (user_id, department) DO NOTHING;

UPDATE profiles
SET role = 'driver', active_role = 'driver', company_slug = 'spit-braai-delivery'
WHERE email = 'driver@test.cateringms.com';

-- 3. Shopping Manager
INSERT INTO user_departments (user_id, department, is_primary)
SELECT id, 'shopping', true
FROM profiles
WHERE email = 'shopping@test.cateringms.com'
ON CONFLICT (user_id, department) DO NOTHING;

UPDATE profiles
SET role = 'shopping', active_role = 'shopping', company_slug = 'spit-braai-delivery'
WHERE email = 'shopping@test.cateringms.com';

-- 4. Kitchen Staff
INSERT INTO user_departments (user_id, department, is_primary)
SELECT id, 'kitchen', true
FROM profiles
WHERE email = 'kitchen@test.cateringms.com'
ON CONFLICT (user_id, department) DO NOTHING;

UPDATE profiles
SET role = 'kitchen', active_role = 'kitchen', company_slug = 'spit-braai-delivery'
WHERE email = 'kitchen@test.cateringms.com';

-- 5. Cleaning Staff
INSERT INTO user_departments (user_id, department, is_primary)
SELECT id, 'cleaning', true
FROM profiles
WHERE email = 'cleaning@test.cateringms.com'
ON CONFLICT (user_id, department) DO NOTHING;

UPDATE profiles
SET role = 'cleaning', active_role = 'cleaning', company_slug = 'spit-braai-delivery'
WHERE email = 'cleaning@test.cateringms.com';

-- 6. Multi-Role User (ALL departments)
INSERT INTO user_departments (user_id, department, is_primary)
SELECT id, 'admin', true
FROM profiles
WHERE email = 'multirole@test.cateringms.com'
ON CONFLICT (user_id, department) DO NOTHING;

INSERT INTO user_departments (user_id, department, is_primary)
SELECT id, 'driver', false
FROM profiles
WHERE email = 'multirole@test.cateringms.com'
ON CONFLICT (user_id, department) DO NOTHING;

INSERT INTO user_departments (user_id, department, is_primary)
SELECT id, 'shopping', false
FROM profiles
WHERE email = 'multirole@test.cateringms.com'
ON CONFLICT (user_id, department) DO NOTHING;

INSERT INTO user_departments (user_id, department, is_primary)
SELECT id, 'kitchen', false
FROM profiles
WHERE email = 'multirole@test.cateringms.com'
ON CONFLICT (user_id, department) DO NOTHING;

INSERT INTO user_departments (user_id, department, is_primary)
SELECT id, 'cleaning', false
FROM profiles
WHERE email = 'multirole@test.cateringms.com'
ON CONFLICT (user_id, department) DO NOTHING;

UPDATE profiles
SET role = 'admin', active_role = 'admin', company_slug = 'spit-braai-delivery'
WHERE email = 'multirole@test.cateringms.com';

-- Verify the setup
SELECT 
  p.email,
  p.role,
  p.active_role,
  p.company_slug,
  array_agg(ud.department ORDER BY ud.is_primary DESC) as departments
FROM profiles p
LEFT JOIN user_departments ud ON p.id = ud.user_id
WHERE p.email LIKE '%@test.cateringms.com'
GROUP BY p.id, p.email, p.role, p.active_role, p.company_slug
ORDER BY p.email;
```

---

### Step 3: Test Each Portal

Visit the testing dashboard: `https://cateringms.com/admin/role-testing`

Or manually test each account:

1. **Admin Portal Test**
   - Login: `admin@test.cateringms.com` / `TestAdmin123!`
   - Should see: Admin navigation with Users, Reports, Settings
   - Access: Full system management

2. **Driver Portal Test**
   - Login: `driver@test.cateringms.com` / `TestDriver123!`
   - Should see: Driver navigation with Routes, Deliveries, Profile
   - Access: Delivery operations only

3. **Shopping Portal Test**
   - Login: `shopping@test.cateringms.com` / `TestShopping123!`
   - Should see: Shopping navigation with Orders, Suppliers, Inventory
   - Access: Procurement operations only

4. **Kitchen Portal Test**
   - Login: `kitchen@test.cateringms.com` / `TestKitchen123!`
   - Should see: Kitchen navigation with Menu, Stock, Prep List
   - Access: Kitchen operations only

5. **Cleaning Portal Test**
   - Login: `cleaning@test.cateringms.com` / `TestCleaning123!`
   - Should see: Cleaning navigation with Tasks, Schedules, Supplies
   - Access: Cleaning operations only

6. **Multi-Role Portal Test**
   - Login: `multirole@test.cateringms.com` / `TestMulti123!`
   - Should see: RoleSwitcher component in header
   - Can toggle: Between all 5 portal types
   - Test: Switch between portals and verify correct content loads

---

## Testing Checklist

For each role, verify:

- ✅ User can login successfully
- ✅ Correct portal dashboard loads
- ✅ Portal-specific navigation appears
- ✅ Only authorized actions are available
- ✅ Notifications are portal-specific
- ✅ User data is scoped correctly

For multi-role user specifically:

- ✅ RoleSwitcher component appears in header
- ✅ Can switch between all 5 portals
- ✅ Portal content changes when switching
- ✅ Notifications update based on active role
- ✅ Navigation menu updates based on active role

---

## Common Issues & Solutions

### Issue: "Invalid login credentials"
**Solution:** Make sure you've completed Step 1 (registration) first

### Issue: Wrong portal appears after login
**Solution:** Run the SQL script from Step 2 to assign correct roles

### Issue: RoleSwitcher not appearing for multi-role user
**Solution:** Verify all departments were assigned in Step 2

### Issue: "Access denied" or blank dashboard
**Solution:** Check that company_slug is set to 'spit-braai-delivery' in profiles table

---

## Next Steps After Testing

1. Document any bugs or UX issues found
2. Test role switching functionality thoroughly
3. Verify permissions are enforced correctly
4. Test notification system per role
5. Validate data isolation between roles

---

## Support

For issues with testing setup, contact Softgen Support or check the admin dashboard at:
`https://cateringms.com/admin/role-testing`
