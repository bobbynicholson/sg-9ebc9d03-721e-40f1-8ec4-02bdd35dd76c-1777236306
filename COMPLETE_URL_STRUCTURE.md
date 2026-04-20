# Complete CateringMS URL Structure

## 🏢 PLATFORM OWNER URLs (Super Admin - YOU)
**Base:** `/cateringms-platform/`

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

### Core Management
```
✅ /admin/dashboard                    - Admin overview & priority tasks
✅ /admin/orders                       - Manage all orders (MOVED - was /orders)
✅ /admin/inventory                    - Stock management (MOVED - was /inventory)
✅ /admin/calendar                     - Event calendar (MOVED - was /calendar)
✅ /admin/users                        - Staff user management
```

### Operations
```
✅ /admin/driver-management            - Assign drivers, view availability
✅ /admin/order-assignments            - Assign orders to staff
✅ /admin/kitchen-duty-tracking        - Track who's on kitchen duty
✅ /admin/equipment-shortages          - Monitor equipment issues
✅ /admin/staff-hours                  - Time tracking & payroll
```

### Financial
```
✅ /admin/financial-dashboard          - Revenue, expenses, analytics
✅ /admin/payment-gateways             - PayFast, Stripe configuration
✅ /admin/subscription                 - Company subscription status
```

### Communication & Automation
```
✅ /admin/email-templates              - Customize email templates
✅ /admin/email-automation-dashboard   - Email campaign performance
✅ /admin/email-automation-settings    - Configure automation rules
✅ /admin/after-sales-emails           - Post-event follow-ups
```

### Configuration
```
✅ /admin/settings                     - Company settings & preferences
✅ /admin/regions                      - Geographic service areas
✅ /admin/white-label                  - Branding customization
✅ /admin/client-search                - Quick client lookup
```

### Testing & Utilities
```
✅ /admin/role-testing                 - Test different user roles
⚠️ /portal/admin/job-progress-overview - Should be /admin/job-progress-overview
⚠️ /portal/admin/notification-settings - Should be /admin/notification-settings
```

---

## 👨‍🍳 KITCHEN PORTAL URLs
**Base:** `/portal/kitchen/`

```
✅ /portal/kitchen/dashboard           - Kitchen overview, prep schedules
❌ /kitchen/dashboard                  - OLD - DELETE THIS
✅ /portal/kitchen/menu                - Menu management (placeholder)
✅ /portal/kitchen/prep-list           - Prep lists (placeholder)
✅ /portal/kitchen/stock               - Kitchen stock (placeholder)
```

---

## 🚚 DRIVER PORTAL URLs
**Base:** `/portal/driver/`

```
✅ /portal/driver/dashboard            - Driver overview, today's deliveries
❌ /drivers/dashboard                  - OLD - DELETE THIS
✅ /portal/driver/deliveries           - Delivery history (placeholder)
✅ /portal/driver/routes               - Route planning (placeholder)
✅ /portal/driver/profile              - Driver profile (placeholder)
```

---

## 🛒 SHOPPING PORTAL URLs
**Base:** `/portal/shopping/`

```
✅ /portal/shopping/dashboard          - Shopping overview, purchase orders
❌ /shopping/dashboard                 - OLD - DELETE THIS
✅ /portal/shopping/orders             - Purchase orders (placeholder)
✅ /portal/shopping/inventory          - Inventory tracking (placeholder)
✅ /portal/shopping/suppliers          - Supplier management (placeholder)
```

---

## ✨ CLEANING PORTAL URLs
**Base:** `/portal/cleaning/`

```
✅ /portal/cleaning/dashboard          - Cleaning overview, equipment tracking
❌ /cleaning/dashboard                 - OLD - DELETE THIS
✅ /portal/cleaning/tasks              - Task list (placeholder)
✅ /portal/cleaning/schedules          - Cleaning schedules (placeholder)
✅ /portal/cleaning/supplies           - Supplies inventory (placeholder)
```

---

## 👥 STAFF PORTAL URLs (Generic Staff)
**Base:** `/portal/staff/`

```
✅ /portal/staff/job-progress          - View assigned job progress
```

---

## 👤 CLIENT PORTAL URLs
**Base:** `/client-portal` or `/portal/client/`

```
✅ /client-portal                      - Main client dashboard (KEEP)
⚠️ /portal/client/my-orders            - Should be integrated into /client-portal
⚠️ /portal/client/payment-schedule     - Should be integrated into /client-portal
⚠️ /portal/client/game                 - Should be integrated into /client-portal
```

---

## 🔐 AUTHENTICATION URLs
**Base:** `/auth/`

```
✅ /auth/login                         - Login page
✅ /auth/register                      - User registration
✅ /auth/callback                      - OAuth callback
```

---

## 📊 TRACKING SYSTEM URLs
**Base:** `/tracking/`

```
✅ /tracking/admin                     - Admin view of all deliveries
✅ /tracking/driver                    - Driver tracking interface
✅ /tracking/client                    - Client delivery tracking
```

---

## 📝 LEAD MANAGEMENT URLs
**Base:** `/leads/`

```
✅ /leads                              - Lead dashboard
✅ /leads/new                          - Create new lead
```

---

## 💰 QUOTE SYSTEM URLs
**Base:** `/quotes/`

```
✅ /quotes                             - Quote dashboard
✅ /quotes/new                         - Create new quote
```

---

## 💳 SUBSCRIPTION/PAYMENT URLs
**Base:** `/subscription/`

```
✅ /subscription/checkout              - Subscription checkout
✅ /subscription/success               - Payment success page
⚠️ /client/subscription-invoices       - Should be /portal/client/invoices
```

---

## 🌍 PUBLIC MARKETING URLs
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
```

### Feature-Specific Pages
```
✅ /features/email-automation          - Email automation feature
✅ /features/gps-tracking              - GPS tracking feature
✅ /features/inventory-management      - Inventory feature
✅ /features/kitchen-management        - Kitchen feature
✅ /features/lead-management           - Lead management feature
```

### Regional Pages
```
✅ /uk                                 - UK homepage
✅ /uk/pricing                         - UK pricing
✅ /us                                 - US homepage
✅ /us/pricing                         - US pricing
```

### Legal Pages
```
✅ /terms                              - Terms of service
✅ /privacy                            - Privacy policy
✅ /security                           - Security information
```

### Blog
```
✅ /blog                               - Blog listing
✅ /blog/[slug]                        - Individual blog post
```

### Dynamic Pages
```
✅ /page/[slug]                        - CMS-managed pages
```

---

## ❌ PAGES TO DELETE (Old Structure)

```
❌ /kitchen/dashboard                  - Replace with /portal/kitchen/dashboard
❌ /drivers/dashboard                  - Replace with /portal/driver/dashboard
❌ /shopping/dashboard                 - Replace with /portal/shopping/dashboard
❌ /cleaning/dashboard                 - Replace with /portal/cleaning/dashboard
```

---

## ⚠️ PAGES TO MOVE

### Move from /portal/admin/ to /admin/
```
⚠️ /portal/admin/job-progress-overview  → /admin/job-progress-overview
⚠️ /portal/admin/notification-settings  → /admin/notification-settings
```

### Consolidate Client Portal
```
⚠️ /portal/client/my-orders            → Integrate into /client-portal
⚠️ /portal/client/payment-schedule     → Integrate into /client-portal
⚠️ /portal/client/game                 → Integrate into /client-portal
⚠️ /client/subscription-invoices       → /portal/client/invoices or integrate
```

---

## 🎯 RECOMMENDED URL STRUCTURE (After Cleanup)

### Multi-Tenant Ready (Future)
```
/{company-slug}/admin/*                - Company-specific admin
/{company-slug}/portal/kitchen/*       - Company-specific kitchen
/{company-slug}/portal/driver/*        - Company-specific driver
```

### Current Single-Tenant
```
/admin/*                               - Company admin pages
/portal/{role}/*                       - Role-specific portals
/cateringms-platform/*                 - Platform owner only
```

---

## 📋 CLEANUP CHECKLIST

- [ ] Delete old /kitchen/dashboard.tsx
- [ ] Delete old /drivers/dashboard.tsx  
- [ ] Delete old /shopping/dashboard.tsx
- [ ] Delete old /cleaning/dashboard.tsx
- [ ] Move /portal/admin/* pages to /admin/
- [ ] Consolidate /portal/client/* into /client-portal
- [ ] Update all internal links after moves
- [ ] Update navigation components
- [ ] Test all redirects

---

## 🔗 NAVIGATION STRUCTURE

### Platform Owner Nav
- Platform Dashboard
- Companies
- Subscriptions
- CMS

### Company Admin Nav
- Dashboard
- Orders
- Inventory
- Calendar
- Staff
- Reports
- Settings

### Role-Specific Navs
Each role (Kitchen, Driver, Shopping, Cleaning) has:
- Dashboard (main)
- 3-4 specific sub-pages

---

**Total Pages:** ~100+  
**Active Dashboards:** 7 (Platform, Admin, Kitchen, Driver, Shopping, Cleaning, Client)  
**Pages Needing Cleanup:** 8-10

Let me know which pages you want me to move/delete first!