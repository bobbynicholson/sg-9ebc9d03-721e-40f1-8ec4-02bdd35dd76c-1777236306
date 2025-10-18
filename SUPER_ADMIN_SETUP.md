# CateringMS Super Admin Setup Guide

## Current Super Admin Status

### ✅ Bobby's Account (COMPLETE)
- **Email:** bobby@skylight-digital.co.za
- **User ID:** fc277cd4-6275-4261-9874-3091f93a65d9
- **Role:** super_admin
- **Status:** ✅ Active and configured
- **Access:** /cateringms-platform/

### ⏳ Alex's Account (PENDING CREATION)
- **Email:** alex@skylight-digital.co.za
- **User ID:** [To be created]
- **Role:** super_admin (will be assigned after creation)
- **Status:** ⏳ Needs manual creation in Supabase

---

## Steps to Create Alex's Super Admin Account

### Method 1: Via Supabase Dashboard (RECOMMENDED)

1. **Navigate to Supabase Dashboard**
   - Go to: https://supabase.com/dashboard
   - Select your CateringMS project
   - Click "Authentication" → "Users"

2. **Create New User**
   - Click "Add User" or "Invite User" button
   - Enter email: `alex@skylight-digital.co.za`
   - Generate a strong password (or let Alex set it via password reset)
   - Confirm email verification (if required)
   - Click "Create User"

3. **Copy the User ID**
   - After creation, find Alex's user in the list
   - Copy the UUID (something like: `a1b2c3d4-5678-90ab-cdef-1234567890ab`)

4. **Run SQL Update**
   - Go to "SQL Editor" in Supabase
   - Run this query (replace `USER_ID_HERE` with Alex's actual ID):

```sql
-- Update Alex's profile to super_admin
UPDATE profiles
SET 
  active_role = 'super_admin',
  full_name = 'Alex - CateringMS Platform Admin',
  company_id = NULL,
  company_slug = NULL
WHERE id = 'USER_ID_HERE';

-- Verify the update
SELECT id, email, full_name, active_role, company_id, company_slug
FROM profiles
WHERE email = 'alex@skylight-digital.co.za';
```

---

### Method 2: Via SQL Only (After Manual Auth Creation)

If you've already created Alex's auth user manually, just run:

```sql
-- Find and update Alex's profile
UPDATE profiles
SET 
  active_role = 'super_admin',
  full_name = 'Alex - CateringMS Platform Admin',
  company_id = NULL,
  company_slug = NULL
WHERE email = 'alex@skylight-digital.co.za';
```

---

## Super Admin Access URLs

Once both accounts are set up, Bobby and Alex can access:

### CateringMS Platform Dashboard (Super Admin Only)
- **Main Dashboard:** `/cateringms-platform/dashboard`
- **Company Database:** `/cateringms-platform/company-database`
- **Subscription Management:** `/cateringms-platform/subscription-management`
- **Currency Monitoring:** `/cateringms-platform/currency-monitoring`
- **Pricing Management:** `/cateringms-platform/pricing-management`
- **Trial Management:** `/cateringms-platform/trial-management`
- **CMS Blog:** `/cateringms-platform/cms-blog`
- **CMS Pages:** `/cateringms-platform/cms-pages`

### Login URL
- Both can login at: `https://cateringms.com/auth/login`
- After login, they'll be automatically redirected to `/cateringms-platform/dashboard`

---

## Verification Checklist

After setting up both accounts, verify:

- [ ] Bobby can login with bobby@skylight-digital.co.za
- [ ] Bobby sees "Super Admin" badge in header
- [ ] Bobby can access /cateringms-platform/dashboard
- [ ] Bobby can view all company records
- [ ] Alex can login with alex@skylight-digital.co.za  
- [ ] Alex sees "Super Admin" badge in header
- [ ] Alex can access /cateringms-platform/dashboard
- [ ] Alex can view all company records
- [ ] Both can manage companies, subscriptions, and platform settings

---

## Security Notes

✅ **Super Admin Capabilities:**
- View all catering companies in the system
- Manage subscriptions and trials
- Monitor currency exchange rates
- Access financial dashboards
- Manage platform-wide settings
- View all user data across companies

⚠️ **Important Security Practices:**
- Use strong, unique passwords for super admin accounts
- Enable 2FA if available
- Never share super admin credentials
- Regularly audit super admin actions
- Review access logs monthly

---

## Troubleshooting

### "Invalid login credentials"
- Verify email is exactly: `alex@skylight-digital.co.za`
- Confirm password is correct
- Check if email verification is required
- Try password reset if needed

### "Access denied" or wrong dashboard
- Verify `active_role` is set to `super_admin` in profiles table
- Check that `company_id` and `company_slug` are NULL
- Clear browser cache and cookies
- Try logging out and back in

### Profile not found
- Check if auth user was created: `SELECT * FROM auth.users WHERE email = 'alex@skylight-digital.co.za'`
- Verify profile trigger created profile: `SELECT * FROM profiles WHERE email = 'alex@skylight-digital.co.za'`
- If profile missing, run the profile creation SQL above

---

## Next Steps After Setup

1. ✅ Test both super admin logins
2. ✅ Verify access to platform dashboard
3. ✅ Review company database (should show test-company)
4. ✅ Test subscription management features
5. ✅ Familiarize with platform admin tools

---

**Created:** 2025-10-18  
**Last Updated:** 2025-10-18  
**Maintained by:** CateringMS Platform Team
