# CateringMS Complete Platform Guide

## 🎯 Executive Summary

CateringMS is now a fully functional multi-tenant catering management platform with:
- ✅ Company signup and onboarding
- ✅ Multi-role authentication system
- ✅ Company database management (Platform level)
- ✅ Client database management (Company level)
- ✅ Automatic client tracking from orders/quotes/leads
- ✅ 14-day trial system
- ✅ Multi-currency support

---

## 📋 Table of Contents

1. [System Architecture](#system-architecture)
2. [Company Signup Flow](#company-signup-flow)
3. [Database Systems](#database-systems)
4. [User Roles & Access](#user-roles--access)
5. [Data Flow](#data-flow)
6. [Testing Guide](#testing-guide)
7. [Troubleshooting](#troubleshooting)

---

## 🏗️ System Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                     CateringMS Platform                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐      ┌──────────────────┐           │
│  │  Super Admin     │      │  Company Admin   │           │
│  │  Portal          │      │  Portal          │           │
│  └──────────────────┘      └──────────────────┘           │
│         │                           │                       │
│         ├─ Company Database         ├─ Client Database     │
│         ├─ Subscription Mgmt        ├─ Order Management    │
│         ├─ Currency Monitoring      ├─ Inventory           │
│         └─ Platform Analytics       ├─ Driver Management   │
│                                     ├─ Kitchen Management   │
│                                     └─ Reports              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

- **Frontend:** Next.js 15.2 (Page Router), TypeScript, React
- **UI:** Shadcn/UI, Tailwind CSS
- **Backend:** Supabase (PostgreSQL, Auth, Storage)
- **Authentication:** Supabase Auth with Row Level Security
- **Deployment:** Vercel

---

## 🚀 Company Signup Flow

### User Journey

```
1. Visit Homepage (cateringms.com)
   ↓
2. Click "Start Free Trial"
   ↓
3. Fill Company Registration Form
   ↓
4. System Creates:
   - Auth User
   - Profile Record
   - Company Record
   - Admin Role Assignment
   ↓
5. Auto-Login User
   ↓
6. Show Success Page with Company URL
   ↓
7. Redirect to Onboarding or Dashboard
```

### Detailed Steps

#### Step 1: Registration Form (`/company-signup`)

**Company Information:**
- Company Name → Auto-generates URL slug
- Company URL Slug → Editable, real-time availability check
- Business Currency → Select from ZAR, USD, EUR, GBP, AUD

**Owner Information:**
- Full Name
- Email Address
- Phone Number
- Password (min 6 chars)
- Confirm Password

#### Step 2: Backend Processing (Automatic)

```typescript
// 1. Create Auth User
supabase.auth.signUp({
  email: formData.email,
  password: formData.password,
  options: {
    data: {
      full_name: formData.ownerName,
      role: "admin",
      currency: formData.currency
    }
  }
})

// 2. Wait for Profile Creation (Database Trigger)
// handle_new_user() trigger creates profile automatically

// 3. Create Company Record
companyService.createCompany({
  name: formData.companyName,
  slug: companySlug,
  owner_id: authData.user.id,
  currency: formData.currency,
  subscription_status: "trial",
  trial_ends_at: Date.now() + 14 days
})

// 4. Link Profile to Company
supabase.from("profiles").update({
  company_id: company.id,
  company_slug: companySlug,
  active_role: "admin"
}).eq("id", authData.user.id)

// 5. Assign Admin Role
roleService.assignRole(userId, "admin", userId, true)

// 6. Auto-Login
supabase.auth.signInWithPassword({
  email: formData.email,
  password: formData.password
})

// 7. Show Success Page
setCompanyUrl(`${window.location.origin}/${companySlug}`)
```

#### Step 3: Success Page

**Displays:**
- ✅ Success animation
- 📋 Unique company URL in copyable box
- ⚠️ Important notice to save URL
- 📝 Next steps checklist
- 🔘 Action buttons:
  - "Start Onboarding"
  - "Go to Dashboard"

---

## 🗄️ Database Systems

### 1. Company Database (Platform Level)

**Purpose:** Super admins manage all registered catering companies

**Access:** `/cateringms-platform/company-database`

**Who:** Super admins only (`is_super_admin = true`)

**Features:**
- View all companies
- Search companies
- Filter by subscription status
- View company details
- Access company dashboards
- Deactivate companies

**Data Displayed:**
| Field | Description |
|-------|-------------|
| Company Name | Business name |
| Slug | URL identifier |
| Owner | Name & contact info |
| Currency | Business currency |
| Status | trial/active/past_due/cancelled |
| Trial End | When trial expires |
| Created | Registration date |

**Status Colors:**
- 🟢 Active (green)
- 🔵 Trial (blue)
- 🟡 Past Due (yellow)
- 🔴 Cancelled (red)

### 2. Client Database (Company Level)

**Purpose:** Companies manage their clients

**Access:** `/{company-slug}/admin/client-database`

**Who:** Company admins and staff

**Features:**
- View all clients
- Search clients
- Add clients manually
- View client history
- Track client activity
- See revenue per client
- Deactivate clients

**Dashboard Statistics:**
- 👥 Total Clients (active/inactive breakdown)
- 📦 Total Orders
- 💰 Total Revenue
- 📝 Total Quotes & Leads
- 📊 Average Order Value

**Client Detail Modal:**

**Orders Tab:**
- Order date
- Total amount
- Status
- Items ordered

**Quotes Tab:**
- Quote date
- Requested amount
- Status (pending/converted/declined)
- Conversion info

**Leads Tab:**
- Submission date
- Source (website/referral/etc)
- Status (new/contacted/converted)
- Follow-up notes

---

## 👥 User Roles & Access

### Role Hierarchy

```
Super Admin (Platform Level)
├─ Company Admin (Company Owner)
│  ├─ Kitchen Manager
│  ├─ Driver Manager
│  ├─ Shopping Manager
│  └─ Staff Members
│     ├─ Kitchen Staff
│     ├─ Drivers
│     ├─ Shopping Staff
│     └─ Cleaning Staff
└─ Clients (External Users)
```

### Access Permissions

#### Super Admin
- ✅ Access all companies
- ✅ View company database
- ✅ Manage subscriptions
- ✅ Monitor platform metrics
- ✅ Currency monitoring
- ✅ Support tickets
- ❌ Cannot access individual company operations (by default)

#### Company Admin
- ✅ Full company access
- ✅ Client database
- ✅ Order management
- ✅ Staff management
- ✅ Inventory control
- ✅ Reports & analytics
- ✅ Settings & branding
- ❌ Cannot access other companies

#### Kitchen Manager
- ✅ Kitchen portal
- ✅ Menu management
- ✅ Prep lists
- ✅ Stock tracking
- ❌ Cannot access admin functions

#### Driver Manager
- ✅ Driver portal
- ✅ Route planning
- ✅ Delivery tracking
- ✅ Driver assignments
- ❌ Cannot access kitchen/admin

#### Staff Members
- ✅ Assigned portal only
- ✅ Task completion
- ✅ Time clock
- ❌ Limited to their role

#### Clients
- ✅ Client portal
- ✅ View orders
- ✅ Request quotes
- ✅ Track deliveries
- ❌ Cannot access backend

---

## 🔄 Data Flow

### How Clients Enter the System

#### Method 1: Order Placement
```
Client places order
→ Order created with client_id
→ Profile created/linked
→ Appears in client database
```

#### Method 2: Quote Request
```
Client submits quote form
→ Quote created with client_email
→ System matches/creates profile
→ Appears in client database
```

#### Method 3: Lead Submission
```
Client fills inquiry form
→ Lead created
→ Profile created
→ Appears in client database
```

#### Method 4: Manual Addition
```
Admin clicks "Add Client"
→ Enters contact info
→ Lead record created
→ Appears in client database
```

### How Companies Are Tracked

```
Company signup
→ Company record created
→ Owner profile linked
→ Trial period starts (14 days)
→ Appears in company database
→ Super admin can monitor
```

---

## 🧪 Testing Guide

### For Alex (Super Admin Setup)

#### Step 1: Set Super Admin Flag

**Option A: SQL Query**
```sql
-- Get your user ID first
SELECT id, email FROM profiles WHERE email = 'alex@cateringms.com';

-- Set super admin flag
UPDATE profiles 
SET is_super_admin = true 
WHERE email = 'alex@cateringms.com';
```

**Option B: Supabase Dashboard**
1. Go to Table Editor
2. Open `profiles` table
3. Find your record
4. Check `is_super_admin` box
5. Save

#### Step 2: Access Platform Admin

1. Login at `/auth/login`
2. Navigate to `/cateringms-platform/catering-ms-dashboard`
3. You should see:
   - Company Database Management
   - Subscription Management
   - Currency Monitoring
   - Platform Analytics

#### Step 3: View Company Database

1. Click "Company Database Management"
2. Should see all registered companies
3. Test search functionality
4. Test status filter
5. Click "View Dashboard" on any company

### Testing Company Signup

#### Test Case 1: New Company Registration

1. **Open:** `/company-signup`
2. **Fill Form:**
   - Company Name: "Test Catering Co"
   - Slug: Auto-generated + manual edit
   - Currency: ZAR
   - Owner Name: "Test Owner"
   - Email: "test@example.com"
   - Phone: "+27123456789"
   - Password: "test123"
3. **Submit**
4. **Expected:**
   - ✅ No errors
   - ✅ Success page shows
   - ✅ Company URL displayed
   - ✅ Copy button works
   - ✅ Auto-logged in
5. **Verify in Database:**
   ```sql
   SELECT * FROM companies WHERE slug = 'test-catering-co';
   SELECT * FROM profiles WHERE email = 'test@example.com';
   ```

#### Test Case 2: Duplicate Slug Prevention

1. Try to register with same company name
2. **Expected:** Error message about slug being taken
3. Change company name or slug
4. Should work

#### Test Case 3: Weak Password

1. Use password less than 6 chars
2. **Expected:** Error message
3. Use valid password
4. Should work

### Testing Client Database

#### Test Case 1: View Clients

1. Login as company admin
2. Navigate to `/{company-slug}/admin/client-database`
3. **Expected:**
   - ✅ Statistics show correctly
   - ✅ Client list displays
   - ✅ Search works
   - ✅ Detail modal opens

#### Test Case 2: Add Client Manually

1. Click "Add Client"
2. Fill form:
   - Name: "John Doe"
   - Email: "john@example.com"
   - Phone: "+27987654321"
3. Submit
4. **Expected:**
   - ✅ Client appears in list
   - ✅ Statistics update
   - ✅ Can view details

#### Test Case 3: Client Activity Tracking

1. Create an order for a client
2. Refresh client database
3. **Expected:**
   - ✅ Order count increases
   - ✅ Revenue updates
   - ✅ Last order date shows
   - ✅ Order appears in detail modal

---

## 🔧 Troubleshooting

### Issue: Email Confirmation Required

**Symptoms:**
- Can't login after signup
- "Confirm email" error

**Solution:**
1. Go to Supabase Dashboard
2. **Authentication** → **Providers** → **Email**
3. **TURN OFF** "Confirm email"
4. Save

### Issue: Company Slug Already Taken

**Symptoms:**
- Error during signup
- "Slug is already in use"

**Solution:**
- Change company name
- Or manually edit slug to be unique

### Issue: Profile Not Created

**Symptoms:**
- Company created but no profile
- Cannot login

**Solution:**
Check trigger exists:
```sql
-- Should return trigger details
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
```

If not, run:
```sql
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

### Issue: Super Admin Cannot Access Platform

**Symptoms:**
- Redirected away from platform pages
- "Unauthorized" errors

**Solution:**
```sql
-- Check super admin flag
SELECT id, email, is_super_admin FROM profiles 
WHERE email = 'your@email.com';

-- Set if not set
UPDATE profiles 
SET is_super_admin = true 
WHERE email = 'your@email.com';
```

### Issue: Client Not Showing in Database

**Symptoms:**
- Client placed order
- Not appearing in client database

**Solution:**
1. Check `orders` table has `client_id`
2. Check `profiles` table has client record
3. Verify `company_id` is set correctly
4. Check RLS policies allow viewing

### Issue: Company URL Not Working

**Symptoms:**
- 404 on `/{company-slug}`
- Cannot access company portal

**Solution:**
1. Verify slug exists in `companies` table
2. Check `is_active = true`
3. Clear browser cache
4. Try different slug format

---

## 📊 Database Schema Reference

### Companies Table
```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES auth.users(id),
  email TEXT,
  phone TEXT,
  currency TEXT DEFAULT 'ZAR',
  timezone TEXT DEFAULT 'Africa/Johannesburg',
  subscription_status TEXT DEFAULT 'trial',
  subscription_plan TEXT,
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Profiles Table
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT,
  full_name TEXT,
  phone TEXT,
  company_id UUID REFERENCES companies(id),
  company_slug TEXT,
  active_role TEXT,
  is_super_admin BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Orders Table
```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES profiles(id),
  company_id UUID REFERENCES companies(id),
  total NUMERIC(10,2),
  status TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 🎯 Quick Reference

### Important URLs

| Purpose | URL | Who Can Access |
|---------|-----|----------------|
| Homepage | `/` | Everyone |
| Company Signup | `/company-signup` | New companies |
| Generic Login | `/auth/login` | All users |
| Company Login | `/{company-slug}` | Company users |
| Platform Admin | `/cateringms-platform/catering-ms-dashboard` | Super admin |
| Company Database | `/cateringms-platform/company-database` | Super admin |
| Client Database | `/{company-slug}/admin/client-database` | Company admin |
| Onboarding | `/{company-slug}/admin/onboarding` | Company admin |

### Key Service Files

| Service | Purpose |
|---------|---------|
| `companyService.ts` | Company CRUD operations |
| `clientManagementService.ts` | Client database management |
| `roleService.ts` | Role assignments |
| `authService.ts` | Authentication operations |
| `orderService.ts` | Order management |
| `quoteService.ts` | Quote management |

### Contact Information

**Support:** 083 652 5755  
**Email:** support@cateringms.com  
**Website:** cateringms.com

---

## ✅ Pre-Launch Checklist

### Super Admin Setup
- [ ] Set `is_super_admin = true` for your profile
- [ ] Test access to platform dashboard
- [ ] Test company database view
- [ ] Verify search and filters work

### Company Signup
- [ ] Disable email confirmation in Supabase
- [ ] Test signup flow end-to-end
- [ ] Verify auto-login works
- [ ] Test success page URL copy
- [ ] Test different currencies
- [ ] Test slug validation

### Database Systems
- [ ] Test company database visibility
- [ ] Test client database per company
- [ ] Test manual client addition
- [ ] Test automatic client tracking
- [ ] Verify statistics calculate correctly
- [ ] Test detail modal all tabs

### Security
- [ ] Verify RLS policies are enabled
- [ ] Test unauthorized access prevention
- [ ] Test cross-company data isolation
- [ ] Verify password requirements

### Mobile Testing
- [ ] Test signup on mobile
- [ ] Test databases on mobile
- [ ] Test navigation on mobile
- [ ] Test forms on mobile

---

## 🎉 You're Ready!

Your CateringMS platform is now complete with:
- ✅ Multi-tenant architecture
- ✅ Company registration and onboarding
- ✅ Platform-level company management
- ✅ Company-level client management
- ✅ Automatic client tracking
- ✅ Role-based access control
- ✅ 14-day trial system
- ✅ Multi-currency support
- ✅ Comprehensive search and filtering
- ✅ Mobile-responsive interfaces

**Next Steps:**
1. Set your super admin flag
2. Test the complete signup flow
3. Register your first test company
4. Add some test clients
5. Explore the databases
6. Launch! 🚀