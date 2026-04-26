
<![CDATA[
# CateringMS Test Credentials
**Company:** Spit Braai Delivery
**Company Slug:** `spit-braai-delivery`

---

## 🔐 Test User Credentials

### IMPORTANT: Password Setup Required
These users exist in the database, but you need to **manually create their auth accounts** in Supabase:

1. Go to Supabase Dashboard → Authentication → Users
2. Click "Add User" → "Create New User"
3. For each user below, enter the email and set password to: **`Test123!`**
4. Confirm the email address (toggle "Auto Confirm User")

---

## 👥 All Test Users

### 1. Super Admin (Platform-wide Access)
- **Email:** `superadmin@cateringms.com`
- **Password:** `Test123!`
- **Name:** Super Admin
- **Role:** `super_admin`
- **Access:** All companies, super admin dashboard
- **Phone:** +27 11 111 1111

### 2. Company Owner (Callum Rogers)
- **Email:** `hello@spitbraaidelivery.co.za`
- **Password:** `Test123!`
- **Name:** Callum Rogers
- **Role:** `company_admin`
- **Access:** Full company management, settings, users
- **Phone:** +27 82 222 2222

### 3. Admin Staff
- **Email:** `admin@spitbraaidelivery.co.za`
- **Password:** `Test123!`
- **Name:** Admin Staff
- **Role:** `admin`
- **Access:** Orders, inventory, reports, assignments
- **Phone:** +27 82 333 3333

### 4. Kitchen Staff
- **Email:** `kitchen@spitbraaidelivery.co.za`
- **Password:** `Test123!`
- **Name:** Chef John
- **Role:** `kitchen_staff`
- **Access:** Kitchen dashboard, prep lists, duty tracking
- **Phone:** +27 82 444 4444

### 5. Driver
- **Email:** `driver@spitbraaidelivery.co.za`
- **Password:** `Test123!`
- **Name:** Driver Mike
- **Role:** `driver`
- **Access:** Driver dashboard, routes, deliveries, GPS tracking
- **Phone:** +27 82 555 5555

### 6. Shopping Staff
- **Email:** `shopping@spitbraaidelivery.co.za`
- **Password:** `Test123!`
- **Name:** Shopping Sarah
- **Role:** `shopping_staff`
- **Access:** Shopping dashboard, inventory, suppliers
- **Phone:** +27 82 666 6666

### 7. Cleaning Staff
- **Email:** `cleaning@spitbraaidelivery.co.za`
- **Password:** `Test123!`
- **Name:** Cleaning Lisa
- **Role:** `cleaning_staff`
- **Access:** Cleaning dashboard, equipment, schedules
- **Phone:** +27 82 777 7777

### 8. Client (Test Client Portal)
- **Email:** `client@test.com`
- **Password:** `Test123!`
- **Name:** Test Client
- **Role:** `client`
- **Access:** Client portal, order tracking, billing
- **Phone:** +27 82 888 8888

---

## 🚀 Quick Setup Instructions

### Option 1: Supabase Dashboard (Recommended)
1. Open Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **Authentication** → **Users**
4. For each email above:
   - Click **"Add User"** → **"Create New User"**
   - Email: `[email from list above]`
   - Password: `Test123!`
   - Toggle **"Auto Confirm User"** to ON
   - Click **"Create User"**

### Option 2: Supabase SQL Editor
Run this SQL to create auth users (if you haven't disabled email confirmation):

```sql
-- Note: This requires admin access to auth.users table
-- Alternatively, use the Supabase Dashboard method above
```

---

## 🧪 Testing Workflows

### Test Complete Order Workflow
1. **Login as Admin:** `admin@spitbraaidelivery.co.za`
2. Create new order
3. Assign kitchen staff and driver
4. **Login as Kitchen:** `kitchen@spitbraaidelivery.co.za`
5. View assigned orders, mark as preparing
6. **Login as Driver:** `driver@spitbraaidelivery.co.za`
7. View routes, update delivery status
8. **Login as Client:** `client@test.com`
9. Track order in real-time

### Test Multi-Role Switching
1. **Login as Owner:** `hello@spitbraaidelivery.co.za`
2. Use Role Switcher to test different portals
3. Verify each role sees appropriate dashboard

### Test Company Isolation
1. Create second test company
2. Create users for second company
3. Verify User A cannot see User B's data

---

## 📋 What's Already Set Up

✅ All 8 user profiles created in database
✅ Roles and permissions configured
✅ Company association set
✅ Phone numbers assigned
✅ Client record created for client user

❌ **You Must Create:** Auth accounts in Supabase (see instructions above)

---

## 🔒 Security Notes

- **These are TEST credentials** - Use only in development
- **DO NOT use `Test123!`** in production
- **Change all passwords** before going live
- **Enable MFA** for admin and owner accounts in production
- **Use strong passwords** (12+ characters, mixed case, numbers, symbols)

---

## 📞 Support

If you encounter issues:
1. Check Supabase Dashboard → Authentication → Users
2. Verify email confirmation is disabled OR users are auto-confirmed
3. Check Database → Table Editor → profiles (verify records exist)
4. Try logging in at: `http://localhost:3000/auth/login`

---

**Last Updated:** 2026-04-26
**Status:** ✅ Database records created - Auth accounts need manual setup
</CDATA>
