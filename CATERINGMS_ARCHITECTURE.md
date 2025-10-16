# CateringMS Platform Architecture

## Overview

CateringMS is a **multi-tenant SaaS platform** that provides catering companies with comprehensive management tools. The platform has a clear separation between the CateringMS admin portal (for platform management) and individual catering company portals (for business operations).

---

## Platform Structure

### 1. CateringMS Admin Portal
**Purpose**: Internal platform management by CateringMS staff

**Access**: 
- URL: `https://cateringms.com/platform/*`
- Role: `platform_admin`

**Key Features**:
- Manage all catering company accounts
- Monitor subscriptions and billing
- Track currency exchange rates
- View platform-wide analytics
- Manage pricing and subscription tiers

**Pages**:
- `/platform/dashboard` - Platform overview
- `/platform/subscription-management` - All customer subscriptions
- `/platform/currency-monitoring` - Exchange rate tracking
- `/platform/pricing-management` - Pricing tier management

---

### 2. Catering Company Portals
**Purpose**: Individual catering businesses manage their operations

**Access**:
- URL Pattern: `https://cateringms.com/[company-slug]/*`
- Roles: `admin`, `driver`, `kitchen_staff`, `cleaning_staff`, `shopping_staff`, `client`

**Key Features**:
- Company-specific dashboard
- Order management
- Staff management across departments
- Client management
- Equipment tracking
- Financial tracking

---

## User Registration & Company Creation Flow

### New Catering Company Signup

1. **Registration Page**: User visits `https://cateringms.com/auth/register`
2. **Company Details Form**:
   ```
   - Business Name (required) → auto-generates company_slug
   - Owner Email (required)
   - Owner Full Name (required)
   - Password (required)
   - Phone Number (optional)
   - Region (dropdown: za, uk, us)
   ```

3. **Account Creation Process**:
   ```
   Step 1: Create Supabase auth user (email + password)
   Step 2: Create company record in `companies` table
   Step 3: Create user profile in `profiles` table with:
           - user_id (from auth)
           - company_id (from step 2)
           - role: 'admin' (owner gets admin role)
           - company_slug
   Step 4: Redirect to company dashboard: /[company-slug]/admin/dashboard
   ```

4. **Company Slug Generation**:
   - Auto-generated from business name
   - Example: "Bob's Catering" → `bobs-catering`
   - Must be unique across the platform
   - Can be customized later in settings

---

## URL Structure & Routing

### Company-Specific URLs

All catering company portals follow this pattern:
```
https://cateringms.com/[company-slug]/[portal]/[page]
```

**Portal Types**:

#### Admin Portal
```
/[company-slug]/admin/dashboard
/[company-slug]/admin/users
/[company-slug]/admin/orders
/[company-slug]/admin/calendar
/[company-slug]/admin/inventory
/[company-slug]/admin/financial-dashboard
/[company-slug]/admin/equipment-shortages
/[company-slug]/admin/settings
```

#### Driver Portal
```
/[company-slug]/driver/dashboard
/[company-slug]/driver/routes
/[company-slug]/driver/deliveries
/[company-slug]/driver/profile
```

#### Kitchen Portal
```
/[company-slug]/kitchen/dashboard
/[company-slug]/kitchen/menu
/[company-slug]/kitchen/stock
/[company-slug]/kitchen/prep-list
```

#### Cleaning Portal
```
/[company-slug]/cleaning/dashboard
/[company-slug]/cleaning/tasks
/[company-slug]/cleaning/schedules
/[company-slug]/cleaning/supplies
```

#### Shopping Portal
```
/[company-slug]/shopping/dashboard
/[company-slug]/shopping/orders
/[company-slug]/shopping/suppliers
/[company-slug]/shopping/inventory
```

#### Authentication
```
/[company-slug]/auth/login
/[company-slug]/auth/register
/[company-slug]/auth/forgot-password
```

---

## Role-Based Access Control (RBAC)

### User Roles

| Role | Description | Primary Portal | Can Access |
|------|-------------|----------------|------------|
| `platform_admin` | CateringMS staff | Platform | All platform management features |
| `admin` | Company owner/manager | Admin | All company features |
| `driver` | Delivery driver | Driver | Routes, deliveries, GPS tracking |
| `kitchen_staff` | Kitchen worker | Kitchen | Menu, prep lists, duty logs |
| `cleaning_staff` | Cleaning worker | Cleaning | Tasks, equipment verification |
| `shopping_staff` | Purchasing staff | Shopping | Orders, suppliers, inventory |
| `client` | Customer | Client | Order history, tracking |

### Multi-Role Users

Users can be assigned multiple roles within a company:
- Example: Owner could be `admin` + `driver` + `kitchen_staff`
- Users can switch between roles using the **Role Switcher** component
- Each role has its own dashboard and navigation
- Notifications are filtered per role to avoid confusion

### Role Assignment Process

1. **Admin adds new user**: Go to `/[company-slug]/admin/users`
2. **Click "Add User"**: Enter email, name, phone
3. **Assign Departments**: Check one or more roles
4. **Select Primary Role**: User's default landing page
5. **Save**: User receives email invitation

---

## Database Schema

### Core Tables

#### `companies`
```sql
- id (uuid, PK)
- name (text) - Business name
- slug (text, unique) - URL-friendly identifier
- owner_id (uuid) - Links to profiles.id
- subscription_tier (text) - 'starter', 'professional', 'enterprise'
- region (text) - 'za', 'uk', 'us'
- active (boolean) - Subscription status
- created_at (timestamp)
```

#### `profiles`
```sql
- id (uuid, PK) - Links to auth.users.id
- company_id (uuid, FK) - Links to companies.id
- email (text)
- full_name (text)
- phone (text)
- avatar_url (text)
- company_slug (text) - Denormalized for quick access
- created_at (timestamp)
```

#### `user_departments`
```sql
- id (uuid, PK)
- user_id (uuid, FK) - Links to profiles.id
- company_id (uuid, FK) - Links to companies.id
- department (text) - 'admin', 'driver', 'kitchen_staff', etc.
- is_primary (boolean) - Default role for user
- created_at (timestamp)
```

#### `orders`
```sql
- id (uuid, PK)
- company_id (uuid, FK) - Multi-tenant isolation
- client_id (uuid, FK)
- order_number (text)
- status (text)
- event_date (timestamp)
- total (numeric)
- ... (50+ other fields)
```

### Row-Level Security (RLS)

All tables have RLS policies that enforce:
1. **Company Isolation**: Users can only see data from their own company
2. **Role-Based Access**: Different operations allowed per role
3. **Platform Admin Override**: Platform admins can see all data

**Example Policy (orders table)**:
```sql
CREATE POLICY "staff_view_company_orders"
ON orders FOR SELECT
USING (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);
```

---

## Testing Credentials

### Platform Admin (CateringMS Internal)
```
URL: https://cateringms.com/platform/dashboard
Email: admin@cateringms.com
Password: SecureAdmin123!
```

### Demo Catering Company: "Test Catering"
**Company Slug**: `test-catering`

#### Admin User
```
URL: https://cateringms.com/test-catering/admin/dashboard
Email: admin@testcatering.com
Password: TestAdmin123!
```

#### Driver User
```
URL: https://cateringms.com/test-catering/driver/dashboard
Email: driver@testcatering.com
Password: TestDriver123!
```

#### Kitchen Staff User
```
URL: https://cateringms.com/test-catering/kitchen/dashboard
Email: kitchen@testcatering.com
Password: TestKitchen123!
```

#### Cleaning Staff User
```
URL: https://cateringms.com/test-catering/cleaning/dashboard
Email: cleaning@testcatering.com
Password: TestCleaning123!
```

#### Shopping Staff User
```
URL: https://cateringms.com/test-catering/shopping/dashboard
Email: shopping@testcatering.com
Password: TestShopping123!
```

#### Client User
```
URL: https://cateringms.com/test-catering/client/my-orders
Email: client@testcatering.com
Password: TestClient123!
```

---

## Key Workflows

### 1. Company Owner Journey

```
1. Sign up at /auth/register
2. Create company (auto-generates slug)
3. Land on /[slug]/admin/dashboard
4. Add staff members via /[slug]/admin/users
5. Assign roles to each staff member
6. Start managing orders, inventory, etc.
```

### 2. Staff Member Journey

```
1. Receive email invitation from admin
2. Click link → complete registration
3. Assigned role(s) automatically applied
4. Login at /[slug]/auth/login
5. Redirected to primary role dashboard
6. Can switch roles if assigned multiple
```

### 3. Client Journey

```
1. Admin creates client in system OR
2. Client fills public quote form on company website
3. Client receives login credentials via email
4. Login at /[slug]/auth/login
5. View order history, track deliveries
6. Pay invoices online
```

### 4. Order Lifecycle Tracking

```
Order Created (Admin)
  ↓
Kitchen Assigned (Kitchen Staff marks duty)
  ↓
Food Prepared (Kitchen completes tasks)
  ↓
Driver Assigned (Admin/Auto-assignment)
  ↓
Equipment Picked Up (Driver confirms)
  ↓
Delivered to Client (GPS tracking)
  ↓
Equipment Returned (Driver logs return)
  ↓
Cleaning Verified (Cleaning staff checks inventory)
  ↓
Equipment Ready for Next Function
```

---

## Security Features

### 1. Multi-Tenancy Isolation
- Every table has `company_id`
- RLS policies enforce company boundaries
- No cross-company data leakage

### 2. Role-Based Permissions
- Fine-grained access control per role
- Department-specific features and UI
- Admin can manage all roles

### 3. Authentication
- Supabase Auth (email/password)
- OAuth options available (Google, etc.)
- Password reset flows
- Email confirmation

### 4. Data Validation
- TypeScript type safety
- Zod schema validation
- SQL constraints
- Business logic validation

---

## Next Steps for Launch

### Critical Path
1. ✅ Set up multi-tenant database schema
2. ✅ Implement company registration flow
3. ✅ Create role-based routing system
4. ✅ Build department-specific dashboards
5. ⏳ Create test data for demo company
6. ⏳ Set up email notifications
7. ⏳ Implement payment gateway integration
8. ⏳ Deploy to production
9. ⏳ Create onboarding documentation

### Testing Checklist
- [ ] Platform admin can create companies
- [ ] Company admin can add users
- [ ] Role assignments work correctly
- [ ] Multi-role switching works
- [ ] RLS policies prevent cross-company access
- [ ] All dashboards load correctly
- [ ] Order workflow completes end-to-end
- [ ] Equipment tracking works
- [ ] Payment processing works

---

## Support & Documentation

For questions or issues, contact:
- Technical Support: support@cateringms.com
- Sales: sales@cateringms.com
- Documentation: https://docs.cateringms.com

---

**Last Updated**: 2025-10-16
**Version**: 1.0
**Status**: Architecture Complete ✅
