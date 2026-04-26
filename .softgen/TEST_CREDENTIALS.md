
# CateringMS Test Credentials
**Company:** Spit Braai Delivery
**Company Slug:** `spit-braai-delivery`

---

## 🚀 QUICK SETUP - Create All 8 Users at Once

### Step-by-Step in Supabase Dashboard:

1. **Open Supabase Dashboard:** https://supabase.com/dashboard
2. **Select your project**
3. **Go to:** Authentication → Users
4. **For EACH user below, click "Add User" and fill in:**

---

## 👥 User #1: Super Admin
- Click **"Create New User"**
- **Email:** `superadmin@cateringms.com`
- **Password:** `Test123!`
- ✅ Toggle **"Auto Confirm User"** to ON
- Click **"Create User"**

## 👥 User #2: Company Owner (Callum Rogers)
- Click **"Create New User"**
- **Email:** `hello@spitbraaidelivery.co.za`
- **Password:** `Test123!`
- ✅ Toggle **"Auto Confirm User"** to ON
- Click **"Create User"**

## 👥 User #3: Staff (Admin)
- Click **"Create New User"**
- **Email:** `admin@spitbraaidelivery.co.za`
- **Password:** `Test123!`
- ✅ Toggle **"Auto Confirm User"** to ON
- Click **"Create User"**

## 👥 User #4: Kitchen Staff
- Click **"Create New User"**
- **Email:** `kitchen@spitbraaidelivery.co.za`
- **Password:** `Test123!`
- ✅ Toggle **"Auto Confirm User"** to ON
- Click **"Create User"**

## 👥 User #5: Driver
- Click **"Create New User"**
- **Email:** `driver@spitbraaidelivery.co.za`
- **Password:** `Test123!`
- ✅ Toggle **"Auto Confirm User"** to ON
- Click **"Create User"**

## 👥 User #6: Shopping Staff
- Click **"Create New User"**
- **Email:** `shopping@spitbraaidelivery.co.za`
- **Password:** `Test123!`
- ✅ Toggle **"Auto Confirm User"** to ON
- Click **"Create User"**

## 👥 User #7: Cleaning Staff
- Click **"Create New User"**
- **Email:** `cleaning@spitbraaidelivery.co.za`
- **Password:** `Test123!`
- ✅ Toggle **"Auto Confirm User"** to ON
- Click **"Create User"**

## 👥 User #8: Client (Test Client Portal)
- Click **"Create New User"**
- **Email:** `client@test.com`
- **Password:** `Test123!`
- ✅ Toggle **"Auto Confirm User"** to ON
- Click **"Create User"**

---

## ✅ After Creating All Auth Users

The database will **automatically create profiles** for each user with the correct roles via database triggers.

**Verify Setup:**
1. Go to **Database** → **Table Editor** → **profiles**
2. You should see all 8 users with their roles assigned

---

## 📋 Complete User List (Reference)

| # | Email | Password | Name | Role | Phone |
|---|-------|----------|------|------|-------|
| 1 | superadmin@cateringms.com | Test123! | Super Admin | super_admin | +27 11 111 1111 |
| 2 | hello@spitbraaidelivery.co.za | Test123! | Callum Rogers | company_admin | +27 82 222 2222 |
| 3 | admin@spitbraaidelivery.co.za | Test123! | Admin Staff | staff | +27 82 333 3333 |
| 4 | kitchen@spitbraaidelivery.co.za | Test123! | Chef John | kitchen_staff | +27 82 444 4444 |
| 5 | driver@spitbraaidelivery.co.za | Test123! | Driver Mike | driver | +27 82 555 5555 |
| 6 | shopping@spitbraaidelivery.co.za | Test123! | Shopping Sarah | shopping_staff | +27 82 666 6666 |
| 7 | cleaning@spitbraaidelivery.co.za | Test123! | Cleaning Lisa | cleaning_staff | +27 82 777 7777 |
| 8 | client@test.com | Test123! | Test Client | client | +27 82 888 8888 |

---

## 🔐 Login Instructions

### Company Users (Most Common):
**URL:** `http://localhost:3000/spit-braai-delivery/login`
- Use emails 2-8 from the table above

### Super Admin Only:
**URL:** `http://localhost:3000/super-admin`
- Use: superadmin@cateringms.com / Test123!

### Main Public Login (Auto-detects company):
**URL:** `http://localhost:3000/auth/login`
- Works with any email above

---

## 🧪 Quick Test

After creating all users:

1. **Login as Owner:** hello@spitbraaidelivery.co.za
2. **Expected:** See company dashboard
3. **Try Role Switcher** (top right)
4. **Switch to different roles** - test Kitchen, Driver, etc.

---

## 🔒 Security Notes

- ⚠️ **Development Only** - These credentials are for testing
- ⚠️ **Change ALL passwords** before production
- ⚠️ **Never use Test123!** in production
- ✅ **Enable MFA** for admin accounts in production

---

**Setup Time:** ~5 minutes (8 users × 30 seconds each)
**Status:** ✅ Ready for testing once auth users created
**Last Updated:** 2026-04-26
