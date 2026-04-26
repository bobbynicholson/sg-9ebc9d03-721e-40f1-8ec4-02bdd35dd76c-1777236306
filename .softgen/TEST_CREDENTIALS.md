# CateringMS Test Credentials
**Company:** Spit Braai Delivery
**Company Slug:** `spit-braai-delivery`

---

## ✅ ALL USERS CREATED - Ready to Login!

All 8 test users have been created in the database with confirmed emails and correct passwords.

---

## 📋 Complete User List

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

**Setup Time:** ✅ COMPLETE - Users created via SQL
**Status:** ✅ Ready for testing immediately
**Last Updated:** 2026-04-26
