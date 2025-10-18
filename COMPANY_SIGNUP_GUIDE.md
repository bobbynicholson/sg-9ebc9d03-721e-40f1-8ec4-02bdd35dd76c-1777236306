# Company Signup & Login Flow Guide

## 🎯 Overview

This guide explains the complete company signup and login process for CateringMS.

## 📋 Prerequisites

Before companies can sign up, you need to:

1. **Disable Email Confirmation in Supabase** (CRITICAL)
   - Go to Supabase Dashboard → Authentication → Providers → Email
   - **TURN OFF** "Confirm email" requirement
   - This allows instant access after signup without waiting for email confirmation

## 🚀 Company Signup Process

### Step 1: Company Visits Homepage
- User lands on `cateringms.com`
- Clicks "Start Free Trial" button
- Gets redirected to `/company-signup`

### Step 2: Company Registration Form
User fills in:
- **Company Information:**
  - Company Name (auto-generates URL slug)
  - Company URL Slug (editable, checked for availability)
  - Business Currency (ZAR, USD, EUR, GBP, AUD)

- **Owner Information:**
  - Full Name
  - Email Address
  - Phone Number
  - Password (min 6 characters)
  - Confirm Password

### Step 3: Backend Processing (Automatic)
When user clicks "Register Company", the system:

1. ✅ **Creates Auth User** (`supabase.auth.signUp`)
   - Email & password stored in Supabase Auth
   - User metadata includes: full_name, role, currency, phone, company_name

2. ✅ **Waits for Profile Creation** (2 seconds)
   - Database trigger automatically creates profile record
   - Profile linked to auth user via `id` field

3. ✅ **Creates Company Record**
   - Inserts into `companies` table
   - Sets owner_id, slug, currency, trial period
   - Company starts with 14-day trial

4. ✅ **Links Profile to Company**
   - Updates profile with `company_id` and `company_slug`
   - Sets `active_role` to "admin"

5. ✅ **Assigns Admin Role**
   - Creates entry in `user_roles` table
   - Grants full admin permissions

6. ✅ **Auto-Login User**
   - Signs in user automatically
   - No email confirmation required (if disabled in Supabase)

7. ✅ **Shows Success Page**
   - Displays unique company URL: `cateringms.com/{company-slug}`
   - Provides copy button for URL
   - Shows next steps
   - Offers buttons to start onboarding or go to dashboard

## 🔑 Company Login Process

### Method 1: Direct Company URL (Recommended)
1. User visits `cateringms.com/{company-slug}`
2. Sees company-branded login page
3. Enters email & password
4. Gets redirected to appropriate portal based on role

### Method 2: Generic Login
1. User visits `cateringms.com/auth/login`
2. Enters email & password
3. System detects company from profile
4. Redirects to `/{company-slug}/[portal]/dashboard`

## 📧 Email Confirmation (MUST BE DISABLED)

**CRITICAL:** For smooth signup experience:

1. Go to Supabase Dashboard
2. Navigate to: **Authentication** → **Providers** → **Email**
3. Find: **"Confirm email"** setting
4. **TURN IT OFF** (uncheck the box)
5. Click **Save**

Without this, users will get:
- "Email confirmation required" errors
- Cannot login until they click email link
- Poor user experience

## 🎨 Success Page Features

After successful signup, users see:
- ✅ Animated success icon
- 📋 Their unique company URL in a copyable box
- ⚠️ Warning to save and bookmark the URL
- 📝 Next steps checklist:
  1. Complete onboarding
  2. Invite team members
  3. Start managing orders
- 🔘 Two action buttons:
  - "Start Onboarding" → Takes to setup wizard
  - "Go to Dashboard" → Direct access to admin dashboard

## 🔐 Security Features

1. **Slug Validation:**
   - Real-time availability checking
   - Prevents duplicate company slugs
   - Only allows lowercase letters, numbers, and hyphens

2. **Password Requirements:**
   - Minimum 6 characters
   - Must match confirmation field

3. **Profile Protection:**
   - Row Level Security (RLS) enabled
   - Users can only access their own company data

## 🐛 Troubleshooting

### Issue: "Email confirmation required"
**Solution:** Disable email confirmation in Supabase (see above)

### Issue: "Company slug already taken"
**Solution:** System automatically checks and shows error. User must choose different name.

### Issue: "Profile not created"
**Solution:** Check that `handle_new_user()` trigger exists in Supabase

### Issue: "Cannot login after signup"
**Solution:** 
1. Check email confirmation is disabled
2. Verify user exists in Supabase Auth
3. Check profile was created in profiles table
4. Verify company record exists

## 📱 Mobile Responsive

The signup page is fully responsive:
- Large touch targets (h-12 inputs/buttons)
- Proper spacing for mobile keyboards
- Scrollable form sections
- Copy button works on mobile

## 🎯 Next Steps for New Companies

After signup, companies should:
1. **Complete Onboarding** (`/{company-slug}/admin/onboarding`)
   - Set up company profile
   - Configure preferences
   - Add initial data

2. **Invite Team Members**
   - Share company URL with employees
   - Employees can register using the company URL
   - Assign appropriate roles

3. **Start Using Platform**
   - Create first quote
   - Add inventory items
   - Schedule deliveries

## 🔗 Important URLs

- **Company Signup:** `/company-signup`
- **Generic Login:** `/auth/login`
- **Company Login:** `/{company-slug}`
- **Admin Dashboard:** `/{company-slug}/admin/dashboard`
- **Onboarding:** `/{company-slug}/admin/onboarding`

## 💡 Tips for Success

1. **Bookmark Company URL** - This is the main access point
2. **Share with Team** - All employees use the same company URL
3. **Complete Onboarding** - Sets up essential company settings
4. **Test with Demo Data** - Familiarize yourself before going live
5. **Contact Support** - Call 083 652 5755 for help

## ✅ Checklist for Alex

Before launch, ensure:
- [ ] Email confirmation is DISABLED in Supabase
- [ ] `handle_new_user()` trigger exists and works
- [ ] RLS policies are set up correctly
- [ ] Test signup flow end-to-end
- [ ] Test auto-login works
- [ ] Test company URL redirect works
- [ ] Verify trial period is set correctly (14 days)
- [ ] Test with different currencies
- [ ] Verify slug validation works
- [ ] Test success page URL copy button
