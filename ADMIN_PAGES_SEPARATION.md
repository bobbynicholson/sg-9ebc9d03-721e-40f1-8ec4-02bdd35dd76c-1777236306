# Admin Pages Separation Guide
*Distinguishing between Platform Owner (Super Admin) and Company Admin*

---

## 🏢 PLATFORM OWNER PAGES (Super Admin - YOU)
**Location:** `/cateringms-platform/*`

These pages are for managing the entire SaaS platform - all companies, subscriptions, and platform-wide settings.

### Platform Management
| Page | Path | Purpose | Who Uses It |
|------|------|---------|-------------|
| **Platform Dashboard** | `/cateringms-platform/dashboard.tsx` | Overview of all companies, revenue, metrics | Platform Owner |
| **CateringMS Dashboard** | `/cateringms-platform/catering-ms-dashboard.tsx` | Alternative dashboard view | Platform Owner |
| **Company Database** | `/cateringms-platform/company-database.tsx` | Manage all registered companies | Platform Owner |
| **Subscription Management** | `/cateringms-platform/subscription-management.tsx` | Manage all company subscriptions | Platform Owner |
| **Trial Management** | `/cateringms-platform/trial-management.tsx` | Monitor free trials, conversions | Platform Owner |
| **Pricing Management** | `/cateringms-platform/pricing-management.tsx` | Configure platform pricing tiers | Platform Owner |
| **Currency Monitoring** | `/cateringms-platform/currency-monitoring.tsx` | Monitor exchange rates for multi-currency | Platform Owner |

### Content Management System
| Page | Path | Purpose | Who Uses It |
|------|------|---------|-------------|
| **CMS Blog** | `/cateringms-platform/cms-blog.tsx` | Manage blog posts for marketing site | Platform Owner |
| **CMS Pages** | `/cateringms-platform/cms-pages.tsx` | Manage marketing pages | Platform Owner |

---

## 🏪 COMPANY ADMIN PAGES
**Location:** `/admin/*`

These pages are for each company's administrator managing their own catering operation.

### Dashboard & Analytics
| Page | Path | Purpose | Who Uses It |
|------|------|---------|-------------|
| **Admin Dashboard** | `/admin/dashboard.tsx` | Company performance overview | Company Admin |
| **Financial Dashboard** | `/admin/financial-dashboard.tsx` | Company financial reports | Company Admin |
| **Job Progress Overview** | `/portal/admin/job-progress-overview.tsx` | Monitor active jobs | Company Admin |

### Order & Sales Management
| Page | Path | Purpose | Who Uses It |
|------|------|---------|-------------|
| **Orders** | `/admin/orders.tsx` ✅ NEW | Manage all company orders | Company Admin |
| **Order Assignments** | `/admin/order-assignments.tsx` | Assign orders to staff | Company Admin |
| **Calendar** | `/admin/calendar.tsx` ✅ NEW | Event calendar & scheduling | Company Admin |
| **Leads** | `/leads/index.tsx` ⚠️ Should move to `/admin/` | Manage sales leads | Company Admin |
| **Quotes** | `/quotes/index.tsx` ⚠️ Should move to `/admin/` | Manage quotes | Company Admin |

### Staff Management
| Page | Path | Purpose | Who Uses It |
|------|------|---------|-------------|
| **Users** | `/admin/users.tsx` | Manage company staff | Company Admin |
| **Driver Management** | `/admin/driver-management.tsx` | Manage drivers | Company Admin |
| **Staff Hours** | `/admin/staff-hours.tsx` | Track staff time | Company Admin |
| **Kitchen Duty Tracking** | `/admin/kitchen-duty-tracking.tsx` | Monitor kitchen shifts | Company Admin |

### Inventory & Equipment
| Page | Path | Purpose | Who Uses It |
|------|------|---------|-------------|
| **Inventory** | `/admin/inventory.tsx` ✅ NEW | Manage company inventory | Company Admin |
| **Equipment Shortages** | `/admin/equipment-shortages.tsx` | Track equipment issues | Company Admin |

### Communications & Automation
| Page | Path | Purpose | Who Uses It |
|------|------|---------|-------------|
| **Email Templates** | `/admin/email-templates.tsx` | Customize email templates | Company Admin |
| **After-Sales Emails** | `/admin/after-sales-emails.tsx` | Follow-up communications | Company Admin |
| **Email Automation Dashboard** | `/admin/email-automation-dashboard.tsx` | Automation overview | Company Admin |
| **Email Automation Settings** | `/admin/email-automation-settings.tsx` | Configure automation rules | Company Admin |
| **Notification Settings** | `/portal/admin/notification-settings.tsx` | Configure notifications | Company Admin |

### Regional & Client Management
| Page | Path | Purpose | Who Uses It |
|------|------|---------|-------------|
| **Regions** | `/admin/regions.tsx` | Manage service regions | Company Admin |
| **Client Search** | `/admin/client-search.tsx` | Search/filter clients | Company Admin |

### Financial Configuration
| Page | Path | Purpose | Who Uses It |
|------|------|---------|-------------|
| **Payment Gateways** | `/admin/payment-gateways.tsx` | Configure payment providers | Company Admin |
| **Subscription** | `/admin/subscription.tsx` | Manage company subscription | Company Admin |

### Settings & Customization
| Page | Path | Purpose | Who Uses It |
|------|------|---------|-------------|
| **Settings** | `/admin/settings.tsx` | Company-wide settings | Company Admin |
| **White Label** | `/admin/white-label.tsx` | Customize company branding | Company Admin |

### Development Tools
| Page | Path | Purpose | Who Uses It |
|------|------|---------|-------------|
| **Role Testing** | `/admin/role-testing.tsx` | Test role permissions | Company Admin (Dev) |

---

## 🔑 KEY DIFFERENCES

### Platform Owner (Super Admin)
- **Sees:** ALL companies across the platform
- **Manages:** Subscriptions, pricing, trials, platform-wide content
- **Access:** `/cateringms-platform/*` pages
- **Permissions:** Full platform control, can impersonate company admins
- **Revenue:** Sees platform-wide revenue from all companies

### Company Admin
- **Sees:** Only THEIR company's data
- **Manages:** Orders, staff, inventory, settings for their business
- **Access:** `/admin/*` pages and company-specific portals
- **Permissions:** Full control over their company only
- **Revenue:** Sees only their company's revenue

---

## 🎯 AUTHENTICATION & ROUTING

### Current Structure (Needs Implementation)
```
Public Routes:
- /, /features, /pricing, /contact, etc.

Platform Owner:
- /cateringms-platform/* (requires super_admin role)

Company-Specific:
- /company/{slug}/admin/* (requires company admin role)
- /company/{slug}/portal/driver/* (requires driver role)
- /company/{slug}/portal/kitchen/* (requires kitchen role)
- etc.
```

### Recommended URL Structure
```
Platform Owner:
https://cateringms.com/platform/dashboard

Company Admin:
https://cateringms.com/company/acme-catering/admin/dashboard
https://acme-catering.cateringms.com/admin/dashboard (subdomain)

Company Staff:
https://cateringms.com/company/acme-catering/portal/driver/dashboard
https://acme-catering.cateringms.com/portal/driver/dashboard
```

---

## 📊 ACCESS CONTROL MATRIX

| Feature | Platform Owner | Company Admin | Driver | Kitchen | Shopping | Cleaning | Client |
|---------|---------------|---------------|--------|---------|----------|----------|--------|
| View all companies | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage pricing | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage subscriptions | ✅ | View own only | ❌ | ❌ | ❌ | ❌ | ❌ |
| Company settings | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage orders | ✅ | ✅ | View assigned | View assigned | ❌ | ❌ | View own |
| Manage staff | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Inventory | ✅ | ✅ | ❌ | View only | ✅ | ❌ | ❌ |
| Financial reports | ✅ | ✅ | View earnings | ❌ | ❌ | ❌ | View invoices |

---

## 🚀 NEXT STEPS

1. **Implement Multi-Tenancy:**
   - Add company slug routing: `/company/{slug}/...`
   - Implement subdomain routing: `{slug}.cateringms.com`

2. **Role-Based Middleware:**
   - Protect `/cateringms-platform/*` for super_admin only
   - Protect `/admin/*` for company admin role
   - Enforce company isolation (admins can't see other companies)

3. **Database Scoping:**
   - All queries scoped to company_id
   - Super admin can bypass scoping with impersonation

4. **Navigation Updates:**
   - Platform owner sees platform nav only
   - Company users see their role-specific nav
   - No mixing of platform and company pages

---

## ✅ PAGES REORGANIZED TODAY

**Moved to Company Admin:**
1. ✅ `/orders.tsx` → `/admin/orders.tsx`
2. ✅ `/inventory.tsx` → `/admin/inventory.tsx`
3. ✅ `/calendar.tsx` → `/admin/calendar.tsx`

**Moved to Role Portals:**
1. ✅ `/drivers.tsx` → `/portal/driver/dashboard.tsx`
2. ✅ `/kitchen.tsx` → `/portal/kitchen/dashboard.tsx`
3. ✅ `/shopping.tsx` → `/portal/shopping/dashboard.tsx`
4. ✅ `/cleaning.tsx` → `/portal/cleaning/dashboard.tsx`

**Platform Pages (Already Correct):**
- All `/cateringms-platform/*` pages properly separated