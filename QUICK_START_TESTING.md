# 🚀 Quick Start - Testing CateringMS

## 📝 TL;DR - Get Testing in 5 Minutes

### Step 1: Create Test Users (2 minutes)
Go to Supabase Dashboard → Authentication → Add User (manually)

Create these 6 users (skip email confirmation for all):

```
1. admin@testcatering.com / TestAdmin123!
2. driver@testcatering.com / TestDriver123!
3. kitchen@testcatering.com / TestKitchen123!
4. cleaning@testcatering.com / TestCleaning123!
5. shopping@testcatering.com / TestShopping123!
6. client@testcatering.com / TestClient123!
```

### Step 2: Get User IDs (1 minute)
After creating each user, copy their UUID from the Supabase dashboard.

### Step 3: Run SQL Scripts (2 minutes)
Open Supabase SQL Editor and run the scripts from `TEST_DATA_SETUP_GUIDE.md`, replacing the UUIDs with the actual user IDs you copied.

The scripts will:
- Create profiles for each user
- Link them to "Test Catering" company
- Assign their departments/roles

### Step 4: Start Testing! 🎉

---

## 🔗 Test URLs

### Admin Portal
**URL**: `https://cateringms.com/test-catering/admin/dashboard`
**Login**: `admin@testcatering.com` / `TestAdmin123!`
**Test**: Create orders, manage users, view all data

### Driver Portal
**URL**: `https://cateringms.com/test-catering/driver/dashboard`
**Login**: `driver@testcatering.com` / `TestDriver123!`
**Test**: View assigned deliveries, update delivery status

### Kitchen Portal
**URL**: `https://cateringms.com/test-catering/kitchen/dashboard`
**Login**: `kitchen@testcatering.com` / `TestKitchen123!`
**Test**: Mark on duty, complete prep tasks, track food prep

### Cleaning Portal
**URL**: `https://cateringms.com/test-catering/cleaning/dashboard`
**Login**: `cleaning@testcatering.com` / `TestCleaning123!`
**Test**: Verify equipment, mark items broken/lost, complete cleaning tasks

### Shopping Portal
**URL**: `https://cateringms.com/test-catering/shopping/dashboard`
**Login**: `shopping@testcatering.com` / `TestShopping123!`
**Test**: Create shopping lists, manage suppliers, track orders

### Client Portal
**URL**: `https://cateringms.com/test-catering/client/my-orders`
**Login**: `client@testcatering.com` / `TestClient123!`
**Test**: View orders, track delivery, make payments

---

## ✅ Testing Checklist

### Authentication & Access
- [ ] Each user can login to their portal
- [ ] Users see only their company's data
- [ ] Correct permissions for each role
- [ ] Role switcher works for multi-role users

### Admin Portal
- [ ] Can view dashboard with company overview
- [ ] Can create new orders
- [ ] Can add/edit users
- [ ] Can assign departments to users
- [ ] Can view job progress overview
- [ ] Can access all admin settings

### Driver Portal
- [ ] Can see assigned deliveries
- [ ] Can update delivery status
- [ ] GPS tracking works
- [ ] Can confirm pickup/dropoff
- [ ] Can request replacement

### Kitchen Portal
- [ ] Can mark "on duty"
- [ ] Can see prep tasks for functions
- [ ] Can mark tasks complete
- [ ] Equipment handoff tracking works
- [ ] On-duty board shows current staff

### Cleaning Portal
- [ ] Can mark "on duty"
- [ ] Can verify returned equipment
- [ ] Can mark items as broken/lost
- [ ] Equipment tracking through workflow
- [ ] Broken equipment dashboard shows costs

### Shopping Portal
- [ ] Can create shopping lists
- [ ] Can manage suppliers
- [ ] Can track inventory
- [ ] Can place orders

### Client Portal
- [ ] Can view their orders
- [ ] Can track delivery status
- [ ] Can see payment schedule
- [ ] Can view invoices

---

## 🐛 Common Issues & Quick Fixes

### "Invalid login credentials"
- ✅ Make sure you created the user in Supabase Auth
- ✅ Check email spelling matches exactly
- ✅ Verify password is correct

### "Access denied" or blank screen
- ✅ Run the SQL scripts to create profiles
- ✅ Verify user_departments table has entries
- ✅ Check company_id is set correctly

### "No data showing"
- ✅ Verify company_id matches in all tables
- ✅ Check RLS policies are enabled
- ✅ Create sample orders for testing

### User can't switch roles
- ✅ Check user_departments table has multiple entries
- ✅ Verify RoleSwitcher component is visible
- ✅ Check active_role is updating in profiles

---

## 📊 Sample Data Creation (Optional)

Once users are set up, you can create sample data:

### Create a Test Order (as Admin)
1. Login as admin@testcatering.com
2. Go to Orders → Create New Order
3. Fill in event details
4. Assign equipment and staff
5. Save order

### Add Equipment Items (as Admin)
1. Go to Inventory
2. Click "Add Equipment"
3. Enter item details (plates, cutlery, etc.)
4. Set quantities

### Create Shopping List (as Shopping Staff)
1. Login as shopping@testcatering.com
2. Go to Shopping Dashboard
3. Create new shopping list
4. Add items needed

---

## 🎯 What to Look For During Testing

### User Experience
- Is navigation intuitive?
- Are role switches smooth?
- Do buttons respond quickly?
- Are error messages helpful?

### Data Accuracy
- Do totals calculate correctly?
- Are counts accurate?
- Does equipment tracking work end-to-end?
- Are timestamps correct?

### Security
- Can users access other companies' data? (they shouldn't)
- Can clients see admin features? (they shouldn't)
- Do RLS policies work correctly?

### Performance
- Do pages load quickly?
- Are there any console errors?
- Does real-time data update?

---

## 📞 Need Help?

### Documentation
- **Architecture**: `CATERINGMS_ARCHITECTURE.md`
- **Test Setup**: `TEST_DATA_SETUP_GUIDE.md`
- **Complete Summary**: `COMPLETE_REQUEST_SUMMARY.md`

### Database
- Check Supabase Dashboard for data
- Review RLS policies in Database → Policies
- Check Auth logs for login issues

---

## 🎉 Success Criteria

You'll know the system is working when:

✅ All 6 test users can login to their portals
✅ Each portal shows appropriate data and features
✅ Users can complete their core tasks
✅ Role switching works smoothly
✅ Equipment tracking flows through all departments
✅ No security leaks between companies
✅ Real-time updates work correctly

---

**Ready to test?** Start with Step 1 above and work through the checklist! 🚀

**Questions?** Check the detailed guides or review the database in Supabase Dashboard.

**Good luck with testing!** 💪
