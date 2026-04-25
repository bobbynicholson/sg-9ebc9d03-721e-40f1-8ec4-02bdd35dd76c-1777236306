# Complete A-Z Testing Guide for Spit Braai Delivery

## 🎯 Quick Access

### God Mode Login
- **URL:** `/auth/login`
- **Button:** Click "🔧 DEV MODE - Super Admin Login (God Mode)"
- **Email:** hello@spitbraaidelivery.co.za
- **Password:** Password123!
- **Features:** Access all roles, bypass all restrictions, test everything

### Role Switcher
- **Location:** Top-right header (next to theme toggle)
- **Icon:** User/role icon
- **Roles Available:** All 13 roles (Super Admin, Company Admin, Driver, Kitchen, Shopping, Cleaning, Client, etc.)

## 📧 Test Accounts (@spitbraaidelivery.co.za)

### Super Admin (Owner)
- **Email:** hello@spitbraaidelivery.co.za
- **Name:** Callum Rogers
- **Password:** Password123!
- **Access:** Everything
- **Dashboard:** /super-admin/dashboard

### Driver
- **Email:** driver@spitbraaidelivery.co.za
- **Name:** Mike Driver
- **Password:** Driver123!
- **Dashboard:** /team-portal/driver/dashboard

### Kitchen Staff
- **Email:** kitchen@spitbraaidelivery.co.za
- **Name:** Sarah Kitchen
- **Password:** Kitchen123!
- **Dashboard:** /team-portal/kitchen/dashboard

### Shopping Staff
- **Email:** shopping@spitbraaidelivery.co.za
- **Name:** Tom Shopper
- **Password:** Shopping123!
- **Dashboard:** /team-portal/shopping/dashboard

### Cleaning Staff
- **Email:** cleaning@spitbraaidelivery.co.za
- **Name:** Jane Cleaner
- **Password:** Cleaning123!
- **Dashboard:** /team-portal/cleaning/dashboard

### Client
- **Email:** client@spitbraaidelivery.co.za
- **Name:** Emma Client
- **Password:** Client123!
- **Dashboard:** /client-portal/dashboard

## 🔥 Pre-Loaded Test Data

### Company Details
- **Name:** Spit Braai Delivery
- **Slug:** spit-braai-delivery
- **Owner:** Callum Rogers
- **Currency:** ZAR (South African Rand)
- **Location:** South Africa

### Menu Items (10)
1. Lamb Spit Braai - R250/kg
2. Pork Spit Braai - R180/kg
3. Beef Spit Braai - R220/kg
4. Chicken Spit Braai - R160/kg
5. Vegetarian Platter - R120/serving
6. Traditional Salads - R45/serving
7. Pap & Chakalaka - R35/serving
8. Garlic Bread - R25/loaf
9. Dessert Platter - R60/serving
10. Beverages - R15/serving

### Inventory Items (12)
1. Lamb Leg (20kg in stock)
2. Pork Shoulder (15kg in stock)
3. Beef Brisket (25kg in stock)
4. Chicken Pieces (30kg in stock)
5. Fresh Vegetables (50kg in stock)
6. Charcoal (100kg in stock)
7. Wood Chips (80kg in stock)
8. Spices & Marinades (10kg in stock)
9. Bread & Rolls (100 units in stock)
10. Salad Ingredients (40kg in stock)
11. Dessert Ingredients (15kg in stock)
12. Drinks & Beverages (200 units in stock)

### Suppliers (3)
1. **Karoo Meat Suppliers** - Premium meat provider
2. **Cape Fresh Produce** - Vegetables and fresh ingredients
3. **Spice Route Trading** - Spices and dry goods

### Sample Orders (6)
- **Today:** 3 orders (confirmed, preparing, ready for pickup)
- **Tomorrow:** 2 orders (confirmed, preparing)
- **Next Week:** 1 order (confirmed)

## 🧪 Complete Testing Flow (A-Z)

### Phase 1: Client Booking (10 min)
**Role:** Client
**Login:** client@spitbraaidelivery.co.za / Client123!

1. Navigate to `/client-portal/dashboard`
2. Click "New Booking" or "Request Quote"
3. Fill in event details:
   - Event name: "Corporate Launch Party"
   - Event date: [Pick a future date]
   - Guest count: 100
   - Menu selections: Lamb spit braai, Traditional salads, Pap & chakalaka
4. Submit booking request
5. View order status in "My Orders"
6. Check email for confirmation (if real inbox set up)

### Phase 2: Admin Order Management (15 min)
**Role:** Super Admin or Company Admin
**Login:** Use God Mode or hello@spitbraaidelivery.co.za

1. Navigate to `/admin/dashboard` or `/spit-braai-delivery/admin/dashboard`
2. View incoming order in "Recent Orders"
3. Click into order details
4. Review client requirements
5. Assign staff:
   - Click "Assign Driver" → Select "Mike Driver"
   - Click "Assign Kitchen Staff" → Select "Sarah Kitchen"
6. Update order status:
   - Change from "pending" to "confirmed"
7. Send confirmation email to client
8. Set payment schedule
9. Add kitchen instructions (special requests, allergies, etc.)

### Phase 3: Kitchen Preparation (20 min)
**Role:** Kitchen Staff
**Login:** kitchen@spitbraaidelivery.co.za / Kitchen123!

1. Navigate to `/team-portal/kitchen/dashboard`
2. **Clock In:**
   - Click "Start Duty" in the Duty Status widget
   - Verify your name appears in "On Duty Staff"
3. **View Today's Production Priority:**
   - See the "Corporate Launch Party" order at the top
   - Note: 100 guests, event time, urgency level
4. **Prep Tasks:**
   - Open the order card
   - Complete prep checklist:
     - ✅ Click "Food Ready" (lamb is cooked)
     - ✅ Click "Cutlery Ready" (cutlery packed)
     - ✅ Click "Crockery Ready" (plates packed)
     - ✅ Click "Ready for Pickup" (order complete)
5. **Check Low Stock Alerts:**
   - View "Low Stock Alerts" card
   - Note items below minimum stock
   - Notify shopping staff
6. **Clock Out:**
   - Click "End Duty"
   - Add notes: "All prep completed, 100 guest portions ready"

### Phase 4: Shopping & Inventory (15 min)
**Role:** Shopping Staff
**Login:** shopping@spitbraaidelivery.co.za / Shopping123!

1. Navigate to `/team-portal/shopping/dashboard`
2. **Check Low Stock:**
   - View "Low Stock Items" widget
   - Identify critical items (e.g., Lamb Leg: 5kg remaining, minimum: 15kg)
3. **Create Purchase Order:**
   - Click "New Purchase Order"
   - Select supplier: "Karoo Meat Suppliers"
   - Add items:
     - Lamb Leg: 20kg @ R200/kg = R4000
     - Pork Shoulder: 15kg @ R150/kg = R2250
   - Total: R6250
   - Submit order
4. **Update Inventory (when stock arrives):**
   - Go to "Inventory" tab
   - Find "Lamb Leg"
   - Update current stock: 25kg
   - Update cost per unit if changed
   - Save changes
5. **Verify Stock Levels:**
   - Confirm "Low Stock Alerts" cleared

### Phase 5: Driver Delivery (25 min)
**Role:** Driver
**Login:** driver@spitbraaidelivery.co.za / Driver123!

1. Navigate to `/team-portal/driver/dashboard`
2. **View Assigned Deliveries:**
   - See "Corporate Launch Party" in "Today's Deliveries"
   - Note: 100 guests, pickup time, delivery address
3. **Check Readiness:**
   - Verify kitchen status: "Ready for Pickup" ✅
   - View packing checklist:
     - Food: ✅ Ready
     - Cutlery: ✅ Ready
     - Crockery: ✅ Ready
4. **Load Vehicle:**
   - Click "Mark as Loaded"
   - Take photos of loaded items
   - Add notes: "All items loaded and secured"
5. **Start Delivery:**
   - Click "Depart for Delivery"
   - GPS tracking starts automatically
6. **En Route:**
   - Update status: "En Route to Venue"
   - View route on map
   - Notify client of ETA
7. **Arrive at Venue:**
   - Click "Arrived at Venue"
   - Unload items
   - Set up spit braai station
8. **Setup Complete:**
   - Take setup photos
   - Get client signature for delivery
   - Click "Delivery Complete"
9. **Post-Event:**
   - After event, click "Start Equipment Collection"
   - Pack all equipment
   - Take photos of collected items
   - Click "Collection Complete"
   - Return to base

### Phase 6: Cleaning & Equipment (15 min)
**Role:** Cleaning Staff
**Login:** cleaning@spitbraaidelivery.co.za / Cleaning123!

1. Navigate to `/team-portal/cleaning/dashboard`
2. **Equipment Return Check:**
   - View "Equipment to Clean" list
   - See items from "Corporate Launch Party"
   - Verify all items returned
3. **Cleaning Tasks:**
   - Click into "Corporate Launch Party" equipment
   - Mark items as cleaned:
     - ✅ Spit braai machine: Cleaned
     - ✅ Serving trays: Cleaned
     - ✅ Cutlery sets: Cleaned & sanitized
     - ✅ Crockery: Cleaned & sanitized
4. **Damage/Issues Reporting:**
   - If broken items found:
     - Click "Report Broken Equipment"
     - Select item: "Serving tray (cracked)"
     - Upload photo
     - Add notes: "Crack on corner, still usable"
     - Submit report
5. **Equipment Verification:**
   - Go to "Equipment Inventory"
   - Update status: All items clean and ready
   - Set next availability date
6. **Cleaning Supplies Stock:**
   - Check cleaning supply levels
   - Create purchase order if low

### Phase 7: Client Feedback & Billing (10 min)
**Role:** Client
**Login:** client@spitbraaidelivery.co.za / Client123!

1. Navigate to `/client-portal/dashboard`
2. **View Completed Event:**
   - See "Corporate Launch Party" status: "Completed"
   - View event summary
3. **Leave Feedback:**
   - Click "Leave Feedback"
   - Rating: 5 stars
   - Comment: "Fantastic service! The lamb spit braai was incredible. Setup and cleanup were seamless. Highly recommend!"
   - Submit feedback
4. **View Invoice:**
   - Click "View Invoice"
   - Review line items:
     - Lamb Spit Braai (100 portions): R25,000
     - Traditional Salads (100 servings): R4,500
     - Pap & Chakalaka (100 servings): R3,500
     - Delivery & Setup: R2,000
     - Total: R35,000
5. **Make Payment:**
   - Click "Pay Now"
   - Select payment method: Credit Card / EFT
   - Complete payment
   - Download receipt

### Phase 8: Admin Reporting (10 min)
**Role:** Super Admin
**Login:** Use God Mode

1. Navigate to `/admin/financial-dashboard`
2. **View Order Revenue:**
   - See "Corporate Launch Party" revenue: R35,000
   - View profit margin (after costs)
3. **Check Staff Performance:**
   - View kitchen duty hours
   - Check driver delivery times
   - Review cleaning completion rates
4. **Inventory Cost Analysis:**
   - See cost of goods sold
   - View inventory turnover
   - Check supplier payment status
5. **Generate Reports:**
   - Click "Generate Monthly Report"
   - Download PDF with:
     - Total orders
     - Revenue breakdown
     - Staff performance
     - Inventory usage
     - Client satisfaction scores

## 🌐 Real Email Setup (Optional)

### How to Connect Real Inboxes
If you have access to `@spitbraaidelivery.co.za` email hosting:

1. **Create Email Accounts:**
   - hello@spitbraaidelivery.co.za (already exists - Callum)
   - driver@spitbraaidelivery.co.za (Mike Driver)
   - kitchen@spitbraaidelivery.co.za (Sarah Kitchen)
   - shopping@spitbraaidelivery.co.za (Tom Shopper)
   - cleaning@spitbraaidelivery.co.za (Jane Cleaner)
   - client@spitbraaidelivery.co.za (Emma Client - test customer)

2. **Test Email Flows:**
   - New booking confirmation → Client email
   - Order assigned → Driver email
   - Kitchen tasks ready → Driver email
   - Low stock alert → Shopping email
   - Equipment issues → Cleaning email + Admin
   - Invoice sent → Client email
   - Payment confirmation → Client + Admin

3. **Verify Email Content:**
   - Check email templates
   - Verify branding (logo, colors)
   - Test links (dashboard, invoice payment, etc.)
   - Check mobile responsiveness

## 🚨 Common Testing Scenarios

### Scenario 1: Last-Minute Order Change
1. Client requests menu change after confirmation
2. Admin updates order items
3. Kitchen sees updated requirements
4. Shopping adjusts ingredient orders
5. Client receives updated invoice

### Scenario 2: Driver Replacement
1. Driver calls in sick
2. Admin assigns replacement driver
3. New driver sees order in dashboard
4. Client receives notification of driver change
5. Delivery proceeds normally

### Scenario 3: Equipment Shortage
1. Kitchen finds broken spit braai machine
2. Cleaning staff reports damage
3. Admin sees shortage alert
4. Shopping orders replacement/repair
5. Future orders adjusted for equipment availability

### Scenario 4: Payment Issues
1. Client payment fails
2. Admin sees payment pending
3. Admin sends reminder email
4. Client retries payment
5. System confirms payment and closes order

## 📊 Key Metrics to Test

### Performance Metrics
- Order processing time: Booking → Confirmation
- Kitchen prep time: Assignment → Ready for Pickup
- Delivery time: Departure → Delivery Complete
- Cleaning turnaround: Return → Equipment Ready

### Financial Metrics
- Revenue per order
- Cost of goods sold
- Profit margin
- Outstanding invoices
- Supplier payment status

### Operational Metrics
- Staff duty hours
- Equipment utilization
- Inventory turnover
- Low stock incidents
- Client satisfaction scores

## 🎯 Success Criteria

You'll know the system is working perfectly when:
1. ✅ Client can book, track, and pay for events seamlessly
2. ✅ Admin has full visibility and control over operations
3. ✅ Kitchen staff can manage prep with clear task lists
4. ✅ Drivers get all info needed for successful deliveries
5. ✅ Shopping maintains optimal inventory levels
6. ✅ Cleaning ensures equipment is always ready
7. ✅ All email notifications are timely and accurate
8. ✅ Financial reports are accurate and comprehensive
9. ✅ God Mode allows instant role switching for testing
10. ✅ Real-time updates work across all portals

## 🔧 Troubleshooting

### Can't Log In?
- Use God Mode button on login page
- Or try: hello@spitbraaidelivery.co.za / Password123!

### Don't See Data?
- Make sure you're logged in to the right company
- Check company_id in database matches user's company
- Verify Row Level Security policies

### Role Switcher Not Showing?
- Must be Super Admin (hello@spitbraaidelivery.co.za)
- Look for icon in top-right header
- Refresh page if needed

### Dashboard Errors?
- Check browser console for details
- Verify database has sample orders
- Ensure user has correct role and company_id

---

**Ready to test? Start with God Mode login and explore all features!** 🚀