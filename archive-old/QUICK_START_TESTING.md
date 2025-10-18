
# 🚀 Quick Start: Register Your First Demo User NOW

## ⚠️ Current Issue - "Invalid login credentials"

You're getting "Invalid login credentials" because **the demo users don't exist in Supabase Auth yet**.

**Why this happens:**
- The demo page shows credentials, but those users haven't been registered yet
- Supabase Auth requires users to be created through their authentication API
- We cannot create authentication records directly in the database (security requirement)

**The Solution:** Register the admin user first (takes 2 minutes) ⬇️

---

## ✅ STEP 1: Register the Admin User (DO THIS FIRST)

### 1.1 Open Registration Page

**Click this link or paste it in your browser:**
```
https://cateringms.com/test-company/auth/register
```

### 1.2 Fill in the Registration Form

Use these **exact credentials**:

```
Email: admin@test-company.com
Password: testadmin123
Full Name: Demo Admin
Phone: +27 11 111 1111
```

### 1.3 Click "Sign Up"

Wait for the success message (should take 2-3 seconds)

---

## ✅ STEP 2: Assign Admin Role

After registration, the user is created with "client" role by default. You need to assign the admin role.

### Option A: Use Supabase Dashboard (RECOMMENDED - Takes 1 minute)

1. **Go to your Supabase Dashboard**
   - Navigate to: `https://supabase.com/dashboard`
   - Select your project

2. **Open the profiles table**
   - Go to: **Table Editor** → **profiles**
   - Find the user with email `admin@test-company.com`
   - **Copy their `id`** (you'll need this in the next step)

3. **Insert admin role**
   - Go to: **Table Editor** → **user_departments**
   - Click **Insert** → **Insert row**
   - Fill in:
     ```
     user_id: [paste the id you copied]
     department: admin
     is_primary: true
     assigned_by: [paste the same id]
     ```
   - Click **Save**

4. **Update active role**
   - Go back to: **Table Editor** → **profiles**
   - Find the admin user row
   - Click **Edit**
   - Set `active_role` to: `admin`
   - Click **Save**

### Option B: Use SQL Editor in Supabase Dashboard (Alternative)

1. **Go to Supabase Dashboard** → **SQL Editor**

2. **Run this query** (replace USER_ID_HERE with the actual user ID):

```sql
-- Step 1: Get the user ID (run this first to get the ID)
SELECT id FROM profiles WHERE email = 'admin@test-company.com';

-- Step 2: Copy the ID from the result above, then run these queries:
-- (Replace USER_ID_HERE with the actual ID)

-- Insert admin role into user_departments
INSERT INTO user_departments (user_id, department, is_primary, assigned_by)
VALUES ('USER_ID_HERE', 'admin', true, 'USER_ID_HERE')
ON CONFLICT (user_id, department) 
DO UPDATE SET is_primary = true;

-- Update active role in profiles
UPDATE profiles 
SET active_role = 'admin' 
WHERE email = 'admin@test-company.com';
```

---

## ✅ STEP 3: Test Admin Login

1. **Visit the login page:**
   ```
   https://cateringms.com/test-company/auth/login
   ```

2. **Login with admin credentials:**
   ```
   Email: admin@test-company.com
   Password: testadmin123
   ```

3. **You should be redirected to:**
   ```
   https://cateringms.com/test-company/admin/dashboard
   ```

4. **Success!** 🎉 You now have admin access.

---

## 🎯 STEP 4: Register the Other 5 Demo Users

Now that you have admin access, register the remaining demo users:

**Visit:** `https://cateringms.com/test-company/auth/register`

Register each user:

### 2️⃣ Driver User
```
Email: driver@test-company.com
Password: testdriver123
Full Name: Demo Driver
Phone: +27 22 222 2222
```

### 3️⃣ Kitchen User
```
Email: kitchen@test-company.com
Password: testkitchen123
Full Name: Demo Kitchen Manager
Phone: +27 33 333 3333
```

### 4️⃣ Shopping User
```
Email: shopping@test-company.com
Password: testshopping123
Full Name: Demo Shopping Manager
Phone: +27 44 444 4444
```

### 5️⃣ Cleaning User
```
Email: cleaning@test-company.com
Password: testcleaning123
Full Name: Demo Cleaning Manager
Phone: +27 55 555 5555
```

### 6️⃣ Client User
```
Email: client@test-company.com
Password: testclient123
Full Name: Demo Client
Phone: +27 66 666 6666
```

---

## ✅ STEP 5: Assign Roles to All Users

After registering all users:

1. **Login as admin** at: `https://cateringms.com/test-company/auth/login`

2. **Go to User Management:**
   ```
   https://cateringms.com/test-company/admin/users
   ```

3. **For each user, assign their role:**

   | User Email | Role to Assign | Set as Primary |
   |-----------|----------------|----------------|
   | driver@test-company.com | **Driver** | ✅ Yes |
   | kitchen@test-company.com | **Kitchen Team** | ✅ Yes |
   | shopping@test-company.com | **Shopping Team** | ✅ Yes |
   | cleaning@test-company.com | **Cleaning Team** | ✅ Yes |
   | client@test-company.com | **Client** | ✅ Yes |

4. **Click "Edit Departments"** for each user, assign the role, and click **"Save Departments"**

---

## 🎉 STEP 6: Test the Complete Demo System

1. **Visit the demo page:**
   ```
   https://cateringms.com/demo
   ```

2. **Click "Login as Demo User" on any portal**

3. **Verify:**
   - ✅ Credentials auto-fill
   - ✅ Login succeeds
   - ✅ Correct dashboard loads
   - ✅ Portal features work

**Success!** Your demo system is now fully operational! 🚀

---

## 🛠️ Troubleshooting

### Still getting "Invalid login credentials"?

**Check these things:**

1. ✅ **User was registered** - Go to Supabase Dashboard → Authentication → Users. Look for the email.

2. ✅ **Using correct URL** - Must be `/test-company/auth/login`, NOT `/auth/login`

3. ✅ **Email confirmation disabled** - Go to Supabase Dashboard → Authentication → Settings. If "Enable email confirmations" is ON, you need to confirm the email first.

4. ✅ **Password is correct** - Passwords are case-sensitive. Double-check you're using the exact password.

### "Profile not found" after registration?

This means the database trigger didn't create the profile yet. Wait 2-3 seconds and refresh. The retry logic should handle this.

### Wrong dashboard after login?

1. Go to `/test-company/admin/users`
2. Click "Edit Departments" on the user
3. Make sure the correct role is marked as "Primary"
4. Save, then log out and log back in

### Auto-fill not working?

1. Click the "Login as Demo User" button again from `/demo`
2. Check browser console for errors
3. Try clearing browser cache

---

## 📞 Need More Help?

If you're stuck after following these steps:

1. **Check Supabase Dashboard** → Authentication → Users
   - Verify the user exists
   - Check their email confirmation status

2. **Check Supabase Dashboard** → Table Editor → profiles
   - Verify the profile was created
   - Check `company_slug` = `test-company`
   - Check `active_role` is set

3. **Share the error message** - Copy the exact error from the browser console and share it

---

## 🚀 What Happens After Setup?

Once all demo users are set up:

1. ✅ Demo page at `/demo` will work perfectly
2. ✅ "Login as Demo User" buttons will auto-fill and login
3. ✅ Each portal will be fully functional
4. ✅ Role-based access control will work correctly

You'll have a complete, working demo environment to showcase CateringMS! 🎉
