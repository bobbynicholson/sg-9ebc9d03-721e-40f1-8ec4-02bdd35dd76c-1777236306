# First Client Onboarding Guide - CateringMS

## 🎯 Quick Start for Your First Catering Company Client

**Last Updated:** 2025-10-17  
**Status:** Ready for immediate use

---

## 📋 Pre-Onboarding Checklist

Before your client signs up, ensure:

- ✅ System is deployed to production
- ✅ Supabase is connected and configured
- ✅ Email notifications are enabled
- ✅ Trial period set to 14 days
- ✅ All error checks passing (they are!)

---

## 🚀 Step 1: Company Signup

**Client Action:** Visit `https://cateringms.com/company-signup`

**What They'll Provide:**
- Company name (e.g., "Spit Braai Delivery")
- Email address
- Password
- Contact information

**What Happens Automatically:**
1. System generates unique URL slug (e.g., `spit-braai-delivery`)
2. Real-time validation ensures slug is available
3. Company record created with 14-day trial
4. Owner account created and linked to company
5. Automatic redirect to onboarding: `/{company-slug}/admin/onboarding`

**Their Unique URLs Will Be:**
- Admin Portal: `cateringms.com/spit-braai-delivery/admin/dashboard`
- Staff Login: `cateringms.com/spit-braai-delivery/auth/login`
- Staff Register: `cateringms.com/spit-braai-delivery/auth/register`

---

## 👥 Step 2: Adding Staff Members

**Two Methods:**

### Method A: Staff Self-Registration
1. Share registration link: `cateringms.com/{company-slug}/auth/register`
2. Staff members register with email/password
3. They automatically join the company (via URL slug)
4. Default role: "Client" (no portal access until admin assigns role)

### Method B: Admin Manual Addition
1. Admin goes to: `/{company-slug}/admin/users`
2. Click "Add New User"
3. Enter staff details
4. Assign appropriate roles immediately

---

## 🎭 Step 3: Assigning Roles

**Admin Action:** Navigate to `/{company-slug}/admin/users`

**Available Roles:**
- **Admin** - Full access to admin portal (company management)
- **Driver** - Access to driver portal (deliveries, routes, GPS tracking)
- **Kitchen Team** - Access to kitchen portal (prep, recipes, inventory)
- **Cleaning Team** - Access to cleaning portal (equipment verification, tasks)
- **Shopping Team** - Access to shopping portal (suppliers, ordering, inventory)
- **Client** - Customer access only (not staff)

**Important:**
- Staff can have **multiple roles** (e.g., both Driver and Kitchen)
- One role must be marked as **Primary** (determines default dashboard)
- Role changes take effect immediately

**How to Assign:**
1. Find staff member in user list
2. Click "Edit Departments"
3. Check the appropriate role boxes
4. Set primary role
5. Save

---

## 🏠 Step 4: Portal Access

Once roles are assigned, staff can access their portals:

### Driver Portal
**URL:** `cateringms.com/{company-slug}/driver/dashboard`
**Features:**
- View assigned deliveries
- GPS tracking
- Route optimization
- Delivery confirmation
- Equipment return verification

### Kitchen Portal
**URL:** `cateringms.com/{company-slug}/kitchen/dashboard`
**Features:**
- Mark who's on duty
- Task completion tracking
- Equipment preparation checklists
- Recipe management
- Stock tracking

### Cleaning Portal
**URL:** `cateringms.com/{company-slug}/cleaning/dashboard`
**Features:**
- Duty assignment
- Equipment return verification
- Broken/lost equipment reporting
- Cleaning workflow tracking
- Inventory reconciliation

### Shopping Portal
**URL:** `cateringms.com/{company-slug}/shopping/dashboard`
**Features:**
- Supplier management
- Order tracking
- Inventory management
- FIFO system
- Allergen tracking

### Admin Portal
**URL:** `cateringms.com/{company-slug}/admin/dashboard`
**Features:**
- Complete system overview
- User management
- Order management
- Inventory oversight
- Financial tracking
- Reports and analytics

---

## 📱 Step 5: Daily Operations Setup

### Initial Configuration Tasks (Admin)

1. **Add Equipment Inventory**
   - Navigate to: `/{company-slug}/admin/inventory`
   - Add all plates, cutlery, equipment
   - Set quantities and values

2. **Set Up Suppliers**
   - Navigate to: `/{company-slug}/shopping/suppliers`
   - Add supplier details
   - Configure ordering preferences

3. **Create Menu Items**
   - Navigate to: `/{company-slug}/kitchen/menu`
   - Add recipes
   - Set pricing and ingredients

4. **Configure Delivery Routes**
   - Navigate to: `/{company-slug}/driver/routes`
   - Set common delivery areas
   - Configure route preferences

5. **Add Client Contacts**
   - Navigate to: `/{company-slug}/admin/users`
   - Add customer contacts (role: Client)
   - Client can then log in to view their orders

---

## 🔔 Step 6: Understanding Notifications

**Trial Expiry Notifications:**
- 7 days before expiry
- 3 days before expiry
- 1 day before expiry
- On expiry day

**Operational Notifications:**
- New orders
- Delivery status updates
- Equipment issues
- Inventory alerts
- Staff duty changes

---

## 🎓 Training Your Client

### For the Company Owner/Admin

**Key Areas to Cover:**
1. How to add staff and assign roles
2. How to create orders and assign to events
3. How to track equipment through the workflow
4. How to view financial reports
5. How to manage inventory
6. Understanding the trial period and subscription

**Recommended First Actions:**
1. Add all staff members
2. Input equipment inventory
3. Add first few suppliers
4. Create a test order to see the workflow
5. Have each department test their portal

### For Department Staff

**Driver Training:**
- Logging in via `/{company-slug}/driver/dashboard`
- Viewing assigned deliveries
- Marking deliveries complete
- Equipment return verification

**Kitchen Training:**
- Marking duty status
- Completing prep tasks
- Equipment handover process
- Stock management

**Cleaning Training:**
- Verifying equipment returns
- Reporting broken items
- Tracking cleaning workflow
- Inventory reconciliation

**Shopping Training:**
- Managing supplier relationships
- Creating purchase orders
- Receiving inventory
- FIFO tracking

---

## 🐛 Common Issues & Solutions

### Issue: Staff Can't See Their Portal
**Solution:** 
1. Check if role is assigned via `/{company-slug}/admin/users`
2. Ensure they're logging in to correct company URL
3. Verify their account is active

### Issue: Company Slug Already Taken
**Solution:**
- System checks availability in real-time during signup
- Try variations: add location, add "catering", use hyphens
- Example: `company-name-catering`, `company-name-jhb`

### Issue: Staff Member Forgot Password
**Solution:**
- Use "Forgot Password" link at login page
- Email reset link sent automatically
- Link: `cateringms.com/{company-slug}/auth/forgot-password`

### Issue: Need to Change Primary Role
**Solution:**
1. Go to `/{company-slug}/admin/users`
2. Click "Edit Departments"
3. Select different role as Primary
4. Save changes

### Issue: Equipment Not Tracking Through Workflow
**Solution:**
1. Ensure equipment exists in inventory
2. Verify order has equipment assigned
3. Check each department is marking tasks complete
4. Review workflow status in admin dashboard

---

## 💰 Trial Period Management

### Trial Details
- **Duration:** 14 days from signup
- **Access:** Full platform access
- **Notifications:** Automatic reminders at 7, 3, and 1 day remaining
- **After Trial:** System prompts for subscription selection

### Monitoring Trial Status
**Admin View:** `/{company-slug}/admin/subscription`
- Shows days remaining
- Displays trial expiry date
- Links to pricing plans

**Platform View:** `/cateringms-platform/trial-management`
- Overview of all active trials
- Conversion tracking
- Client engagement metrics

---

## 📞 Support & Assistance

### For Client Questions
**General Support:** Contact CateringMS support team
**Technical Issues:** Check documentation or submit support ticket
**Feature Requests:** Submit via feedback form

### For Platform Admin (You)
**Client Management:** `/cateringms-platform/dashboard`
**Subscription Issues:** `/cateringms-platform/subscription-management`
**System Configuration:** `/cateringms-platform/pricing-management`

---

## ✅ Onboarding Success Checklist

Use this to ensure smooth client onboarding:

### Day 1: Setup
- [ ] Client completes company signup
- [ ] Client accesses admin dashboard
- [ ] Client completes onboarding wizard
- [ ] Client adds first staff member
- [ ] Client assigns first role

### Day 2-3: Configuration
- [ ] All staff members added
- [ ] All roles assigned correctly
- [ ] Equipment inventory entered
- [ ] Suppliers added
- [ ] Menu items created

### Day 4-7: Testing
- [ ] Create test order
- [ ] Assign to driver
- [ ] Track through kitchen workflow
- [ ] Verify cleaning process
- [ ] Check equipment return

### Week 2: Full Operation
- [ ] Process real orders
- [ ] Track financial data
- [ ] Monitor staff usage
- [ ] Generate first reports
- [ ] Prepare for subscription

---

## 🎉 Success Indicators

**Your client is successfully onboarded when:**

✅ All department heads can access their portals  
✅ First order tracked from booking to completion  
✅ Equipment tracked through full workflow cycle  
✅ Staff comfortable with daily operations  
✅ Admin using reports to make decisions  
✅ Client expresses confidence in the system  
✅ Client ready to subscribe post-trial

---

## 📊 First Week Metrics to Track

Monitor these to ensure successful adoption:

- **Login Frequency:** Are users logging in daily?
- **Feature Usage:** Which portals are most used?
- **Order Volume:** How many orders processed?
- **Equipment Tracking:** Completion rate through workflow?
- **Staff Engagement:** All team members active?
- **Support Tickets:** What issues are arising?

**Red Flags:**
- Low login frequency
- Single portal usage only
- No orders created
- Support tickets with basic questions

**Green Flags:**
- Daily logins from multiple roles
- Orders being tracked end-to-end
- Equipment workflow completing smoothly
- Client asking about advanced features

---

## 🚀 Post-Onboarding Growth

### Week 3-4: Optimization
- Review workflows with client
- Identify bottlenecks
- Suggest efficiency improvements
- Introduce advanced features

### Month 2: Expansion
- Additional staff onboarding
- More complex order types
- Integration opportunities
- Custom reporting needs

### Month 3+: Scaling
- Multi-location if applicable
- Advanced analytics usage
- API integrations
- White-label considerations

---

## 📱 Quick Reference: Important URLs

### Client Company URLs
```
Login: cateringms.com/{company-slug}/auth/login
Register: cateringms.com/{company-slug}/auth/register
Admin: cateringms.com/{company-slug}/admin/dashboard
Driver: cateringms.com/{company-slug}/driver/dashboard
Kitchen: cateringms.com/{company-slug}/kitchen/dashboard
Cleaning: cateringms.com/{company-slug}/cleaning/dashboard
Shopping: cateringms.com/{company-slug}/shopping/dashboard
```

### Platform Admin URLs (You)
```
Dashboard: cateringms.com/cateringms-platform/dashboard
Clients: cateringms.com/cateringms-platform/subscription-management
Trials: cateringms.com/cateringms-platform/trial-management
Pricing: cateringms.com/cateringms-platform/pricing-management
Blog: cateringms.com/cateringms-platform/cms-blog
```

### Public URLs
```
Homepage: cateringms.com/
Features: cateringms.com/features
Pricing: cateringms.com/pricing
Signup: cateringms.com/company-signup
Contact: cateringms.com/contact
Support: cateringms.com/support
```

---

**Ready to onboard your first client!** 🎯

This guide will walk them through every step. Keep it handy for reference during the onboarding call.

Good luck with your urgent catering company client! 🚀
