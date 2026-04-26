# Layout Component Usage Guide

## Overview
The Layout component provides a centralized, role-based layout system for the entire application. It dynamically renders navigation based on user role and provides consistent page structure.

## Components

### 1. `Layout` (Base Component)
Main layout component with full control over all elements.

```tsx
import { Layout } from "@/components/Layout";

<Layout 
  showNav={true}        // Show role-based navigation
  showHeader={true}     // Show public header
  showFooter={true}     // Show footer
  maxWidth="7xl"        // Container max-width
>
  {children}
</Layout>
```

### 2. `PortalLayout` (Recommended for Portal Pages)
Pre-configured for authenticated portal pages - shows navigation, no header/footer.

```tsx
import { PortalLayout } from "@/components/Layout";

export default function AdminDashboard() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
      <PortalLayout maxWidth="7xl">
        <h1>Admin Dashboard</h1>
        {/* Your page content */}
      </PortalLayout>
    </ProtectedRoute>
  );
}
```

### 3. `PublicLayout` (For Marketing Pages)
Pre-configured for public pages - shows header/footer, no navigation.

```tsx
import { PublicLayout } from "@/components/Layout";

export default function PricingPage() {
  return (
    <PublicLayout>
      <h1>Pricing</h1>
      {/* Your marketing content */}
    </PublicLayout>
  );
}
```

### 4. `MinimalLayout` (For Special Pages)
No nav/header/footer - for auth pages, error pages, etc.

```tsx
import { MinimalLayout } from "@/components/Layout";

export default function LoginPage() {
  return (
    <MinimalLayout>
      {/* Login form */}
    </MinimalLayout>
  );
}
```

## Role-Based Navigation Mapping

The `DynamicNav` component automatically renders the correct navigation based on user role:

| Role | Navigation Component |
|------|---------------------|
| `super_admin` | AdminNav |
| `company_admin` | AdminNav |
| `admin` | AdminNav |
| `owner` | AdminNav |
| `kitchen_staff` | KitchenNav |
| `shopping_staff` | ShoppingNav |
| `driver` | DriverNav |
| `cleaning_staff` | CleaningNav |
| `client` | ClientNav |

## Implementation Examples

### Admin Portal Page
```tsx
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalLayout } from "@/components/Layout";
import { UserRole } from "@/types/app";

export default function AdminLeadsPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <PortalLayout>
        <div className="space-y-6">
          <h1 className="text-3xl font-bold">Leads</h1>
          {/* Page content */}
        </div>
      </PortalLayout>
    </ProtectedRoute>
  );
}
```

### Kitchen Staff Portal Page
```tsx
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalLayout } from "@/components/Layout";
import { UserRole } from "@/types/app";

export default function KitchenDashboard() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.KITCHEN_STAFF]}>
      <PortalLayout>
        <h1>Kitchen Dashboard</h1>
        {/* Kitchen-specific content */}
      </PortalLayout>
    </ProtectedRoute>
  );
}
```

### Client Portal Page
```tsx
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalLayout } from "@/components/Layout";
import { UserRole } from "@/types/app";

export default function ClientDashboard() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.CLIENT]}>
      <PortalLayout maxWidth="6xl">
        <h1>My Dashboard</h1>
        {/* Client dashboard content */}
      </PortalLayout>
    </ProtectedRoute>
  );
}
```

## Features

### Automatic Auth Loading State
Layout shows a centered loading spinner while auth is initializing:
```tsx
if (loading) {
  return <LoadingSpinner />;
}
```

### Trial Expiry Banner
Automatically shows for authenticated users with trial status.

### Responsive Container Widths
Choose from: `full`, `7xl`, `6xl`, `5xl`, `4xl`

### Conditional Elements
- Header: Shows for public pages, hidden for authenticated portals
- Navigation: Shows correct nav per role for authenticated users
- Footer: Configurable per page type

## Migration Strategy

### Before (Old Pattern)
```tsx
export default function SomePage() {
  return (
    <>
      <AdminNav />
      <main className="container mx-auto px-4 py-8">
        {/* content */}
      </main>
    </>
  );
}
```

### After (New Pattern)
```tsx
export default function SomePage() {
  return (
    <PortalLayout>
      {/* content - navigation is automatic */}
    </PortalLayout>
  );
}
```

## Benefits

1. **DRY Principle**: No duplicate navigation logic across pages
2. **Type Safety**: Role mapping is centralized and type-safe
3. **Consistency**: All portals use same layout structure
4. **Maintainability**: Update navigation logic in one place
5. **Loading States**: Automatic auth loading handling
6. **Responsive**: Consistent responsive behavior across app

## Testing

All 8 roles automatically get correct navigation:
- super_admin → AdminNav with platform access
- company_admin/admin/owner → AdminNav with company features
- kitchen_staff → KitchenNav
- shopping_staff → ShoppingNav
- driver → DriverNav
- cleaning_staff → CleaningNav
- client → ClientNav