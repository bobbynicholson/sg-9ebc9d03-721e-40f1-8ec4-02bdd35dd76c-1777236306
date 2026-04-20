# Complete CateringMS URL Structure

## 📊 CURRENT STATE ANALYSIS
**Total Pages:** 82 files
**Correctly Placed:** 74 files
**Need Moving:** 8 files

---

## 🏢 PLATFORM OWNER URLs (Super Admin - YOU)
**Base:** `/cateringms-platform/`
**Status:** ✅ All correct

```
✅ /cateringms-platform/dashboard              - Platform analytics & metrics
✅ /cateringms-platform/company-database       - View all registered companies
✅ /cateringms-platform/subscription-management - Billing & subscription plans
✅ /cateringms-platform/trial-management       - Monitor free trials
✅ /cateringms-platform/pricing-management     - Configure pricing tiers
✅ /cateringms-platform/currency-monitoring    - Exchange rates & multi-currency
✅ /cateringms-platform/cms-blog               - Manage blog posts
✅ /cateringms-platform/cms-pages              - Manage static pages
```

---

## 🛡️ COMPANY ADMIN URLs (Catering Business Owners)
**Base:** `/admin/`
**Status:** ⚠️ Mostly correct, 2 pages need moving

### Core Management ✅
```
✅ /admin/dashboard                    - Admin overview & priority tasks
✅ /admin/orders                       - Manage all orders
✅ /admin/inventory                    - Stock management
✅ /admin/calendar                     - Event calendar
✅ /admin/users                        - Staff user management
```

### Operations ✅
```
✅ /admin/driver-management            - Assign drivers, view availability
✅ /admin/order-assignments            - Assign orders to staff
✅ /admin/kitchen-duty-tracking        - Track who's on kitchen duty
✅ /admin/equipment-shortages          - Monitor equipment issues
✅ /admin/staff-hours                  - Time tracking & payroll
```

### Financial ✅
```
✅ /admin/financial-dashboard          - Revenue, expenses, analytics
✅ /admin/payment-gateways             - PayFast, Stripe configuration
✅ /admin/subscription                 - Company subscription status
```

### Communication & Automation ✅
```
✅ /admin/email-templates              - Customize email templates
✅ /admin/email-automation-dashboard   - Email campaign performance
✅ /admin/email-automation-settings    - Configure automation rules
✅ /admin/after-sales-emails           - Post-event follow-ups
```

### Configuration ✅
```
✅ /admin/settings                     - Company settings & preferences
✅ /admin/regions                      - Geographic service areas
✅ /admin/white-label                  - Branding customization
✅ /admin/client-search                - Quick client lookup
✅ /admin/role-testing                 - Test different user roles
```

### ⚠️ NEEDS FIXING - Move from /portal/admin/ to /admin/
```
❌ /portal/admin/job-progress-overview  → /admin/job-progress-overview
❌ /portal/admin/notification-settings  → /admin/notification-settings
```

---

## 👨‍🍳 KITCHEN PORTAL URLs
**Base:** `/portal/kitchen/`
**Status:** ✅ All correct

```
✅ /portal/kitchen/dashboard           - Kitchen overview, prep schedules
```

---

## 🚚 DRIVER PORTAL URLs
**Base:** `/portal/driver/`
**Status:** ✅ All correct

```
✅ /portal/driver/dashboard            - Driver overview, today's deliveries
```

---

## 🛒 SHOPPING PORTAL URLs
**Base:** `/portal/shopping/`
**Status:** ✅ All correct

```
✅ /portal/shopping/dashboard          - Shopping overview, purchase orders
```

---

## ✨ CLEANING PORTAL URLs
**Base:** `/portal/cleaning/`
**Status:** ✅ All correct

```
✅ /portal/cleaning/dashboard          - Cleaning overview, equipment tracking
```

---

## 👥 STAFF PORTAL URLs
**Base:** `/portal/staff/`
**Status:** ✅ All correct

```
✅ /portal/staff/job-progress          - View assigned job progress
```

---

## 👤 CLIENT PORTAL URLs
**Base:** `/client-portal` (main) or `/portal/client/` (sub-pages)
**Status:** ⚠️ Main page correct, sub-pages should be consolidated

```
✅ /client-portal                      - Main client dashboard (KEEP THIS)
```

### ⚠️ SHOULD BE CONSOLIDATED into /client-portal
```
❌ /portal/client/my-orders            - Integrate into main /client-portal
❌ /portal/client/payment-schedule     - Integrate into main /client-portal
❌ /portal/client/game                 - Integrate into main /client-portal
```

### ⚠️ WRONG LOCATION - Move to /portal/client/
```
❌ /client/subscription-invoices       → /portal/client/subscription-invoices
```

---

## 🔐 AUTHENTICATION URLs ✅
**Base:** `/auth/`

```
✅ /auth/login                         - Login page
✅ /auth/register                      - User registration
✅ /auth/callback                      - OAuth callback
```

---

## 📊 TRACKING SYSTEM URLs ✅
**Base:** `/tracking/`

```
✅ /tracking/admin                     - Admin view of all deliveries
✅ /tracking/driver                    - Driver tracking interface
✅ /tracking/client                    - Client delivery tracking
```

---

## 📝 LEAD MANAGEMENT URLs ✅
**Base:** `/leads/`

```
✅ /leads                              - Lead dashboard
✅ /leads/new                          - Create new lead
```

---

## 💰 QUOTE SYSTEM URLs ✅
**Base:** `/quotes/`

```
✅ /quotes                             - Quote dashboard
✅ /quotes/new                         - Create new quote
```

---

## 💳 SUBSCRIPTION/PAYMENT URLs ✅
**Base:** `/subscription/`

```
✅ /subscription/checkout              - Subscription checkout
✅ /subscription/success               - Payment success page
```

---

## 🌍 PUBLIC MARKETING URLs ✅
**Base:** `/`

```
✅ /                                   - Homepage
✅ /features                           - Features overview
✅ /pricing                            - Pricing page
✅ /contact                            - Contact form
✅ /support                            - Support page
✅ /demo                               - Live demo
✅ /integrations                       - Integrations showcase
✅ /hr-solutions                       - HR solutions page
✅ /company-signup                     - Company registration
✅ /notifications                      - Notifications page
✅ /onboarding                         - Onboarding flow
```

### Feature-Specific Pages ✅
```
✅ /features/email-automation          - Email automation feature
✅ /features/gps-tracking              - GPS tracking feature
✅ /features/inventory-management      - Inventory feature
✅ /features/kitchen-management        - Kitchen feature
✅ /features/lead-management           - Lead management feature
```

### Regional Pages ✅
```
✅ /uk                                 - UK homepage
✅ /uk/pricing                         - UK pricing
✅ /us                                 - US homepage
✅ /us/pricing                         - US pricing
```

### Legal Pages ✅
```
✅ /terms                              - Terms of service
✅ /privacy                            - Privacy policy
✅ /security                           - Security information
```

### Blog ✅
```
✅ /blog                               - Blog listing
✅ /blog/[slug]                        - Individual blog post
```

### Dynamic Pages ✅
```
✅ /page/[slug]                        - CMS-managed pages
```

### System Pages ✅
```
✅ /404                                - 404 error page
```

---

## 🔧 PAGES TO FIX

### Priority 1: Move Admin Pages (2 files)
```
Move: src/pages/portal/admin/job-progress-overview.tsx
  To: src/pages/admin/job-progress-overview.tsx

Move: src/pages/portal/admin/notification-settings.tsx
  To: src/pages/admin/notification-settings.tsx
```

### Priority 2: Consolidate Client Portal (4 files)
**Option A (Recommended):** Integrate into main `/client-portal.tsx`
```
Integrate: src/pages/portal/client/my-orders.tsx → Delete after merging
Integrate: src/pages/portal/client/payment-schedule.tsx → Delete after merging
Integrate: src/pages/portal/client/game.tsx → Delete after merging
```

**Option B:** Keep as separate pages but move subscription-invoices
```
Move: src/pages/client/subscription-invoices.tsx
  To: src/pages/portal/client/subscription-invoices.tsx
```

### Priority 3: Clean Up Empty /portal/admin/ Directory
After moving the 2 files above, delete the empty directory.

---

## 📋 CLEANUP CHECKLIST

- [ ] Move `/portal/admin/job-progress-overview.tsx` to `/admin/`
- [ ] Move `/portal/admin/notification-settings.tsx` to `/admin/`
- [ ] Delete empty `/portal/admin/` directory
- [ ] Decide on client portal consolidation strategy (A or B)
- [ ] Update all internal navigation links
- [ ] Test all role-specific dashboards
- [ ] Verify authentication guards on moved pages

---

## 📊 FINAL STRUCTURE SUMMARY

**Platform Owner (YOU):** 8 pages in `/cateringms-platform/`
**Company Admin:** 24 pages in `/admin/`
**Staff Portals:** 5 pages in `/portal/{role}/`
**Client Portal:** 1 main page (+ optional sub-pages)
**Public/Marketing:** 30+ pages
**Auth/System:** 5 pages

**Total:** 82 pages perfectly organized by user role and purpose

---

## 🎯 RECOMMENDED ACTIONS

1. **Immediate Fix** (5 minutes):
   - Move 2 admin pages from `/portal/admin/` to `/admin/`
   - Delete empty `/portal/admin/` directory

2. **Client Portal Decision** (Your choice):
   - **Keep Simple:** One big `/client-portal.tsx` with tabs
   - **Keep Modular:** Separate pages in `/portal/client/`

3. **Navigation Updates** (10 minutes):
   - Update AdminNav component links
   - Update any hardcoded URLs in components

4. **Testing** (15 minutes):
   - Visit each dashboard
   - Verify navigation works
   - Check authentication redirects

**Want me to execute these moves now?**
