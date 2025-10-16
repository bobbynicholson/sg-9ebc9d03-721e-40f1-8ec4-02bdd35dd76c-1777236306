import { UserRole } from "@/types";
import type { Profile } from "@/services/profileService";

// Role-based route permissions
export const ROLE_ROUTES: Record<UserRole, string[]> = {
  admin: [
    "/admin",
    "/admin/dashboard",
    "/admin/users",
    "/admin/settings",
    "/admin/email-templates",
    "/admin/after-sales-emails",
    "/admin/email-automation-dashboard",
    "/admin/email-automation-settings",
    "/admin/regions",
    "/admin/order-assignments",
    "/admin/payment-gateways",
    "/cateringms-platform/cms-blog",
    "/cateringms-platform/cms-pages",
    "/admin/equipment-shortages",
    "/admin/white-label",
    "/admin/subscription",
    "/admin/catering-ms-dashboard",
    "/admin/currency-monitoring",
    "/admin/client-search",
    "/admin/staff-hours",
    "/admin/financial-dashboard",
    "/portal/admin/job-progress-overview",
    "/portal/admin/notification-settings",
    "/orders",
    "/quotes",
    "/calendar",
    "/inventory",
    "/leads",
    "/drivers",
    "/kitchen",
    "/shopping",
    "/cleaning",
    "/tracking/admin",
    "/notifications"
  ],
  owner: [ // same as admin
    "/admin",
    "/admin/dashboard",
    "/admin/users",
    "/admin/settings",
    "/admin/email-templates",
    "/admin/after-sales-emails",
    "/admin/email-automation-dashboard",
    "/admin/email-automation-settings",
    "/admin/regions",
    "/admin/order-assignments",
    "/admin/payment-gateways",
    "/cateringms-platform/cms-blog",
    "/cateringms-platform/cms-pages",
    "/admin/equipment-shortages",
    "/admin/white-label",
    "/admin/subscription",
    "/admin/catering-ms-dashboard",
    "/admin/currency-monitoring",
    "/admin/client-search",
    "/admin/staff-hours",
    "/admin/financial-dashboard",
    "/portal/admin/job-progress-overview",
    "/portal/admin/notification-settings",
    "/orders",
    "/quotes",
    "/calendar",
    "/inventory",
    "/leads",
    "/drivers",
    "/kitchen",
    "/shopping",
    "/cleaning",
    "/tracking/admin",
    "/notifications"
  ],
  super_admin: [ // same as admin
    "/admin",
    "/admin/dashboard",
    "/admin/users",
    "/admin/settings",
    "/admin/email-templates",
    "/admin/after-sales-emails",
    "/admin/email-automation-dashboard",
    "/admin/email-automation-settings",
    "/admin/regions",
    "/admin/order-assignments",
    "/admin/payment-gateways",
    "/cateringms-platform/cms-blog",
    "/cateringms-platform/cms-pages",
    "/admin/equipment-shortages",
    "/admin/white-label",
    "/admin/subscription",
    "/admin/catering-ms-dashboard",
    "/admin/currency-monitoring",
    "/admin/client-search",
    "/admin/staff-hours",
    "/admin/financial-dashboard",
    "/portal/admin/job-progress-overview",
    "/portal/admin/notification-settings",
    "/orders",
    "/quotes",
    "/calendar",
    "/inventory",
    "/leads",
    "/drivers",
    "/kitchen",
    "/shopping",
    "/cleaning",
    "/tracking/admin",
    "/notifications"
  ],
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
  driver: [
    "/drivers",
    "/tracking/driver",
    "/orders",
    "/calendar",
    "/portal/staff/job-progress",
    "/notifications"
  ],
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
  super_admin: "Super Admin",
  kitchen: "Kitchen Team",
  kitchen_staff: "Kitchen Staff",
  shopping: "Shopping Team",
  shopping_staff: "Shopping Staff",
  driver: "Driver",
  cleaning: "Cleaning Team",
  cleaning_staff: "Cleaning Staff",
  client: "Client",
};

// Default landing pages for each role
export const ROLE_LANDING_PAGES: Record<UserRole, string> = {
  admin: "/admin/dashboard",
  owner: "/admin/dashboard",
  super_admin: "/admin/dashboard",
  kitchen: "/kitchen",
  kitchen_staff: "/kitchen",
  shopping: "/shopping",
  shopping_staff: "/shopping",
  driver: "/drivers",
  cleaning: "/cleaning",
  cleaning_staff: "/cleaning",
  client: "/client-portal",
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
export function getRoleLandingPage(userRole: UserRole): string {
  return ROLE_LANDING_PAGES[userRole];
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
