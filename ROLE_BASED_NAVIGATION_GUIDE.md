# Role-Based Navigation System

## Overview
The CateringMS platform now has dynamic navigation menus that automatically display based on the user's assigned role.

---

## Navigation Components

### 1. **AdminNav** - Company Admin Portal
**File**: `src/components/admin/AdminNav.tsx`

**Sections:**
- **Dashboard**: Analytics, Notifications
- **Core Management**: Leads, Quotes, Orders, Calendar, Inventory
- **Team Management**: Users, Drivers, Staff Hours
- **Operations**: Job Progress, Equipment Shortages, Regions
- **Communications**: Email Templates, After-Sales, Automation, Notification Settings
- **Client Portal**: Client Search
- **Shopping & Procurement**: Shopping Dashboard
- **Branding & Settings**: White Label, System Settings
- **Finance & Billing**: Financial Dashboard, Subscription, Payment Gateways

**Color Scheme**: Purple to Pink gradient

---

### 2. **ClientNav** - Client Portal
**File**: `src/components/navigation/ClientNav.tsx`

**Sections:**
- **My Account**: Dashboard, My Orders, Track Delivery
- **Bookings**: Request Quote, My Quotes, Event Calendar
- **Payments**: Payment Schedule, Invoices
- **Support**: Messages, Notifications, Settings

**Color Scheme**: Blue to Cyan gradient

**Use Case**: Clients booking catering services, tracking orders, viewing quotes

---

### 3. **DriverNav** - Driver Portal
**File**: `src/components/navigation/DriverNav.tsx`

**Sections:**
- **Dashboard**: Overview, Notifications
- **Deliveries**: Today's Routes, All Deliveries, GPS Tracking
- **Earnings**: My Earnings, Schedule
- **Account**: My Profile, Settings

**Color Scheme**: Blue to Indigo gradient

**Use Case**: Delivery drivers managing routes, tracking earnings, viewing schedules

---

### 4. **KitchenNav** - Kitchen Portal
**File**: `src/components/navigation/KitchenNav.tsx`

**Sections:**
- **Dashboard**: Overview, Notifications
- **Production**: Prep List, Production Schedule, Duty Roster
- **Menu & Inventory**: Menu Items, Kitchen Stock
- **Settings**: Kitchen Settings

**Color Scheme**: Orange to Red gradient

**Use Case**: Kitchen staff managing prep lists, production schedules, inventory

---

### 5. **ShoppingNav** - Shopping/Procurement Portal
**File**: `src/components/navigation/ShoppingNav.tsx`

**Sections:**
- **Dashboard**: Overview, Notifications
- **Inventory**: Current Stock, Stock Alerts
- **Purchasing**: Purchase Orders, Suppliers, Invoices
- **Settings**: Shopping Settings

**Color Scheme**: Green to Emerald gradient

**Use Case**: Procurement team managing inventory, purchase orders, suppliers

---

### 6. **CleaningNav** - Cleaning Portal
**File**: `src/components/navigation/CleaningNav.tsx`

**Sections:**
- **Dashboard**: Overview, Notifications
- **Tasks & Schedules**: Cleaning Tasks, Schedules, Workflows
- **Equipment**: Equipment Verification, Damage Reports, Supplies
- **Settings**: Cleaning Settings

**Color Scheme**: Cyan to Blue gradient

**Use Case**: Cleaning staff managing equipment verification, damage tracking, schedules

---

## Dynamic Navigation Component

**File**: `src/components/DynamicNav.tsx`

This component automatically renders the correct navigation menu based on the user's role:

```typescript
import { DynamicNav } from "@/components/DynamicNav";

// In your page:
<DynamicNav companySlug={companySlug} />
```

**Logic:**
- Checks if user is authenticated
- Gets user's primary role (first role in array)
- Renders appropriate navigation component
- Defaults to ClientNav for unknown roles

---

## Role Hierarchy

1. **super_admin** → AdminNav (Platform owner)
2. **admin** → AdminNav (Company admin)
3. **client** → ClientNav (Customer)
4. **driver** → DriverNav (Delivery driver)
5. **kitchen** → KitchenNav (Kitchen staff)
6. **shopping** → ShoppingNav (Procurement)
7. **cleaning** → CleaningNav (Cleaning crew)

---

## Company Slug Support

All portal navigations support company slug routing:

```
/company/{companySlug}/portal/client/dashboard
/company/{companySlug}/portal/driver/routes
/company/{companySlug}/portal/kitchen/prep-list
```

This enables multi-tenant architecture where each company has isolated portals.

---

## Navigation Features

### Responsive Design
- **Desktop**: Fixed sidebar with full navigation
- **Mobile**: Collapsible sheet with hamburger menu

### Active State Detection
- Automatically highlights current page
- Shows active gradient background
- Adds chevron indicator

### Accessibility
- Clear section headers
- Icon + text labels
- Descriptive tooltips
- Keyboard navigation support

---

## Usage in Pages

### Option 1: Role-Specific Import
```typescript
import { AdminNav } from "@/components/admin/AdminNav";

export default function AdminDashboard() {
  return (
    <>
      <AdminNav />
      <div className="lg:pl-64 xl:pl-72">
        {/* Page content */}
      </div>
    </>
  );
}
```

### Option 2: Dynamic Navigation
```typescript
import { DynamicNav } from "@/components/DynamicNav";

export default function Dashboard() {
  return (
    <>
      <DynamicNav />
      <div className="lg:pl-64 xl:pl-72">
        {/* Page content */}
      </div>
    </>
  );
}
```

---

## Styling Consistency

All navigation components share:
- **Width**: 256px (lg), 288px (xl)
- **Position**: Fixed left sidebar
- **Shadow**: Consistent elevation
- **Border**: Right border separator
- **Scroll**: Scrollable content area
- **Z-index**: 40 (below modals)

---

## Next Steps

To fully implement role-based navigation across all pages:

1. Update all portal pages to use appropriate Nav component
2. Add company slug routing middleware
3. Create role-based page guards
4. Update authentication to set user roles correctly
5. Test navigation switching for multi-role users

---

## Multi-Role Users

For users with multiple roles (e.g., admin + driver):
- Primary role determines default navigation
- RoleSwitcher component allows switching between roles
- Navigation updates dynamically when role changes