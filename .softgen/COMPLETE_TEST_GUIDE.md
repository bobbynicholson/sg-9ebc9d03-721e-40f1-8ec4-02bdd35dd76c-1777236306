
<![CDATA[
# Complete Testing Guide - Spit Braai Delivery

## 🎯 Quick Start

**Before Testing:**
1. ✅ All database users created
2. ❌ **YOU MUST:** Create auth accounts in Supabase (see TEST_CREDENTIALS.md)

---

## 🔐 Login URLs

- **Main Login:** `http://localhost:3000/auth/login`
- **Company Login:** `http://localhost:3000/spit-braai-delivery/login`
- **Super Admin:** `http://localhost:3000/super-admin`

---

## 📋 Test Scenario 1: Complete Order Lifecycle

### Step 1: Create Order (Admin)
**Login:** `admin@spitbraaidelivery.co.za` / `Test123!`

1. Go to **Admin Dashboard**
2. Click **"Orders"** in sidebar
3. Click **"New Order"** button
4. Fill in order details:
   - Client: Select or create test client
   - Event Date: Tomorrow
   - Guest Count: 50
   - Menu Items: Add items from menu
5. Click **"Create Order"**
6. **Expected:** Order created with status "pending"

### Step 2: Assign Staff (Admin)
1. Find the order you just created
2. Click **"Assign Staff"**
3. Assign:
   - **Kitchen:** Chef John
   - **Driver:** Driver Mike
4. Click **"Save Assignments"**
5. **Expected:** Notifications sent to kitchen and driver

### Step 3: Kitchen Preparation (Kitchen Staff)
**Login:** `kitchen@spitbraaidelivery.co.za` / `Test123!`

1. Go to **Kitchen Dashboard**
2. View **"My Orders"** section
3. Find assigned order
4. Click **"Start Preparation"**
5. Mark items as completed
6. Click **"Mark as Ready"**
7. **Expected:** Order status → "ready"

### Step 4: Delivery (Driver)
**Login:** `driver@spitbraaidelivery.co.za` / `Test123!`

1. Go to **Driver Dashboard**
2. View **"My Deliveries"** section
3. Click on assigned delivery
4. Click **"Start GPS Tracking"**
5. Click **"Start Delivery"**
6. **Expected:** Order status → "out_for_delivery"
7. Click **"Complete Delivery"**
8. **Expected:** Order status → "delivered"

### Step 5: Client Tracking (Client)
**Login:** `client@test.com` / `Test123!`

1. Go to **Client Portal**
2. View **"My Orders"**
3. Click on active order
4. **Expected:** See real-time status updates
5. **Expected:** See driver location on map (if GPS enabled)

---

## 📋 Test Scenario 2: Inventory Management

### Low Stock Alerts (Shopping Staff)
**Login:** `shopping@spitbraaidelivery.co.za` / `Test123!`

1. Go to **Shopping Dashboard**
2. View **"Low Stock Alerts"**
3. **Expected:** See 5 items below minimum stock
4. Click **"Create Shopping List"**
5. **Expected:** Shopping list created with needed items

### Stock Updates (Admin)
**Login:** `admin@spitbraaidelivery.co.za` / `Test123!`

1. Go to **Inventory**
2. Find item with low stock
3. Click **"Update Stock"**
4. Enter new quantity
5. **Expected:** Stock updated, alert cleared if above minimum

---

## 📋 Test Scenario 3: Real-Time Notifications

### Test Notification System
1. **Login as Admin:** Create new order
2. **Login as Kitchen:** Should see notification bell with "1"
3. Click notification bell
4. **Expected:** See "New order assigned" notification
5. Click notification
6. **Expected:** Navigate to order details

### Test Email Notifications
1. Create order and change status
2. Check email automation log:
   - **Login as Admin:** Go to Settings → Email Automation
3. **Expected:** See queued emails for status changes

---

## 📋 Test Scenario 4: Multi-Role Switching

### Test Role Switcher (Owner)
**Login:** `hello@spitbraaidelivery.co.za` / `Test123!`

1. Click **Role Switcher** in top right
2. Switch to **"Kitchen Staff"** view
3. **Expected:** See Kitchen Dashboard
4. Switch to **"Driver"** view
5. **Expected:** See Driver Dashboard
6. Switch back to **"Admin"** view

---

## 📋 Test Scenario 5: GPS Tracking

### Test Driver GPS (Driver)
**Login:** `driver@spitbraaidelivery.co.za` / `Test123!`

1. Go to **Routes**
2. Click **"Enable GPS Tracking"**
3. **Expected:** Location permission requested
4. Allow location access
5. **Expected:** GPS coordinates updated in database
6. **View on Admin Dashboard:**
   - Login as admin
   - Go to **Tracking**
   - **Expected:** See driver's location on map

---

## 📋 Test Scenario 6: Company Isolation

### Verify Data Isolation
1. **Login as Spit Braai Delivery Admin**
2. Note number of orders visible
3. **Create second company** (Super Admin)
4. **Create order for second company**
5. **Login back as Spit Braai Admin**
6. **Expected:** Still see only original number of orders
7. **Conclusion:** Company isolation working ✅

---

## 🐛 Common Issues & Fixes

### Issue: "No companies found"
**Fix:** Run the SQL in database to create company:
```sql
SELECT * FROM companies WHERE slug = 'spit-braai-delivery';
-- If empty, company wasn't created. Check earlier setup steps.
```

### Issue: Can't login
**Fix:** 
1. Verify auth account exists in Supabase
2. Check email confirmation is disabled
3. Try password reset

### Issue: "Access Denied"
**Fix:**
1. Verify user's role in profiles table
2. Check company_id matches
3. Verify RLS policies are enabled

### Issue: No notifications appearing
**Fix:**
1. Check notification bell component is rendering
2. Verify notifications table has records
3. Check real-time subscription is active

### Issue: GPS not working
**Fix:**
1. Ensure HTTPS or localhost (required for geolocation)
2. Check browser permissions
3. Verify gps_tracking table exists

---

## ✅ Verification Checklist

After testing, verify:

- [ ] All 8 roles can login
- [ ] Each role sees appropriate dashboard
- [ ] Orders can be created and assigned
- [ ] Status updates trigger notifications
- [ ] Kitchen can view and update prep status
- [ ] Driver can view routes and update delivery status
- [ ] Client can track orders in real-time
- [ ] Inventory low stock alerts working
- [ ] Shopping lists can be created
- [ ] Cleaning schedules visible
- [ ] Company isolation prevents data leakage
- [ ] GPS tracking updates in real-time
- [ ] Email notifications queued correctly
- [ ] Role switcher works for multi-role users

---

## 📊 Expected Test Data

After setup, you should have:
- ✅ 1 company (Spit Braai Delivery)
- ✅ 8 users (all roles)
- ✅ 12 inventory items
- ✅ 10 menu items
- ✅ 3 suppliers
- ✅ 3 sample orders (with assignments)

---

## 🎓 Learning Resources

- **User Roles:** See ROLE_BASED_NAVIGATION_GUIDE.md
- **Feature List:** See PLATFORM_FEATURE_MAPPING.md
- **Email System:** See EMAIL_NOTIFICATION_SYSTEM.md
- **GPS Tracking:** See ROUTE_OPTIMIZATION_GUIDE.md

---

**Status:** ✅ Ready for comprehensive testing
**Last Updated:** 2026-04-26
</CDATA>
