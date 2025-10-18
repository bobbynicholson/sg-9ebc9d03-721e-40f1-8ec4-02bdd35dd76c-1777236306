
# Demo System Setup Instructions

## Current Status

✅ **Demo Page Updated** - The `/demo` page now displays all 6 portals with correct login URLs
✅ **Login URLs Fixed** - All demo logins point to `/test-company/auth/login`
✅ **Auto-fill Credentials** - Demo credentials are automatically filled when clicking "Login as Demo User"
✅ **Test Company Created** - The `test-company` is now set up in the database

## Next Steps to Complete Demo Setup

### 1. Create Demo User Accounts

Each demo user must be created through the normal Supabase Auth registration flow. You have two options:

#### Option A: Manual Registration (Recommended for Testing)
1. Visit: `https://cateringms.com/test-company/auth/register`
2. Register each demo user with these credentials:

**Admin:**
- Email: `admin@test-company.com`
- Password: `testadmin123`
- Full Name: `Demo Admin`
- Phone: `+27 11 111 1111`

**Driver:**
- Email: `driver@test-company.com`
- Password: `testdriver123`
- Full Name: `Demo Driver`
- Phone: `+27 22 222 2222`

**Kitchen:**
- Email: `kitchen@test-company.com`
- Password: `testkitchen123`
- Full Name: `Demo Kitchen Manager`
- Phone: `+27 33 333 3333`

**Shopping:**
- Email: `shopping@test-company.com`
- Password: `testshopping123`
- Full Name: `Demo Shopping Manager`
- Phone: `+27 44 444 4444`

**Cleaning:**
- Email: `cleaning@test-company.com`
- Password: `testcleaning123`
- Full Name: `Demo Cleaning Manager`
- Phone: `+27 55 555 5555`

**Client:**
- Email: `client@test-company.com`
- Password: `testclient123`
- Full Name: `Demo Client`
- Phone: `+27 66 666 6666`

#### Option B: Programmatic Creation (Via Supabase Admin API)
If you have access to Supabase Admin API, you can create these users programmatically using the Service Role Key.

### 2. Assign Department Roles

After creating the users:
1. Log in as the Test Company owner/admin
2. Navigate to: `https://cateringms.com/test-company/admin/users`
3. For each demo user, click "Edit Departments"
4. Assign the appropriate role and set it as "Primary":
   - admin@test-company.com → Admin (Primary)
   - driver@test-company.com → Driver (Primary)
   - kitchen@test-company.com → Kitchen Team (Primary)
   - shopping@test-company.com → Shopping Team (Primary)
   - cleaning@test-company.com → Cleaning Team (Primary)
   - client@test-company.com → Client (Primary)

### 3. Test the Demo System

1. Visit: `https://cateringms.com/demo`
2. Click "Login as Demo User" on any portal card
3. Verify that:
   - Credentials are auto-filled
   - Login succeeds
   - User is redirected to the correct dashboard
   - Portal features are accessible

## Why Manual Registration?

Supabase Auth requires users to be created through their authentication API. We cannot create authentication records directly in the database for security reasons. The registration flow:

1. **Creates Auth User** → Supabase Auth handles this
2. **Triggers Profile Creation** → Database trigger creates profile automatically
3. **Links to Company** → Our registration flow handles this
4. **Assigns Roles** → Admin assigns roles through the user management interface

## Demo Page Features

✅ All 6 portal cards displayed
✅ Credentials shown on each card
✅ "Copy Credentials" button
✅ "Login as Demo User" button with auto-fill
✅ Feature highlights for each portal
✅ Professional design matching CateringMS branding

## Troubleshooting

**Issue: Demo users can't login**
- Verify users were created through the registration flow
- Check that users are linked to `test-company`
- Ensure roles are assigned in `/test-company/admin/users`

**Issue: Wrong dashboard after login**
- Check the `active_role` in the user's profile
- Verify `user_departments` table has correct primary role
- Ensure `company_slug` matches `test-company`

**Issue: Auto-fill not working**
- Check browser console for errors
- Verify sessionStorage is enabled
- Try clearing browser cache

## Security Note

⚠️ These demo credentials are publicly visible on the `/demo` page. They should ONLY be used with the `test-company` demo environment and should never contain real client data.

## Next Development Steps

After demo setup is complete, consider:
1. Adding sample orders to test-company for demonstration
2. Creating sample equipment inventory
3. Adding mock GPS tracking data
4. Populating with realistic demo data for better showcases
