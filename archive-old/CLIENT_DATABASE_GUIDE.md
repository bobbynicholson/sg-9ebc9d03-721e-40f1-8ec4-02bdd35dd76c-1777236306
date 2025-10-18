# CateringMS Client Database Management Guide

## Overview

The CateringMS platform now includes comprehensive client database management at two levels:

1. **Platform Level** - Super admins can view all companies signed up to CateringMS
2. **Company Level** - Each catering company can view and manage their own client database

---

## 1. Platform-Level Company Database

### Access
**URL:** `/cateringms-platform/company-database`  
**Permission:** Super Admin only

### Features
- **View All Companies:** See every catering company registered on CateringMS
- **Company Details:**
  - Company name and unique slug
  - Owner information (name, email, phone)
  - Business currency
  - Subscription status and plan
  - Trial expiry dates
  - Registration date
  - Last activity
- **Search & Filter:**
  - Search by company name, slug, or owner email
  - Filter by subscription status (Active, Trial, Expired, Cancelled)
  - Filter by subscription plan (Free, Basic, Professional, Enterprise)
- **Quick Actions:**
  - Add new company manually
  - Edit company details
  - Delete companies
  - View company slug for access
- **Statistics Dashboard:**
  - Total companies count
  - Active subscriptions
  - Trial accounts
  - Expired accounts

### Adding a Company Manually (Platform Admin)
1. Navigate to `/cateringms-platform/company-database`
2. Click "Add Company" button
3. Fill in required details:
   - Company name
   - Unique slug (auto-generated, editable)
   - Owner name and email
   - Phone number
   - Business currency
   - Subscription plan
4. Click "Create Company"
5. System automatically:
   - Generates unique slug if not provided
   - Creates company record
   - Links owner to company
   - Sets up subscription

---

## 2. Company-Level Client Database

### Access
**URL:** `/[company-slug]/admin/client-database`  
**Permission:** Company Admin only (must be logged in to specific company)

### Features
- **View All Clients:** See every user who has interacted with your platform
- **Client Sources:**
  - Quote requests
  - Confirmed bookings
  - Order placements
  - Manual additions
- **Client Details:**
  - Full name
  - Email address
  - Phone number
  - Registration date
  - Last interaction
  - Source (how they joined)
  - Number of orders
  - Total spent
- **Search & Filter:**
  - Search by name, email, or phone
  - Filter by source (Quote, Order, Manual)
  - Sort by date, name, or total spent
- **Quick Actions:**
  - Add client manually
  - Edit client information
  - Delete clients
  - View client order history
  - Contact client directly
- **Export Options:**
  - Export client list to CSV
  - Generate client reports
  - Sync with external CRM

### Adding a Client Manually (Company Admin)
1. Navigate to `/{your-company-slug}/admin/client-database`
2. Click "Add Client" button
3. Fill in client details:
   - Full name (required)
   - Email address (required)
   - Phone number
   - Source (Manual)
   - Notes (optional)
4. Click "Create Client"
5. Client is immediately added to your database

### Automatic Client Creation

Clients are automatically added to your database when they:

1. **Request a Quote:**
   - User fills out quote request form
   - Profile created with source: "Quote"
   - Visible in client database immediately

2. **Place an Order:**
   - User creates account and places order
   - Profile created with source: "Order"
   - Order details linked to client profile

3. **Sign Up for Account:**
   - User registers on your company portal
   - Profile created with source: "Manual"
   - Can place orders and request quotes

---

## Database Structure

### Companies Table
```sql
companies {
  id: uuid (primary key)
  name: text
  slug: text (unique)
  owner_id: uuid (references profiles)
  email: text
  phone: text
  currency: text
  subscription_plan: text
  subscription_status: text
  trial_ends_at: timestamp
  created_at: timestamp
}
```

### Profiles Table (Clients)
```sql
profiles {
  id: uuid (primary key)
  email: text
  full_name: text
  phone: text
  company_id: uuid (references companies)
  company_slug: text
  active_role: text
  created_at: timestamp
}
```

### Client Management Service Functions

#### Platform Level (companyService.ts)
- `getAllCompanies()` - Fetch all companies with stats
- `createCompany()` - Create new company
- `updateCompany()` - Update company details
- `deleteCompany()` - Remove company
- `getCompanyBySlug()` - Find company by URL slug

#### Company Level (clientManagementService.ts)
- `getCompanyClients()` - Fetch all clients for specific company
- `createClient()` - Add new client
- `updateClient()` - Update client information
- `deleteClient()` - Remove client
- `getClientOrders()` - View client order history
- `getClientStats()` - Client statistics and metrics

---

## Navigation & Access

### Platform Admin (Super Admin)
After logging in with super admin credentials:
1. Automatically redirected to `/cateringms-platform/dashboard`
2. Click "Company Database" card or navigate to `/cateringms-platform/company-database`
3. View and manage all companies

### Company Admin
After logging in as company admin:
1. Redirected to `/{company-slug}/admin/dashboard`
2. After onboarding, click "Client Database" in navigation
3. Or navigate to `/{company-slug}/admin/client-database`
4. View and manage your clients

---

## Security & Permissions

### Row-Level Security (RLS)

**Companies Table:**
- Super admins can view/edit all companies
- Company owners can only view/edit their own company
- Regular users cannot access company records

**Profiles Table (Clients):**
- Super admins can view all profiles
- Company admins can only view clients linked to their company
- Users can only view their own profile
- Clients cannot access client database

### Authentication Guards
```typescript
// Platform level - requires super_admin role
if (activeRole !== "super_admin") {
  router.push("/");
  return;
}

// Company level - requires admin role + company match
if (activeRole !== "admin" || companySlug !== userCompanySlug) {
  router.push("/");
  return;
}
```

---

## Common Use Cases

### Use Case 1: Platform Admin Views All Companies
**Goal:** Bobby (super admin) wants to see all catering companies
1. Login at `/auth/login` with bobby@skylight-digital.co.za
2. Auto-redirected to `/cateringms-platform/dashboard`
3. Click "Company Database" card
4. View list of all companies with filtering options

### Use Case 2: Company Admin Views Clients
**Goal:** Spit Braai Delivery admin wants to see their clients
1. Login at `/spit-braai-delivery/auth/login`
2. Navigate to `/spit-braai-delivery/admin/client-database`
3. View all clients who requested quotes or placed orders
4. Search/filter clients as needed

### Use Case 3: Adding Client Manually
**Goal:** Company admin met potential client at event, wants to add them
1. Go to client database page
2. Click "Add Client"
3. Enter client details from business card
4. Mark source as "Manual" or "Event"
5. Client saved for future follow-up

### Use Case 4: Tracking Client Activity
**Goal:** View which clients are most valuable
1. Open client database
2. Sort by "Total Spent" or "Number of Orders"
3. Identify top clients
4. Export data for analysis or CRM import

---

## Troubleshooting

### "Access Denied" Error
**Problem:** User cannot access database page  
**Solution:**
- Verify user has correct role (super_admin for platform, admin for company)
- Check company_slug matches in URL and user profile
- Ensure user is logged in
- Try logging out and back in

### Clients Not Appearing
**Problem:** Clients who placed orders aren't showing up  
**Solution:**
- Verify `company_id` is set in client profiles
- Check `company_slug` matches company URL
- Ensure RLS policies are not blocking access
- Run SQL query to verify data exists:
  ```sql
  SELECT * FROM profiles 
  WHERE company_slug = 'your-company-slug';
  ```

### Cannot Add Company (Platform Admin)
**Problem:** Create company form fails  
**Solution:**
- Check slug is unique and valid (lowercase, no spaces)
- Verify owner email is valid
- Ensure required fields are filled
- Check browser console for error messages

### Cannot Add Client (Company Admin)
**Problem:** Add client form not working  
**Solution:**
- Verify email is unique
- Check phone number format
- Ensure name is provided
- Verify company context is loaded

---

## API Endpoints

### Platform Level
```typescript
// Get all companies
const companies = await companyService.getAllCompanies();

// Create company
const result = await companyService.createCompany({
  name: "New Catering Co",
  slug: "new-catering-co",
  owner_id: userId,
  email: "owner@example.com",
  phone: "+27123456789",
  currency: "ZAR"
});
```

### Company Level
```typescript
// Get company clients
const clients = await clientManagementService.getCompanyClients(companySlug);

// Create client
const client = await clientManagementService.createClient({
  company_slug: companySlug,
  email: "client@example.com",
  full_name: "John Doe",
  phone: "+27987654321",
  source: "Manual"
});

// Get client stats
const stats = await clientManagementService.getClientStats(companySlug);
```

---

## Future Enhancements

### Planned Features
- [ ] Client segmentation and tagging
- [ ] Email marketing integration
- [ ] Client communication history tracking
- [ ] Automated client follow-ups
- [ ] Client lifetime value calculations
- [ ] CRM system integrations (Salesforce, HubSpot)
- [ ] Advanced reporting and analytics
- [ ] Client satisfaction surveys
- [ ] Loyalty program management
- [ ] Automated birthday/anniversary messages

---

## Quick Reference

### Super Admin URLs
- Dashboard: `/cateringms-platform/dashboard`
- Company Database: `/cateringms-platform/company-database`
- Subscription Management: `/cateringms-platform/subscription-management`

### Company Admin URLs (Replace `{slug}` with your company slug)
- Dashboard: `/{slug}/admin/dashboard`
- Client Database: `/{slug}/admin/client-database`
- Onboarding: `/{slug}/admin/onboarding`

### Current Super Admins
- Bobby: bobby@skylight-digital.co.za
- Alex: alex@skylight-digital.co.za (pending setup)

---

**Created:** 2025-10-18  
**Last Updated:** 2025-10-18  
**Version:** 1.0

