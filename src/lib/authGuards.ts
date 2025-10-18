import { UserRole } from "@/types/app";
import { roleService } from "@/services/roleService";
import { companyService } from "@/services/companyService";
import type { Profile } from "@/services/profileService";

// Role-based route permissions - UPDATED TO MATCH NEW URL STRUCTURE
export const ROLE_ROUTES: Record<UserRole, string[]> = {
  // SUPER_ADMIN: CateringMS Platform Admin (access to /cateringms-platform/*)
  super_admin: [
    "/cateringms-platform",
    "/cateringms-platform/dashboard",
    "/cateringms-platform/subscription-management",
    "/cateringms-platform/pricing-management",
    "/cateringms-platform/currency-monitoring",
    "/cateringms-platform/trial-management",
    "/cateringms-platform/cms-blog",
    "/cateringms-platform/cms-pages",
    "/", // Can access main site
    "/pricing",
    "/features",
    "/contact",
    "/support",
  ],
  
  // ADMIN/OWNER: Catering Company Admin (access to /[company-slug]/admin/*)
  admin: [
    "/admin", // Will be prefixed with company slug in middleware
    "/users",
    "/settings",
    "/onboarding",
    "/leads",
    "/quotes",
    "/calendar",
    "/notifications",
    "/integrations",
    "/orders",
    "/inventory",
    "/drivers",
    "/kitchen",
    "/shopping",
    "/cleaning",
    "/tracking/admin",
    "/email-templates",
    "/after-sales-emails",
    "/email-automation-dashboard",
    "/email-automation-settings",
    "/regions",
    "/order-assignments",
    "/payment-gateways",
    "/equipment-shortages",
    "/white-label",
    "/subscription",
    "/client-search",
    "/staff-hours",
    "/financial-dashboard",
    "/driver-management",
    "/kitchen-duty-tracking",
    "/operations-hub",
    "/operations-standards",
    "/portal/admin/job-progress-overview",
    "/portal/admin/notification-settings",
  ],
  
  owner: [ // Same as admin
    "/admin",
    "/users",
    "/settings",
    "/onboarding",
    "/leads",
    "/quotes",
    "/calendar",
    "/notifications",
    "/integrations",
    "/orders",
    "/inventory",
    "/drivers",
    "/kitchen",
    "/shopping",
    "/cleaning",
    "/tracking/admin",
    "/email-templates",
    "/after-sales-emails",
    "/email-automation-dashboard",
    "/email-automation-settings",
    "/regions",
    "/order-assignments",
    "/payment-gateways",
    "/equipment-shortages",
    "/white-label",
    "/subscription",
    "/client-search",
    "/staff-hours",
    "/financial-dashboard",
    "/driver-management",
    "/kitchen-duty-tracking",
    "/operations-hub",
    "/operations-standards",
    "/portal/admin/job-progress-overview",
    "/portal/admin/notification-settings",
  ],
  
  // KITCHEN ROLES
  kitchen: [
    "/kitchen",
    "/orders",
    "/inventory",
    "/calendar",
    "/portal/staff/job-progress",
    "/notifications"
  ],
  kitchen_staff: [
    "/kitchen",
    "/orders",
    "/inventory",
    "/calendar",
    "/portal/staff/job-progress",
    "/notifications"
  ],
  
  // SHOPPING ROLES
  shopping: [
    "/shopping",
    "/inventory",
    "/orders",
    "/calendar",
    "/portal/staff/job-progress",
    "/notifications"
  ],
  shopping_staff: [
    "/shopping",
    "/inventory",
    "/orders",
    "/calendar",
    "/portal/staff/job-progress",
    "/notifications"
  ],
  
  // DRIVER ROLE
  driver: [
    "/driver",
    "/drivers",
    "/tracking/driver",
    "/orders",
    "/calendar",
    "/portal/staff/job-progress",
    "/notifications"
  ],
  
  // CLEANING ROLES
  cleaning: [
    "/cleaning",
    "/orders",
    "/calendar",
    "/portal/staff/job-progress",
    "/notifications"
  ],
  cleaning_staff: [
    "/cleaning",
    "/orders",
    "/calendar",
    "/portal/staff/job-progress",
    "/notifications"
  ],
  
  // CLIENT ROLE
  client: [
    "/client-portal",
    "/tracking/client",
    "/portal/client/my-orders",
    "/portal/client/payment-schedule",
    "/client/subscription-invoices",
    "/notifications"
  ],
};

// Role display names
export const ROLE_NAMES: Record<UserRole, string> = {
  admin: "Administrator",
  owner: "Owner",
  super_admin: "Platform Administrator",
  kitchen: "Kitchen Manager",
  kitchen_staff: "Kitchen Staff",
  shopping: "Shopping Manager",
  shopping_staff: "Shopping Staff",
  driver: "Driver/Waiter",
  cleaning: "Cleaning Manager",
  cleaning_staff: "Cleaning Staff",
  client: "Client",
};

// Default landing pages for each role - FIXED TO USE ACTUAL WORKING PORTAL URLS
export const ROLE_LANDING_PAGES: Record<UserRole, (companySlug?: string) => string> = {
  super_admin: () => "/cateringms-platform/dashboard",
  admin: (slug) => `/${slug || "my-company"}/admin/dashboard`,
  owner: (slug) => `/${slug || "my-company"}/admin/dashboard`,
  
  // STAFF PORTALS: Use actual working URLs (not company-scoped)
  kitchen: () => "/kitchen",
  kitchen_staff: () => "/kitchen",
  shopping: () => "/shopping",
  shopping_staff: () => "/shopping",
  driver: () => "/drivers",
  cleaning: () => "/cleaning",
  cleaning_staff: () => "/cleaning",
  
  client: () => "/client-portal",
};

/**
 * Check if a user with a specific role can access a route
 */
export function canAccessRoute(userRole: UserRole, pathname: string): boolean {
  const allowedRoutes = ROLE_ROUTES[userRole];
  
  // Check exact match
  if (allowedRoutes.includes(pathname)) {
    return true;
  }
  
  // Check if pathname starts with any allowed route (for nested routes)
  return allowedRoutes.some(route => pathname.startsWith(route));
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
  if (!profile) return false;
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
  return userRole === "super_admin";
}

/**
 * Check if role is a company admin role
 */
export function isCompanyAdmin(userRole: UserRole): boolean {
  return userRole === "admin" || userRole === "owner";
}

/**
 * Check if role is a staff role (non-admin, non-client)
 */
export function isStaffRole(userRole: UserRole): boolean {
  return [
    "driver",
    "kitchen",
    "kitchen_staff",
    "shopping",
    "shopping_staff",
    "cleaning",
    "cleaning_staff"
  ].includes(userRole);
}
