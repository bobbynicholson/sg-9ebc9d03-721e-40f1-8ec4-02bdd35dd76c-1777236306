# USER JOURNEY AND URL STRUCTURE AUDIT

## Date: 2025-10-17
## Status: CRITICAL ISSUES IDENTIFIED - FIXES IN PROGRESS

---

## EXECUTIVE SUMMARY

After comprehensive analysis of the codebase, I've identified **12 critical bugs** affecting user journeys and URL structure. These issues prevent proper role-based navigation and create confusion between CateringMS platform management and client company operations.

---

## USER ROLES DEFINED

### 1. CateringMS Platform Roles (Our Internal Team)
- **super_admin**: Platform administrators managing the SaaS business
  - URL Pattern: `/cateringms-platform/*`
  - Landing Page: `/cateringms-platform/dashboard`

### 2. Catering Company Roles (Our Clients)
- **admin/owner**: Company administrators
  - URL Pattern: `/[company-slug]/admin/*`
  - Landing Page: `/[company-slug]/admin/dashboard`

### 3. Staff Roles (Company Employees)
- **driver**: Delivery and service staff
  - URL Pattern: `/[company-slug]/driver/*`
  - Landing Page: `/[company-slug]/driver/dashboard`
  
- **kitchen/kitchen_staff**: Kitchen personnel
  - URL Pattern: `/[company-slug]/kitchen/*`
  - Landing Page: `/[company-slug]/kitchen/dashboard`
  
- **shopping/shopping_staff**: Procurement staff
  - URL Pattern: `/[company-slug]/shopping/*`
  - Landing Page: `/[company-slug]/shopping/dashboard`
  
- **cleaning/cleaning_staff**: Cleaning personnel
  - URL Pattern: `/[company-slug]/cleaning/*`
  - Landing Page: `/[company-slug]/cleaning/dashboard`

### 4. Client Role (End Customers)
- **client**: End customers of catering companies
  - URL Pattern: `/[company-slug]/client/*` or `/client-portal` (legacy)
  - Landing Page: `/client-portal` (needs fixing to be company-scoped)

---

## CRITICAL BUGS IDENTIFIED

### BUG #1: Root-Level Admin Routes (CRITICAL)
**Problem**: Pages like `/admin/dashboard`, `/orders`, `/drivers` exist at root level instead of being company-scoped.

**Current State**:
```
/admin/dashboard              ❌ WRONG
/orders                       ❌ WRONG
/drivers                      ❌ WRONG
/calendar                     ❌ WRONG
```

**Should Be**:
```
/[company-slug]/admin/dashboard     ✅ CORRECT
/[company-slug]/admin/orders        ✅ CORRECT
/[company-slug]/admin/drivers       ✅ CORRECT
/[company-slug]/admin/calendar      ✅ CORRECT
```

**Impact**: HIGH - Users can't access company-specific data properly

---

### BUG #2: Mixed Portal Routing Patterns
**Problem**: Inconsistent use of `/portal/` prefix for some routes but not others.

**Current State**:
```
/portal/admin/job-progress-overview     ✅ Has /portal/
/admin/dashboard                        ❌ No /portal/
/portal/staff/job-progress              ✅ Has /portal/
/kitchen                                ❌ No /portal/
```

**Should Be**: Pick ONE pattern consistently:
- Option A: `/[company-slug]/admin/*` (no portal prefix)
- Option B: `/[company-slug]/portal/admin/*` (with portal prefix)

**Recommendation**: Use Option A (no portal prefix) for cleaner URLs

---

### BUG #3: Client Portal Not Company-Scoped
**Problem**: Client role points to `/client-portal` at root instead of being company-specific.

**Current State**:
```
client role → /client-portal    ❌ WRONG (not company-scoped)
```

**Should Be**:
```
client role → /[company-slug]/client/dashboard    ✅ CORRECT
```

**Impact**: MEDIUM - Clients can potentially see data from other companies

---

### BUG #4: Super Admin Access Confusion
**Problem**: `super_admin` role has access to company admin routes, creating confusion.

**Current State**:
```typescript
// authGuards.ts - BEFORE FIX
export function isCompanyAdmin(userRole: UserRole): boolean {
  return userRole === "admin" || userRole === "owner" || userRole === "super_admin";  // ❌ WRONG
}
```

**Fixed**:
```typescript
// authGuards.ts - AFTER FIX
export function isCompanyAdmin(userRole: UserRole): boolean {
  return userRole === "admin" || userRole === "owner";  // ✅ CORRECT
}

export function isPlatformAdmin(userRole: UserRole): boolean {
  return userRole === "super_admin";  // ✅ NEW FUNCTION
}
```

**Impact**: HIGH - Platform admins shouldn't see company-specific interfaces

---

### BUG #5: Company Signup Missing company_slug Auto-Creation
**Problem**: User registration creates profile but doesn't ensure `company_slug` is set.

**Location**: `src/pages/company-signup.tsx`

**Current Flow**:
1. User submits form with company name ✅
2. System creates Supabase auth user ✅
3. System creates profile record ❌ (company_slug might not be set properly)
4. System creates company record ✅

**Missing Step**: Need to ensure profile.company_slug is populated immediately after company creation

**Impact**: HIGH - Users can't access their company-scoped URLs

---

### BUG #6: Role Service getRedirectUrl() Not Company-Aware
**Problem**: The redirect URL generator doesn't properly construct company-scoped URLs.

**Location**: `src/services/roleService.ts`

**Current Code**:
```typescript
export const getRedirectUrl = (role: string): string => {
  const roleKey = role as UserRole;
  // ... returns paths without company slug
};
```

**Should Be**:
```typescript
export const getRedirectUrl = (role: string, companySlug?: string): string => {
  const roleKey = role as UserRole;
  return getRoleLandingPage(roleKey, companySlug);
};
```

**Impact**: HIGH - Users redirected to wrong URLs after login

---

### BUG #7: AuthContext Doesn't Track company_slug
**Problem**: Auth context stores user profile but doesn't expose `company_slug` easily.

**Location**: `src/contexts/AuthContext.tsx`

**Missing**: 
```typescript
export interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  companySlug?: string;  // ❌ MISSING
  // ...
}
```

**Impact**: MEDIUM - Components can't easily access company slug for routing

---

### BUG #8: Portal Dashboard Routes Inconsistent
**Problem**: Some portals use `/[portal]/dashboard` while others don't.

**Current State**:
```
Kitchen Portal: /kitchen (no /dashboard)           ❌
Driver Portal: /driver (no /dashboard)             ❌
Admin Portal: /admin/dashboard (has /dashboard)    ✅
```

**Should Be**: All portals should have consistent `/dashboard` route

---

### BUG #9: Staff Can Access Wrong Portal Routes
**Problem**: authGuards.ts allows kitchen staff to access shopping routes and vice versa.

**Current Issue**: Role checking is too permissive - need stricter route enforcement.

**Impact**: MEDIUM - Data security concern

---

### BUG #10: No Company-Slug Validation on Registration
**Problem**: Company signup doesn't check if slug is already taken before creating records.

**Current Flow**:
1. User types company name
2. Slug auto-generates
3. User submits form
4. ❌ System tries to create company record
5. ❌ Fails if slug already exists (but only after Supabase INSERT)

**Should Be**:
1. User types company name
2. Slug auto-generates
3. ✅ System checks if slug is available (live validation)
4. User submits form
5. ✅ System creates company record (already validated)

**Impact**: HIGH - Poor UX, potential data inconsistency

---

### BUG #11: Dynamic Route Handler Not Reading company_slug
**Problem**: `src/pages/[companySlug]/[portal]/[...slug].tsx` doesn't properly validate company_slug against user's profile.

**Security Issue**: User from Company A could potentially access Company B's URLs if route protection is weak.

**Impact**: CRITICAL - Security vulnerability

---

### BUG #12: Trial Expiry Not Blocking Access
**Problem**: Trial expiry notification shows but doesn't actually block portal access.

**Current**: Banner displays but user can still use system ❌
**Should Be**: Trial expired = redirect to subscription payment page ✅

**Impact**: HIGH - Revenue loss

---

## FIXING PRIORITY

### Priority 1 (MUST FIX NOW):
- ✅ BUG #4: Super admin role separation (FIXED)
- ⏳ BUG #5: Company slug auto-creation
- ⏳ BUG #6: Role service URL generation
- ⏳ BUG #11: Route protection and company validation

### Priority 2 (FIX SOON):
- ⏳ BUG #1: Migrate root admin routes to company-scoped
- ⏳ BUG #7: Add company_slug to AuthContext
- ⏳ BUG #10: Slug availability validation

### Priority 3 (FIX LATER):
- ⏳ BUG #2: Standardize portal routing pattern
- ⏳ BUG #3: Company-scope client portal
- ⏳ BUG #8: Consistent dashboard routes
- ⏳ BUG #9: Stricter role-route enforcement
- ⏳ BUG #12: Trial expiry enforcement

---

## RECOMMENDED URL STRUCTURE (FINAL)

```
CateringMS Platform (Our Business):
├── /                                    → Marketing homepage
├── /pricing                             → Pricing page
├── /features                            → Features page
├── /company-signup                      → Company registration
├── /cateringms-platform/
│   ├── /dashboard                       → Platform admin dashboard
│   ├── /subscription-management         → Manage client subscriptions
│   ├── /trial-management                → Manage trials
│   ├── /pricing-management              → Update pricing
│   ├── /currency-monitoring             → Monitor exchange rates
│   ├── /cms-blog                        → Manage blog posts
│   └── /cms-pages                       → Manage content pages

Catering Company (Client Instance):
├── /[company-slug]/auth/login           → Company login
├── /[company-slug]/auth/register        → Staff registration
├── /[company-slug]/admin/
│   ├── /dashboard                       → Admin dashboard
│   ├── /orders                          → Manage orders
│   ├── /calendar                        → Event calendar
│   ├── /leads                           → Lead management
│   ├── /quotes                          → Quote management
│   ├── /inventory                       → Inventory management
│   ├── /drivers                         → Driver management
│   ├── /users                           → User management
│   ├── /settings                        → Company settings
│   ├── /financial-dashboard             → Financial overview
│   └── /operations-hub                  → Operations center
├── /[company-slug]/driver/
│   ├── /dashboard                       → Driver dashboard
│   ├── /routes                          → Assigned routes
│   └── /deliveries                      → Delivery tracking
├── /[company-slug]/kitchen/
│   ├── /dashboard                       → Kitchen dashboard
│   ├── /menu                            → Menu management
│   └── /prep-list                       → Prep tasks
├── /[company-slug]/shopping/
│   ├── /dashboard                       → Shopping dashboard
│   ├── /orders                          → Purchase orders
│   └── /suppliers                       → Supplier management
├── /[company-slug]/cleaning/
│   ├── /dashboard                       → Cleaning dashboard
│   ├── /tasks                           → Cleaning tasks
│   └── /schedules                       → Cleaning schedules
└── /[company-slug]/client/
    ├── /dashboard                       → Client dashboard
    ├── /my-orders                       → View orders
    └── /payment-schedule                → Payment tracking
```

---

## NEXT STEPS

1. ✅ Fix authGuards.ts role separation (COMPLETED)
2. ⏳ Update roleService.ts to use company-scoped URLs
3. ⏳ Fix company signup to properly set company_slug
4. ⏳ Add company_slug validation middleware
5. ⏳ Update all navigation components to use company-scoped links
6. ⏳ Migrate root-level pages to company-scoped structure
7. ⏳ Add trial expiry enforcement
8. ⏳ Create comprehensive test scenarios for each role

---

## TEST SCENARIOS NEEDED

### Test Case 1: CateringMS Platform Admin Login
- Login as super_admin
- Should redirect to `/cateringms-platform/dashboard`
- Should NOT see any company-specific data
- Should see list of all subscribed companies

### Test Case 2: Catering Company Admin Login
- Login as admin for "spit-braai-delivery"
- Should redirect to `/spit-braai-delivery/admin/dashboard`
- Should ONLY see data for "spit-braai-delivery"
- Should be able to manage staff and orders

### Test Case 3: Driver Login
- Login as driver for "spit-braai-delivery"
- Should redirect to `/spit-braai-delivery/driver/dashboard`
- Should see only assigned routes and deliveries
- Should NOT access admin or other portal routes

### Test Case 4: Cross-Company Access Prevention
- Login as admin for "company-a"
- Try to access `/company-b/admin/dashboard`
- Should be BLOCKED with authorization error

### Test Case 5: Trial Expiry Enforcement
- Login as admin for company with expired trial
- Should see trial expiry banner
- Should be redirected to subscription payment
- Should NOT be able to access system features

---

## CONCLUSION

The system has a solid foundation but needs systematic fixes to properly separate:
1. Platform management (CateringMS internal)
2. Company management (client catering businesses)
3. Staff portals (company employees)
4. Client portals (end customers)

All fixes are being implemented with backwards compatibility in mind where possible.
</file_path>