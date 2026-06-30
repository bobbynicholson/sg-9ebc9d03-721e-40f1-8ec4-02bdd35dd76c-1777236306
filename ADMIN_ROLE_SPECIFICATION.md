# Admin Role Specification

## Overview
The `admin` role was added to provide company-level administrative access **without financial visibility**. This ensures Bobby's requirement: financial data (revenue, payments, subscriptions) remains director-only.

---

## Role Comparison: `company_admin` vs `admin`

| Capability | company_admin | admin | Notes |
|------------|---------------|-------|-------|
| **Access Level** | Full company access | Full company access (no finance) | Both are company-scoped |
| **Financial Dashboard** | ✅ Yes | ❌ No | Revenue, profit, financial insights |
| **Subscription Management** | ✅ Yes | ❌ No | Plan changes, billing |
| **Payment Gateways** | ✅ Yes | ❌ No | PayFast, Stripe setup |
| **Invoices (View/Create)** | ✅ Yes | ✅ Yes | Both can manage invoices |
| **Orders** | ✅ Yes | ✅ Yes | Full CRUD access |
| **Quotes** | ✅ Yes | ✅ Yes | Create and manage quotes |
| **Leads** | ✅ Yes | ✅ Yes | Lead management |
| **Clients** | ✅ Yes | ✅ Yes | Client database access |
| **Inventory** | ✅ Yes | ✅ Yes | Stock management |
| **Staff Management** | ✅ Yes | ✅ Yes | User creation, role assignment |
| **Drivers** | ✅ Yes | ✅ Yes | Driver management |
| **Staff Hours** | ✅ Yes | ✅ Yes | Time tracking |
| **Email Templates** | ✅ Yes | ✅ Yes | Template management |
| **Email Automation** | ✅ Yes | ✅ Yes | Automation rules |
| **Tracking** | ✅ Yes | ✅ Yes | Live delivery tracking |
| **Route Planning** | ✅ Yes | ✅ Yes | Optimize routes |
| **Equipment Shortages** | ✅ Yes | ✅ Yes | Inventory alerts |
| **Regions** | ✅ Yes | ✅ Yes | Service area management |
| **White Label** | ✅ Yes | ✅ Yes | Branding customization |
| **Integrations** | ✅ Yes | ✅ Yes | Third-party tools |
| **System Settings** | ✅ Yes | ✅ Yes | General configuration |
| **ChatBot Access** | Finance-aware | No finance questions | AI assistant adapts to role |

---

## Technical Implementation

### 1. Type System
```typescript
export enum UserRole {
  SUPER_ADMIN = "super_admin",
  COMPANY_ADMIN = "company_admin",
  ADMIN = "admin",              // ← New role
  OWNER = "owner",
  // ... other roles
}
```

### 2. Auth Guards
```typescript
// Company-level admin check (includes admin, company_admin, owner, super_admin)
export function isAdmin(userRole: UserRole): boolean {
  return [
    UserRole.SUPER_ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.ADMIN,        // ← Now included
    UserRole.OWNER
  ].includes(userRole);
}

// Finance access check (admin is excluded)
export function canAccessFinance(userRole: UserRole): boolean {
  return [
    UserRole.SUPER_ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.OWNER
  ].includes(userRole);
}
```

### 3. Route Protection
```typescript
// Finance-only routes
const financeRoutes = [
  "/admin/financial-dashboard",
  "/admin/subscription",
  "/admin/payment-gateways"
];

// Admin can access all other admin routes
const adminRoutes = [
  "/admin/dashboard",
  "/admin/orders",
  "/admin/users",
  // ... all non-finance routes
];
```

### 4. Dashboard Routing
```typescript
// On login, admins go to company dashboard
case "admin":
  router.push(`/${companySlug}/admin/dashboard`);
  break;
```

### 5. Navigation
AdminNav conditionally shows Finance & Billing section:
```typescript
...(canAccessFinance(profile.role) ? [financeSection] : [])
```

---

## Database-Side Behavior

### RLS Function
```sql
CREATE OR REPLACE FUNCTION is_company_admin(user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id
    AND role IN ('super_admin', 'company_admin', 'admin')
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

### Default Role
New users created via Supabase dashboard (no metadata) default to `client`:
```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'role', 'client')::user_role);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## Testing

### Test Users (Spit Braai Delivery)
| Email | Password | Role | Expected Behavior |
|-------|----------|------|-------------------|
| superadmin@cateringms.com | CateringMS123! | super_admin | Platform-wide access |
| hello@spitbraaidelivery.co.za | CateringMS123! | company_admin | Full company + finance |
| admin@spitbraaidelivery.co.za | CateringMS123! | admin | Full company - finance |
| kitchen@spitbraaidelivery.co.za | CateringMS123! | kitchen_staff | Kitchen dashboard only |
| driver@spitbraaidelivery.co.za | CateringMS123! | driver | Driver dashboard only |
| shopping@spitbraaidelivery.co.za | CateringMS123! | shopping_staff | Shopping dashboard only |
| cleaning@spitbraaidelivery.co.za | CateringMS123! | cleaning_staff | Cleaning dashboard only |
| client@test.com | CateringMS123! | client | Client portal only |

### Verification Checklist
- [ ] Admin can log in and access `/admin/dashboard`
- [ ] Admin can view/create orders, quotes, leads
- [ ] Admin can manage staff users
- [ ] Admin sees inventory, tracking, routes
- [ ] Admin **cannot** see Finance & Billing nav section
- [ ] Admin **cannot** access `/admin/financial-dashboard`
- [ ] Admin **cannot** access `/admin/subscription`
- [ ] Admin **cannot** access `/admin/payment-gateways`
- [ ] Company Admin sees all of the above + finance routes
- [ ] RoleSwitcher shows "Administrator" badge for admin users
- [ ] ChatBot shows admin-appropriate greeting (no finance)

---

## Backend Issues Flagged (NOT Frontend Fixes)

### A. Missing RLS Policies
Five tables have RLS enabled but zero policies (blocks all reads):
- `delivery_stops`
- `order_items`
- `prep_list_items`
- `quote_items`
- `recipe_ingredients`

**Required Fix**: Add company-scoped SELECT/INSERT/UPDATE/DELETE policies matching parent tables.

### B. Duplicate RLS Policies
Six tables have duplicate policies using both `active_role::text` and `role::user_role`:
- `clients`
- `inventory_items`
- `leads`
- `orders`
- `quotes`
- `equipment_inventory`

**Required Fix**: Keep enum version (`role::user_role`), drop text duplicates.

### C. Unsafe Notification Policy
`notifications.system_create_notifications` uses `WITH CHECK (true)`:
```sql
CREATE POLICY "system_create_notifications"
ON notifications FOR INSERT
WITH CHECK (true);
```

**Required Fix**: Restrict to `service_role` or authenticated insert with proper company check.

### D. Duplicate Company Row
Two `Spit Braai Delivery` rows exist:
- Active: (primary company)
- Orphan: `dd729476-2aa4-47bb-a6ff-5b553c3088f2`

**Required Fix**: Delete orphan row after verifying no FK dependencies.

### E. Duplicate Function
`get_user_company_id()` exists twice (with and without arg):
```sql
-- Keep this one:
CREATE FUNCTION get_user_company_id(user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public;

-- Drop the no-arg version
```

**Required Fix**: Drop no-arg version, keep `STABLE SECURITY DEFINER` version.

### F. Mutable search_path
18 public functions have mutable `search_path` (security risk):

**Required Fix**: Add `SET search_path = public` to each function definition.

---

## Deployment Notes

1. **Database migration complete** - `admin` enum value exists
2. **Frontend aligned** - All role checks, guards, navigation updated
3. **Test thoroughly** - Use test credentials above
4. **Backend fixes required** - See flagged issues A-F above
5. **Documentation** - This file serves as the spec

---

## Future Considerations

- **Audit Logs**: Track what admins do vs company_admins
- **Granular Permissions**: Per-resource permissions (e.g., "can edit inventory" vs "can delete orders")
- **Role Hierarchy**: Define explicit inheritance (admin inherits from staff roles)
- **Multi-Company Admins**: Cross-company access for holding companies

---

**Last Updated**: 2026-04-26
**Version**: 1.0
