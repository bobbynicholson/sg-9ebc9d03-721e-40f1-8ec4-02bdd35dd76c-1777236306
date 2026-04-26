# CateringMS Test Credentials
**Company:** Spit Braai Delivery
**Company Slug:** `spit-braai-delivery`

---

## 🚨 SETUP REQUIRED - Manual Auth User Creation

Supabase requires auth users to be created through their Dashboard (not via SQL).

### ⚡ Quick 5-Minute Setup:

1. **Open Supabase Dashboard:** https://supabase.com/dashboard/project/YOUR_PROJECT_ID
2. **Go to:** Authentication → Users
3. **Create each user below** (click "Add user" for each):

---

## 📋 Users to Create (Copy/Paste These)

### User 1: Super Admin
```
Email: superadmin@cateringms.com
Password: Test123!
☑️ Auto Confirm User: ON
```

### User 2: Company Owner (Callum Rogers)
```
Email: hello@spitbraaidelivery.co.za
Password: Test123!
☑️ Auto Confirm User: ON
```

### User 3: Admin Staff
```
Email: admin@spitbraaidelivery.co.za
Password: Test123!
☑️ Auto Confirm User: ON
```

### User 4: Kitchen Staff
```
Email: kitchen@spitbraaidelivery.co.za
Password: Test123!
☑️ Auto Confirm User: ON
```

### User 5: Driver
```
Email: driver@spitbraaidelivery.co.za
Password: Test123!
☑️ Auto Confirm User: ON
```

### User 6: Shopping Staff
```
Email: shopping@spitbraaidelivery.co.za
Password: Test123!
☑️ Auto Confirm User: ON
```

### User 7: Cleaning Staff
```
Email: cleaning@spitbraaidelivery.co.za
Password: Test123!
☑️ Auto Confirm User: ON
```

### User 8: Client
```
Email: client@test.com
Password: Test123!
☑️ Auto Confirm User: ON
```

---

## ✅ After Creating Auth Users

Run the SQL script `spit_braai_test_data.sql` in your Supabase SQL Editor to create all the profile records automatically.

**The SQL script will:**
- Create profile records for each user
- Link them to the Spit Braai Delivery company
- Set correct roles and permissions

---

## 📋 Complete Reference Table

| # | Email | Password | Name | Role | Phone |
|---|-------|----------|------|------|-------|
| 1 | superadmin@cateringms.com | Test123! | Super Admin | super_admin | +27 11 111 1111 |
| 2 | hello@spitbraaidelivery.co.za | Test123! | Callum Rogers | company_admin | +27 82 222 2222 |
| 3 | admin@spitbraaidelivery.co.za | Test123! | Admin Staff | admin | +27 82 333 3333 |
| 4 | kitchen@spitbraaidelivery.co.za | Test123! | Chef John | kitchen_staff | +27 82 444 4444 |
| 5 | driver@spitbraaidelivery.co.za | Test123! | Driver Mike | driver | +27 82 555 5555 |
| 6 | shopping@spitbraaidelivery.co.za | Test123! | Shopping Sarah | shopping_staff | +27 82 666 6666 |
| 7 | cleaning@spitbraaidelivery.co.za | Test123! | Cleaning Lisa | cleaning_staff | +27 82 777 7777 |
| 8 | client@test.com | Test123! | Test Client | client | +27 82 888 8888 |

---

## 🔐 Login URLs

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

## 🔒 Security Notes

- ⚠️ **Development Only** - These credentials are for testing
- ⚠️ **Change ALL passwords** before production
- ⚠️ **Never use Test123!** in production
- ✅ **Enable MFA** for admin accounts in production

---

**Setup Time:** ~5 minutes (8 users × 30 seconds each)
**Status:** ⏳ Awaiting manual auth user creation
**Last Updated:** 2026-04-26
