
# 🎯 CateringMS Testing Credentials & Setup Guide

## 📊 Current System Status

### ✅ What's Working
- **Demo Page**: `/demo` displays all 6 portals with credentials
- **Test Company**: Database record exists (slug: `test-company`)
- **Auto-fill System**: SessionStorage pre-fills credentials on login
- **Login URLs**: All portals redirect to `/test-company/auth/login`
- **Company Registration**: `/company-signup` is functional
- **Role Assignment**: Admin can assign roles at `/test-company/admin/users`

### ⚠️ What Needs Setup
- **Demo Users**: All 6 demo users need to be manually registered (see instructions below)
- **Role Assignments**: After registration, roles must be assigned by admin

---

## 🚀 Complete Setup Process

### **STEP 1: Register All Demo Users**

Visit: `https://cateringms.com/test-company/auth/register`

Register each of these 6 users using the registration form:

#### 1️⃣ Admin User
```
Email: admin@test-company.com
Password: testadmin123
Full Name: Demo Admin
Phone: +27 11 111 1111
```

#### 2️⃣ Driver User
```
Email: driver@test-company.com
Password: testdriver123
Full Name: Demo Driver
Phone: +27 22 222 2222
```

#### 3️⃣ Kitchen User
```
Email: kitchen@test-company.com
Password: testkitchen123
Full Name: Demo Kitchen Manager
Phone: +27 33 333 3333
```

#### 4️⃣ Shopping User
```
Email: shopping@test-company.com
Password: testshopping123
Full Name: Demo Shopping Manager
Phone: +27 44 444 4444
```

#### 5️⃣ Cleaning User
```
Email: cleaning@test-company.com
Password: testcleaning123
Full Name: Demo Cleaning Manager
Phone: +27 55 555 5555
```

#### 6️⃣ Client User
```
Email: client@test-company.com
Password: testclient123
Full Name: Demo Client
Phone: +27 66 666 6666
```

**IMPORTANT**: All users will be created with "client" role by default. You'll need to assign proper roles in the next step.

---

### **STEP 2: Assign Roles**

1. **Login as Admin** (or as the test-company owner if different)
   - URL: `https://cateringms.com/test-company/auth/login`
   - Use admin credentials

2. **Navigate to User Management**
   - Go to: `https://cateringms.com/test-company/admin/users`

3. **Assign Roles to Each User**

For each user, click "Edit Departments" and assign:

| User Email | Department Role | Set as Primary? |
|-----------|----------------|----------------|
| admin@test-company.com | Admin | ✅ Yes |
| driver@test-company.com | Driver | ✅ Yes |
| kitchen@test-company.com | Kitchen Team | ✅ Yes |
| shopping@test-company.com | Shopping Team | ✅ Yes |
| cleaning@test-company.com | Cleaning Team | ✅ Yes |
| client@test-company.com | Client | ✅ Yes |

4. **Click "Save Departments"** for each user

---

### **STEP 3: Test the Demo System**

#### Test Each Portal:

1. **Visit Demo Page**: `https://cateringms.com/demo`

2. **Test Each Portal Login:**

**Admin Portal**
- Click "Login as Demo admin" button
- Should auto-fill credentials
- Should redirect to `/test-company/admin/dashboard`

**Driver Portal**
- Click "Login as Demo driver" button
- Should auto-fill credentials
- Should redirect to `/test-company/driver/dashboard`

**Kitchen Portal**
- Click "Login as Demo kitchen" button
- Should auto-fill credentials
- Should redirect to `/test-company/kitchen/dashboard`

**Shopping Portal**
- Click "Login as Demo shopping" button
- Should auto-fill credentials
- Should redirect to `/test-company/shopping/dashboard`

**Cleaning Portal**
- Click "Login as Demo cleaning" button
- Should auto-fill credentials
- Should redirect to `/test-company/cleaning/dashboard`

**Client Portal**
- Click "Login as Demo client" button
- Should auto-fill credentials
- Should redirect to `/test-company/client/my-orders`

---

## 🔐 Complete Credentials Reference

### Test Company Details
- **Company Name**: Test Company
- **Company Slug**: `test-company`
- **Base URL**: `https://cateringms.com/test-company`

### All Demo User Credentials

| Role | Email | Password | Dashboard URL |
|------|-------|----------|--------------|
| Admin | admin@test-company.com | testadmin123 | /test-company/admin/dashboard |
| Driver | driver@test-company.com | testdriver123 | /test-company/driver/dashboard |
| Kitchen | kitchen@test-company.com | testkitchen123 | /test-company/kitchen/dashboard |
| Shopping | shopping@test-company.com | testshopping123 | /test-company/shopping/dashboard |
| Cleaning | cleaning@test-company.com | testcleaning123 | /test-company/cleaning/dashboard |
| Client | client@test-company.com | testclient123 | /test-company/client/my-orders |

---

## 🛠️ Troubleshooting

### Issue: "Profile not found" after registration
**Cause**: Database trigger delay
**Solution**: Wait 2-3 seconds, then refresh. The retry logic should handle this automatically.

### Issue: Can't login after registration
**Cause**: Email confirmation may be enabled
**Solution**: 
1. Check Supabase Auth settings
2. Disable email confirmation for demo users
3. Or check email inbox for confirmation link

### Issue: Wrong dashboard after login
**Cause**: Role not set as primary or multiple roles assigned
**Solution**:
1. Go to `/test-company/admin/users`
2. Edit the user's departments
3. Ensure correct role is set as "Primary"
4. User must log out and log back in

### Issue: "Access Denied" when trying to access portal
**Cause**: Role not assigned correctly
**Solution**:
1. Verify role assignment in admin panel
2. Check that role is set as "Primary"
3. Ensure user is linked to `test-company`

### Issue: Auto-fill not working on login
**Cause**: SessionStorage not set or cleared
**Solution**:
1. Click the "Login as Demo User" button again from `/demo` page
2. Check browser console for errors
3. Try clearing browser cache

---

## 📋 Quick Testing Checklist

Use this checklist when testing the demo system:

### Registration & Setup
- [ ] All 6 demo users registered at `/test-company/auth/register`
- [ ] All users linked to `test-company` company
- [ ] Admin user assigned "Admin" role as primary
- [ ] Driver user assigned "Driver" role as primary
- [ ] Kitchen user assigned "Kitchen Team" role as primary
- [ ] Shopping user assigned "Shopping Team" role as primary
- [ ] Cleaning user assigned "Cleaning Team" role as primary
- [ ] Client user assigned "Client" role as primary

### Demo Page Testing
- [ ] Demo page loads at `/demo`
- [ ] All 6 portal cards displayed
- [ ] Credentials visible on each card
- [ ] "Copy Credentials" button works
- [ ] "Login as Demo User" button works for each portal

### Login Flow Testing
- [ ] Auto-fill credentials works
- [ ] Login succeeds for each user
- [ ] Correct dashboard loads after login
- [ ] Portal features are accessible
- [ ] Navigation works correctly

### Role-Based Access Testing
- [ ] Admin can access all admin pages
- [ ] Driver can only access driver portal
- [ ] Kitchen can only access kitchen portal
- [ ] Shopping can only access shopping portal
- [ ] Cleaning can only access cleaning portal
- [ ] Client can only access client portal

---

## 🎉 Success Criteria

The demo system is fully functional when:

1. ✅ All 6 users can login successfully
2. ✅ Each user lands on their correct dashboard
3. ✅ Auto-fill works from demo page
4. ✅ Role-based access control is enforced
5. ✅ Users can navigate their assigned portals
6. ✅ No console errors or authentication issues

---

## 📞 Next Steps After Demo Setup

Once demo is working:

1. **Add Sample Data**
   - Create sample orders for demonstration
   - Add sample equipment inventory
   - Populate with realistic demo data

2. **Test Key Features**
   - Order creation and management
   - Driver assignments
   - Kitchen prep lists
   - Equipment tracking
   - Client order viewing

3. **Document User Journeys**
   - Create guided tours for each portal
   - Document common workflows
   - Prepare demo scripts for sales

4. **Prepare for First Real Client**
   - Test complete onboarding flow
   - Verify trial system works
   - Ensure support channels ready

---

## 🔗 Important Links

- **Demo Page**: https://cateringms.com/demo
- **Registration**: https://cateringms.com/test-company/auth/register
- **Login**: https://cateringms.com/test-company/auth/login
- **Admin Panel**: https://cateringms.com/test-company/admin/users
- **Company Signup**: https://cateringms.com/company-signup

---

## 🚨 Security Note

⚠️ **IMPORTANT**: These demo credentials are publicly visible on the `/demo` page and in this documentation. They should ONLY be used with the `test-company` demo environment. Never use these credentials with real client data or production systems.

The test-company should be treated as a sandbox environment for demonstrations and testing only.
