import { UserRole } from "@/types/app";
import type { Profile } from "@/services/profileService";

// Role-based route permissions
export const ROLE_ROUTES: Record<UserRole, string[]> = {
  [UserRole.SUPER_ADMIN]: [
    "/super-admin/*",
    "/admin/*",
    "/admin/platform/*",
    "/team-portal/*",
    "/client-portal/*",
    "*",
  ],
  [UserRole.COMPANY_ADMIN]: [
    "/admin/*",
    "/team-portal/*",
  ],
  [UserRole.ADMIN]: [
    "/admin/dashboard",
    "/admin/leads",
    "/admin/leads/*",
    "/admin/quotes",
    "/admin/quotes/*",
    "/admin/orders",
    "/admin/calendar",
    "/admin/inventory",
    "/admin/inventory-tracking",
    "/admin/inventory-recipes",
    "/admin/users",
    "/admin/drivers",
    "/admin/driver-management",
    "/admin/staff-hours",
    "/admin/tracking",
    "/admin/route-planning",
    "/admin/equipment-shortages",
    "/admin/regions",
    "/admin/email-templates",
    "/admin/after-sales-emails",
    "/admin/email-automation-dashboard",
    "/admin/email-automation-settings",
    "/admin/notification-settings",
    "/admin/notifications",
    "/admin/client-search",
    "/admin/white-label",
    "/admin/integrations",
    "/admin/settings",
    "/admin/onboarding",
    "/team-portal/*",
  ],
  [UserRole.KITCHEN_STAFF]: [
    "/team-portal/kitchen/*",
    "/team-portal/general/*",
  ],
  [UserRole.SHOPPING_STAFF]: [
    "/team-portal/shopping/*",
    "/team-portal/general/*",
  ],
  [UserRole.DRIVER]: [
    "/team-portal/driver/*",
    "/team-portal/general/*",
  ],
  [UserRole.CLEANING_STAFF]: [
    "/team-portal/cleaning/*",
    "/team-portal/general/*",
  ],
  [UserRole.CLIENT]: [
    "/client-portal/*",
  ],
};

// Admin roles that can access admin dashboard
export const ADMIN_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.COMPANY_ADMIN,
  UserRole.ADMIN,
];

// Roles with full company access (all data, all operations)
export const FULL_COMPANY_ACCESS_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.COMPANY_ADMIN,
];

// Roles with company access but restricted finance (no payment gateways, subscription, financial dashboard)
export const RESTRICTED_COMPANY_ACCESS_ROLES: UserRole[] = [
  UserRole.ADMIN,
];

// Finance-only routes (company_admin, owner, super_admin only)
export const FINANCE_ROUTES = [
  "/admin/financial-dashboard",
  "/admin/subscription",
  "/admin/payment-gateways",
  "/admin/invoices",
];

// Role display names
export const ROLE_NAMES: Record<UserRole, string> = {
  [UserRole.ADMIN]: "Administrator",
  [UserRole.SUPER_ADMIN]: "Platform Administrator",
  [UserRole.COMPANY_ADMIN]: "Company Administrator",
  [UserRole.KITCHEN_STAFF]: "Kitchen Staff",
  [UserRole.SHOPPING_STAFF]: "Shopping Staff",
  [UserRole.DRIVER]: "Driver/Waiter",
  [UserRole.CLEANING_STAFF]: "Cleaning Staff",
  [UserRole.CLIENT]: "Client",
};

// Default landing pages for each role
// Slug-prefixed landings only for roles that have /[company_slug]/ wrapper pages.
// Staff team-portal and client-portal pages currently live under non-slug paths only,
// so prefixing them would 404. Revisit when wrappers exist.
export const ROLE_LANDING_PAGES: Record<UserRole, (companySlug?: string) => string> = {
  [UserRole.SUPER_ADMIN]: () => "/admin/platform/dashboard",
  [UserRole.COMPANY_ADMIN]: (slug) => slug ? `/${slug}/admin/dashboard` : "/admin/dashboard",
  [UserRole.ADMIN]: (slug) => slug ? `/${slug}/admin/dashboard` : "/admin/dashboard",
  [UserRole.KITCHEN_STAFF]: () => "/team-portal/kitchen/dashboard",
  [UserRole.SHOPPING_STAFF]: () => "/team-portal/shopping/dashboard",
  [UserRole.DRIVER]: () => "/team-portal/driver/dashboard",
  [UserRole.CLEANING_STAFF]: () => "/team-portal/cleaning/dashboard",
  [UserRole.CLIENT]: () => "/client-portal/dashboard",
};

// String-keyed landing-page map covering DB role strings + legacy aliases.
// Edge-safe (no service imports). Use getLandingPageForRoleString from middleware
// and any callsite that has a raw role string rather than a UserRole enum value.
export const ROLE_LANDING_PAGES_BY_STRING: Record<string, (slug?: string) => string> = {
  super_admin: () => "/admin/platform/dashboard",
  company_admin: (slug) => slug ? `/${slug}/admin/dashboard` : "/admin/dashboard",
  admin: (slug) => slug ? `/${slug}/admin/dashboard` : "/admin/dashboard",
  owner: (slug) => slug ? `/${slug}/admin/dashboard` : "/admin/dashboard",
  kitchen_staff: () => "/team-portal/kitchen/dashboard",
  kitchen: () => "/team-portal/kitchen/dashboard",
  shopping_staff: () => "/team-portal/shopping/dashboard",
  shopping: () => "/team-portal/shopping/dashboard",
  driver: () => "/team-portal/driver/dashboard",
  cleaning_staff: () => "/team-portal/cleaning/dashboard",
  cleaning: () => "/team-portal/cleaning/dashboard",
  client: () => "/client-portal/dashboard",
};

export const DEFAULT_LANDING_PAGE = "/admin/dashboard";

/**
 * Single source of truth for "where does role X land after auth?".
 * Handles both UserRole enum values and raw DB role strings (with legacy aliases).
 * Falls back to DEFAULT_LANDING_PAGE when role is unknown.
 */
export function getLandingPageForRoleString(role: string | null | undefined, companySlug?: string): string {
  if (!role) return DEFAULT_LANDING_PAGE;
  const fn = ROLE_LANDING_PAGES_BY_STRING[role];
  return fn ? fn(companySlug) : DEFAULT_LANDING_PAGE;
}

/**
 * Check if a user with a specific role can access a route
 */
export function canAccessRoute(userRole: UserRole, pathname: string): boolean {
  // Check if this is a finance route
  const isFinanceRoute = FINANCE_ROUTES.some(route => pathname === route || pathname.startsWith(route + "/"));
  
  // Block admin role from finance routes
  if (isFinanceRoute && userRole === UserRole.ADMIN) {
    return false;
  }
  
  const allowedRoutes = ROLE_ROUTES[userRole];
  
  if (!allowedRoutes) {
    return false;
  }

  // Check if user has wildcard access
  if (allowedRoutes.includes("*")) {
    return true;
  }

  // Check if pathname matches any allowed route pattern
  return allowedRoutes.some((route) => {
    if (route.endsWith("/*")) {
      const baseRoute = route.slice(0, -2);
      return pathname.startsWith(baseRoute);
    }
    return pathname === route || pathname.startsWith(route + "/");
  });
}

/**
 * Check if user is an admin (super_admin, company_admin, admin, or owner)
 */
export function isAdmin(userRole: UserRole): boolean {
  return ADMIN_ROLES.includes(userRole);
}

/**
 * Check if user can access admin dashboard
 */
export function canAccessAdminDashboard(userRole: UserRole): boolean {
  return isAdmin(userRole);
}

/**
 * Check if user can access financial features
 */
export function canAccessFinance(userRole: UserRole): boolean {
  return FULL_COMPANY_ACCESS_ROLES.includes(userRole);
}

/**
 * Check if user has full company access (including finance)
 */
export function hasFullCompanyAccess(userRole: UserRole): boolean {
  return FULL_COMPANY_ACCESS_ROLES.includes(userRole);
}

/**
 * Check if user has restricted company access (no finance)
 */
export function hasRestrictedCompanyAccess(userRole: UserRole): boolean {
  return RESTRICTED_COMPANY_ACCESS_ROLES.includes(userRole);
}

/**
 * Get the default landing page for a user role
 */
export function getRoleLandingPage(userRole: UserRole, companySlug?: string): string {
  const landingPageFn = ROLE_LANDING_PAGES[userRole];
  return landingPageFn(companySlug);
}

/**
 * Get role display name
 */
export function getRoleName(userRole: UserRole): string {
  return ROLE_NAMES[userRole];
}

/**
 * Check if user has required role(s)
 */
export function hasRole(profile: Profile | null, ...requiredRoles: UserRole[]): boolean {
  if (!profile || !profile.role) {
    return false;
  }

  return requiredRoles.includes(profile.role as UserRole);
}

/**
 * Get unauthorized message based on role
 */
export function getUnauthorizedMessage(userRole: UserRole, attemptedRoute: string): string {
  return `Access Denied: Your ${getRoleName(userRole)} account does not have permission to access ${attemptedRoute}. Please contact your administrator if you believe this is an error.`;
}

/**
 * Check if role is a CateringMS platform admin role
 */
export function isPlatformAdmin(userRole: UserRole): boolean {
  return userRole === UserRole.SUPER_ADMIN;
}

/**
 * Check if role is a company admin role (including admin with restricted access)
 */
export function isCompanyAdmin(userRole: UserRole): boolean {
  return userRole === UserRole.COMPANY_ADMIN || 
         userRole === UserRole.ADMIN || 
         userRole === UserRole.SUPER_ADMIN;
}

/**
 * Check if role is a staff role (non-admin, non-client)
 */
export function isStaffRole(userRole: UserRole): boolean {
  const staffRoles: UserRole[] = [
    UserRole.KITCHEN_STAFF,
    UserRole.SHOPPING_STAFF,
    UserRole.DRIVER,
    UserRole.CLEANING_STAFF,
  ];
  return staffRoles.includes(userRole);
}