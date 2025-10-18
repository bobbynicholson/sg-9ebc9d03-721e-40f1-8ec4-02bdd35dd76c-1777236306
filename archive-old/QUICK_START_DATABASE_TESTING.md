# Quick Start: Database Testing Guide

## 🚀 Get Started in 5 Minutes

This guide will walk you through testing both database systems step-by-step.

---

## ⚡ Step 1: Set Yourself as Super Admin (1 minute)

### Option A: Using Supabase Dashboard (Easiest)

1. Go to your Supabase Dashboard
2. Click **Table Editor** in left sidebar
3. Click on **profiles** table
4. Find your email: `alex@cateringms.com`
5. Click the edit icon (pencil) on your row
6. Scroll to find `is_super_admin` checkbox
7. **Check the box** ✅
8. Click **Save**

### Option B: Using SQL Editor

1. Go to Supabase Dashboard → **SQL Editor**
2. Click **New Query**
3. Paste this SQL:
```sql
UPDATE profiles 
SET is_super_admin = true 
WHERE email = 'alex@cateringms.com';
```
4. Click **Run** (or press Ctrl+Enter)
5. Should see: "Success. No rows returned"

**✅ Verification:** Run this query to confirm:
```sql
SELECT email, is_super_admin FROM profiles WHERE email = 'alex@cateringms.com';
```
Should show: `is_super_admin = true`

---

## 🏢 Step 2: Test Company Database (2 minutes)

### Access Platform Admin

1. **Login** to your CateringMS account at `/auth/login`
2. **Navigate** to: `/cateringms-platform/catering-ms-dashboard`
3. **Look for** "Company Database Management" card
4. **Click** on it

### What You Should See

✅ **Page loads** at `/cateringms-platform/company-database`  
✅ **Statistics cards** showing total companies  
✅ **Search box** at top  
✅ **Filter dropdown** for subscription status  
✅ **Company cards** with:
- Company name
- Slug (URL)
- Owner name & email
- Currency
- Status badge (Trial/Active/Past Due/Cancelled)
- Created date
- Action buttons

### Test These Features

1. **Search:** Type a company name → Results filter instantly
2. **Filter:** Select "Trial" status → Shows only trial companies
3. **View Dashboard:** Click "View Dashboard" button → Opens company portal
4. **Refresh:** Click refresh icon → Data reloads

---

## 👥 Step 3: Test Client Database (2 minutes)

### Access Company Admin Portal

1. **Pick any company** from the company database
2. **Note its slug** (e.g., "test-catering-co")
3. **Visit:** `/{company-slug}/admin/client-database`
   - Example: `/test-catering-co/admin/client-database`

### What You Should See

✅ **Statistics Dashboard** showing:
- Total Clients (with active/inactive breakdown)
- Total Orders
- Total Revenue
- Total Quotes & Leads

✅ **Client Table** with columns:
- Client Name
- Email
- Phone
- Orders count
- Revenue
- Last Order
- Status
- Actions

### Test These Features

1. **Add Client:**
   - Click "Add Client" button
   - Fill in: Name, Email, Phone
   - Submit
   - Client appears in list ✅

2. **Search Client:**
   - Type name/email/phone in search box
   - Results filter instantly ✅

3. **View Details:**
   - Click "View Details" on any client
   - Modal opens with 3 tabs ✅
   - **Orders Tab:** Shows all orders
   - **Quotes Tab:** Shows all quotes
   - **Leads Tab:** Shows all leads

4. **Statistics Update:**
   - Add a client → Total Clients increases ✅
   - Statistics recalculate automatically ✅

---

## 🧪 Step 4: Test Complete Flow (Bonus)

### Register a Test Company

1. **Go to:** `/company-signup`
2. **Fill form:**
   - Company Name: "Test Catering 2025"
   - Slug: Auto-generated (or edit)
   - Currency: ZAR
   - Owner Name: "Test Owner"
   - Email: "test2025@example.com"
   - Phone: "+27123456789"
   - Password: "test123"
3. **Submit**
4. **Expected:**
   - ✅ Success page shows
   - ✅ Company URL displayed with copy button
   - ✅ Auto-logged in
   - ✅ Can click "Start Onboarding" or "Go to Dashboard"

### Verify New Company Appears

1. **Logout** from test account
2. **Login** as super admin (alex@cateringms.com)
3. **Go to:** `/cateringms-platform/company-database`
4. **Look for:** "Test Catering 2025"
5. **Should see:**
   - ✅ New company in list
   - ✅ Status: Trial (blue badge)
   - ✅ Owner: Test Owner
   - ✅ Created: Today's date

---

## ✅ Success Checklist

Mark each as you test:

### Super Admin Setup
- [ ] `is_super_admin` flag set to true
- [ ] Can access `/cateringms-platform/catering-ms-dashboard`
- [ ] Dashboard cards display correctly

### Company Database (Platform Level)
- [ ] Can access `/cateringms-platform/company-database`
- [ ] All companies visible in list
- [ ] Search works
- [ ] Filter by status works
- [ ] Can view company dashboard
- [ ] Statistics show correctly

### Client Database (Company Level)
- [ ] Can access `/{slug}/admin/client-database`
- [ ] Statistics dashboard displays
- [ ] Can add client manually
- [ ] Search works by name/email/phone
- [ ] Detail modal opens with all tabs
- [ ] Client list updates after adding client

### Company Signup
- [ ] Can access `/company-signup`
- [ ] Slug validation works
- [ ] Form submits successfully
- [ ] Success page shows company URL
- [ ] Copy button works
- [ ] Auto-login works
- [ ] New company appears in company database

---

## 🐛 Common Issues & Quick Fixes

### Issue: "Unauthorized" when accessing platform dashboard
**Fix:** 
```sql
UPDATE profiles SET is_super_admin = true WHERE email = 'alex@cateringms.com';
```

### Issue: Can't login after company signup
**Fix:** Disable email confirmation in Supabase:
1. Supabase Dashboard → Authentication → Providers → Email
2. **Turn OFF** "Confirm email"
3. Save

### Issue: Company slug already taken
**Fix:** Choose a different company name or manually edit the slug

### Issue: Client database shows no clients
**Fix:** This is normal for new companies. Either:
1. Add a client manually (click "Add Client")
2. Create an order with a client
3. Submit a quote request

### Issue: Statistics showing 0
**Fix:** Add some test data:
- Create a manual client
- Or create an order
- Or submit a quote
- Statistics will update automatically

---

## 📱 Mobile Testing

After desktop testing works, test on mobile:

1. **Open on phone:** Visit your CateringMS URL
2. **Login:** Use super admin account
3. **Test navigation:** Hamburger menu should work
4. **Test company database:** Cards should be responsive
5. **Test client database:** Table should scroll horizontally
6. **Test forms:** Add client form should work on mobile

---

## 🎯 What Success Looks Like

When everything works, you should be able to:

1. ✅ **Super Admin View:** See all companies on the platform
2. ✅ **Company Admin View:** See all clients in your company
3. ✅ **Automatic Tracking:** Clients appear when orders/quotes/leads created
4. ✅ **Manual Addition:** Add clients directly to database
5. ✅ **Complete History:** View all client interactions
6. ✅ **Statistics:** See real-time metrics
7. ✅ **Search & Filter:** Find specific companies/clients quickly
8. ✅ **Mobile Responsive:** Works on all devices

---

## 📞 Need Help?

If something doesn't work:

1. **Check browser console** for errors (F12)
2. **Check Supabase logs** in dashboard
3. **Verify RLS policies** are enabled
4. **Check database records** exist

**Support:**
- Phone: 083 652 5755
- Email: support@cateringms.com

---

## 🎉 You're Done!

Once all checkboxes are marked, your database systems are fully tested and ready for production.

**Next Steps:**
1. Add real companies (or keep test data)
2. Invite your first real catering company
3. Monitor company growth in company database
4. Help companies manage their clients
5. Launch and grow! 🚀